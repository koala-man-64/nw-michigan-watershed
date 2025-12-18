# function_app.py
# v2 Function App with:
#   - hello       : simple greeting
#   - read_csv    : get blob as CSV/JSON
#   - log_event   : write UI events to SQL Server (pyodbc default, pymssql fallback)
#
# SQL env (pick one set):
#   - SQLSERVER_CONNSTR = "Driver={ODBC Driver 18 for SQL Server};Server=tcp:...;Database=...;Uid=...;Pwd=...;Encrypt=yes;TrustServerCertificate=no;Connection Timeout=30;"
#   or discrete vars (ODBC):
#       SQL_SERVER, SQL_DATABASE, SQL_USERNAME, SQL_PASSWORD
#       [optional] SQL_PORT=1433, SQL_ENCRYPT=yes, SQL_TRUST_SERVER_CERT=no, SQL_CONN_TIMEOUT=30, SQL_ODBC_DRIVER="ODBC Driver 18 for SQL Server"
#   - Driver choice:
#       SQL_DRIVER=pyodbc (default) or SQL_DRIVER=pymssql
#
# Storage env for read_csv (pick one auth path):
#   - BLOB_CONN  (connection string), or
#   - STORAGE_ACCOUNT_NAME + SAS_TOKEN, or
#   - STORAGE_ACCOUNT_URL (uses default creds/MSI)
#   plus BLOB_CONTAINER, BLOB_NAME (defaults)

import base64
import csv
import datetime
import io
import json
import logging
import os
from typing import Optional

import azure.functions as func
from azure.storage.blob import BlobServiceClient
from azure.core.credentials import AzureSasCredential
from azure.core.exceptions import ResourceNotFoundError

# Optional extras
try:
    import pandas as pd
except Exception:
    pd = None
try:
    from azure.identity import DefaultAzureCredential
except Exception:
    DefaultAzureCredential = None
try:
    import debugpy
except Exception:
    debugpy = None

# Attempt drivers
try:
    import pyodbc  # preferred
except Exception:
    pyodbc = None
try:
    import pymssql  # fallback
except Exception:
    pymssql = None

# ---------------------------
# CORS (restricted; SWA is usually same-origin)
# ---------------------------
if os.getenv("ENABLE_DEBUGPY") == "1" and debugpy is not None:
    host = os.getenv("DEBUGPY_HOST", "127.0.0.1")
    port = int(os.getenv("DEBUGPY_PORT", "5678"))
    try:
        debugpy.listen((host, port))
        logging.info("debugpy listening on %s:%s", host, port)
    except RuntimeError:
        pass  # already listening
    if os.getenv("WAIT_FOR_DEBUGGER") == "1":
        logging.info("Waiting for debugger to attach...")
        debugpy.wait_for_client()

def _allowed_origins() -> set[str]:
    raw = os.getenv("CORS_ALLOWED_ORIGINS", "").strip()
    if not raw:
        # Safe dev defaults (no wildcard).
        return {"http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:4280"}
    return {o.strip() for o in raw.split(",") if o.strip()}

def _cors_headers(req: func.HttpRequest) -> dict:
    origin = req.headers.get("Origin")
    if not origin:
        return {}
    if origin not in _allowed_origins():
        return {}
    return {
        "Access-Control-Allow-Origin": origin,
        "Vary": "Origin",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
    }

# ---------------------------
# Storage helpers
# ---------------------------
def _normalize_sas(token: Optional[str]) -> Optional[AzureSasCredential]:
    if not token:
        return None
    t = token.strip()
    if t.startswith("?"):
        t = t[1:]
    return AzureSasCredential(t)

def _bsc() -> BlobServiceClient:
    conn = os.getenv("BLOB_CONN")
    if conn:
        logging.info("Auth mode: connection string")
        return BlobServiceClient.from_connection_string(conn)
    acct = os.getenv("STORAGE_ACCOUNT_NAME")
    sas  = _normalize_sas(os.getenv("SAS_TOKEN"))
    if acct and sas:
        logging.info("Auth mode: account + SAS")
        return BlobServiceClient(
            account_url=f"https://{acct}.blob.core.windows.net",
            credential=sas
        )
    url = os.getenv("STORAGE_ACCOUNT_URL")
    if url:
        if DefaultAzureCredential is None:
            raise RuntimeError("STORAGE_ACCOUNT_URL set but azure-identity is missing; add 'azure-identity' or use BLOB_CONN.")
        logging.info("Auth mode: account URL (DefaultAzureCredential)")
        return BlobServiceClient(account_url=url, credential=DefaultAzureCredential())
    raise RuntimeError("Missing storage auth: set BLOB_CONN or (STORAGE_ACCOUNT_NAME+SAS_TOKEN) or STORAGE_ACCOUNT_URL")

def _public_container() -> str:
    return os.getenv("PUBLIC_BLOB_CONTAINER") or os.getenv("BLOB_CONTAINER") or "nwmiws"

def _public_blobs() -> set[str]:
    raw = os.getenv("PUBLIC_BLOBS", "").strip()
    if not raw:
        return {"locations.csv", "info.csv", "NWMIWS_Site_Data_testing_varied.csv"}
    return {b.strip() for b in raw.split(",") if b.strip()}

def _allow_arbitrary_blob_reads() -> bool:
    return os.getenv("ALLOW_ARBITRARY_BLOB_READS", "0").strip() == "1"

def _params(req: func.HttpRequest) -> dict:
    qs   = {k.lower(): v for k, v in req.params.items()}
    body = {}
    try:
        if req.get_body():
            body = json.loads(req.get_body() or b"{}")
            if not isinstance(body, dict):
                body = {}
    except Exception:
        body = {}
    pick = lambda k, env=None, d=None: qs.get(k) or body.get(k) or os.getenv((env or k).upper(), d)
    return {
        "container": pick("container", "BLOB_CONTAINER"),
        "blob":      pick("blob", "BLOB_NAME"),
        "format":   (pick("format") or "csv").lower(),  # csv | json
    }

def _get_swa_principal(req: func.HttpRequest) -> Optional[dict]:
    b64 = req.headers.get("x-ms-client-principal")
    if not b64:
        return None
    try:
        decoded = base64.b64decode(b64).decode("utf-8")
        data = json.loads(decoded)
        return data if isinstance(data, dict) else None
    except Exception:
        return None

def _require_swa_role(req: func.HttpRequest, required_role: str) -> bool:
    principal = _get_swa_principal(req)
    if not principal:
        return False
    roles = principal.get("userRoles") or []
    return required_role in roles

def _truncate(value: str, max_len: int) -> str:
    s = value or ""
    return s if len(s) <= max_len else s[:max_len]

def _csv_to_rows(data: bytes):
    if pd is not None:
        try:
            df = pd.read_csv(io.BytesIO(data))
            return df.to_dict(orient="records")
        except Exception as e:
            logging.warning("Pandas failed to parse CSV; falling back: %s", e)
    try:
        text = data.decode("utf-8")
    except Exception:
        text = data.decode("latin-1")
    reader = csv.DictReader(io.StringIO(text))
    return [dict(row) for row in reader]

# ---------------------------
# SQL helpers
# ---------------------------
def _build_odbc_conn_str() -> str:
    full = os.getenv("SQLSERVER_CONNSTR")
    if full:
        return full
    driver = os.getenv("SQL_ODBC_DRIVER", "ODBC Driver 18 for SQL Server")
    server = os.getenv("SQL_SERVER")
    database = os.getenv("SQL_DATABASE")
    user = os.getenv("SQL_USERNAME")
    password = os.getenv("SQL_PASSWORD")
    port = os.getenv("SQL_PORT", "1433")
    encrypt = os.getenv("SQL_ENCRYPT", "yes")
    trust = os.getenv("SQL_TRUST_SERVER_CERT", "no")
    timeout = os.getenv("SQL_CONN_TIMEOUT", "30")
    missing = [k for k,v in {"SQL_SERVER":server,"SQL_DATABASE":database,"SQL_USERNAME":user,"SQL_PASSWORD":password}.items() if not v]
    if missing:
        raise RuntimeError(f"Missing required SQL env vars for ODBC: {', '.join(missing)}")
    return (
        f"Driver={{{driver}}};"
        f"Server=tcp:{server},{port};"
        f"Database={database};"
        f"Uid={user};"
        f"Pwd={password};"
        f"Encrypt={encrypt};"
        f"TrustServerCertificate={trust};"
        f"Connection Timeout={timeout};"
    )

def get_connection_params():
    try:
        if os.environ.get("LOCAL_DEVELOPMENT", "true").lower() == "true":
            with open("local.settings.json", "r") as f:
                local_settings = json.load(f)
            values     = local_settings.get("Values", {})
            raw_server = values.get("SQL_SERVER")
            database   = values.get("SQL_DATABASE")
            username   = values.get("SQL_USERNAME")
            password   = values.get("SQL_PASSWORD")
        else:
            raw_server = os.environ["SQL_SERVER"]
            database   = os.environ["SQL_DATABASE"]
            username   = os.environ["SQL_USERNAME"]
            password   = os.environ["SQL_PASSWORD"]

        # Remove "tcp:" prefix if present
        if raw_server.startswith("tcp:"):
            raw_server = raw_server[4:]

        # Split server and port if a comma exists
        if "," in raw_server:
            server, port_str = raw_server.split(",", 1)
            port = int(port_str)
        else:
            server = raw_server
            port = 1433  # default SQL Server port

        connection_params = {
            "server": server,
            "user": username,
            "password": password,
            "database": database,
            "port": port
        }
        return connection_params
    except Exception as e:
        raise Exception(f"ERROR retrieving connection parameters: {str(e)}")


def _connect_sql():
    choice = os.getenv("SQL_DRIVER", "pyodbc").lower()
    if choice == "pymssql":
        if pymssql is None:
            raise RuntimeError("SQL_DRIVER=pymssql but pymssql is not installed.")
        server = os.getenv("SQL_SERVER")
        database = os.getenv("SQL_DATABASE")
        user = os.getenv("SQL_USERNAME")
        password = os.getenv("SQL_PASSWORD")
        port = int(os.getenv("SQL_PORT", "1433"))
        missing = [k for k,v in {"SQL_SERVER":server,"SQL_DATABASE":database,"SQL_USERNAME":user,"SQL_PASSWORD":password}.items() if not v]
        if missing:
            raise RuntimeError(f"Missing required SQL env vars for pymssql: {', '.join(missing)}")
        return pymssql.connect(server=server, user=user, password=password, database=database, port=port)
    # default: pyodbc
    if pyodbc is None:
        raise RuntimeError("pyodbc is not installed and SQL_DRIVER is not set to 'pymssql'.")
    conn_str = _build_odbc_conn_str()
    return pyodbc.connect(conn_str)

# ---------------------------
# v2 FunctionApp + routes
# ---------------------------
app = func.FunctionApp()

@app.function_name(name="chat_rudy")
@app.route(route="chat-rudy", methods=["POST", "OPTIONS"], auth_level=func.AuthLevel.ANONYMOUS)
def chat_rudy(req: func.HttpRequest) -> func.HttpResponse:
    logging.info("Received chat request.")
    if req.method == "OPTIONS":
        return func.HttpResponse(status_code=204, headers=_cors_headers(req))

    try:
        req_body = req.get_json()
    except ValueError:
        req_body = {}

    user_message = (req_body.get("message") or "").strip()

    # Hardcoded response for now; keep shape stable for future upgrades.
    reply = (
        "Hi! I’m Rudy. For now I’m a simple demo bot, but I received your message and "
        "can be wired up to a real model next."
    )

    return func.HttpResponse(
        json.dumps(
            {
                "ok": True,
                "message": user_message,
                "reply": reply,
            }
        ),
        status_code=200,
        mimetype="application/json",
        headers=_cors_headers(req),
    )

@app.function_name(name="hello")
@app.route(route="hello", methods=["GET", "POST"], auth_level=func.AuthLevel.ANONYMOUS)
def hello(req: func.HttpRequest) -> func.HttpResponse:
    logging.info("Python HTTP trigger processed a request.")
    name = req.params.get("name")
    if not name:
        try:
            body = req.get_json()
            name = body.get("name") if isinstance(body, dict) else None
        except ValueError:
            name = None
    if not name:
        return func.HttpResponse("Please pass a 'name' in query or JSON body.", status_code=400)
    return func.HttpResponse(f"Hello, {name}!")

@app.function_name(name="read_csv")
@app.route(route="read-csv", methods=["GET", "POST", "OPTIONS"], auth_level=func.AuthLevel.ANONYMOUS)
def read_csv(req: func.HttpRequest) -> func.HttpResponse:
    logging.info("ENTER read_csv method=%s", req.method)
    if req.method == "OPTIONS":
        return func.HttpResponse(status_code=204, headers=_cors_headers(req))
    try:
        p = _params(req)
        if not p["blob"]:
            return func.HttpResponse(
                json.dumps({"error": "Provide blob (query/body) or set BLOB_NAME"}),
                status_code=400, mimetype="application/json", headers=_cors_headers(req)
            )
        if _allow_arbitrary_blob_reads():
            container = p["container"] or _public_container()
            blob_name = p["blob"]
        else:
            container = _public_container()
            blob_name = p["blob"]
            if blob_name not in _public_blobs():
                return func.HttpResponse(
                    json.dumps({"error": "Blob not allowed"}),
                    status_code=403,
                    mimetype="application/json",
                    headers=_cors_headers(req),
                )
        bsc = _bsc()
        data = (
            bsc.get_container_client(container)
               .get_blob_client(blob_name)
               .download_blob(max_concurrency=2)
               .readall()
        )
        if p["format"] == "json":
            rows = _csv_to_rows(data)
            return func.HttpResponse(json.dumps(rows, default=str), status_code=200, mimetype="application/json", headers=_cors_headers(req))
        return func.HttpResponse(
            body=data,
            status_code=200,
            mimetype="text/csv",
            headers={**_cors_headers(req), "Content-Disposition": f'inline; filename="{os.path.basename(blob_name)}"'},
        )
    except ResourceNotFoundError:
        return func.HttpResponse(json.dumps({"error": "Blob not found"}), status_code=404, mimetype="application/json", headers=_cors_headers(req))
    except Exception:
        logging.exception("read_csv failed")
        return func.HttpResponse(json.dumps({"error": "Internal server error"}), status_code=500, mimetype="application/json", headers=_cors_headers(req))

@app.function_name(name="log_event")
@app.route(route="log-event", methods=["POST", "OPTIONS"], auth_level=func.AuthLevel.ANONYMOUS)
def log_event(req: func.HttpRequest) -> func.HttpResponse:
    logging.info("Received a log event request.")
    if req.method == "OPTIONS":
        return func.HttpResponse(status_code=204, headers=_cors_headers(req))

    required_role = os.getenv("LOG_EVENT_REQUIRED_ROLE", "authenticated")
    if not _require_swa_role(req, required_role):
        return func.HttpResponse(
            json.dumps({"error": "Authentication required"}),
            status_code=401,
            mimetype="application/json",
            headers=_cors_headers(req),
        )
    try:
        req_body = req.get_json()
    except ValueError:
        return func.HttpResponse(json.dumps({"error": "Invalid JSON"}), status_code=400, mimetype="application/json", headers=_cors_headers(req))

    eventType     = _truncate((req_body.get("eventType")     or "").strip(), 50)
    targetTag     = _truncate((req_body.get("targetTag")     or "").strip(), 50)
    targetId      = _truncate((req_body.get("targetId")      or "").strip(), 100)
    targetClasses = _truncate((req_body.get("targetClasses") or "").strip(), 255)
    targetText    = _truncate((req_body.get("targetText")    or "").strip(), 255)
    clientIp      = _truncate((req_body.get("clientIp")      or "").strip(), 255)
    clientUrl     = _truncate((req_body.get("clientUrl")     or "").strip(), 255)
    timestamp     = datetime.datetime.utcnow()

    try:
        driver_choice = os.getenv("SQL_DRIVER", "pyodbc").lower()
        conn = _connect_sql()
        cursor = conn.cursor()
        insert_sql = (
            "INSERT INTO dbo.LogEvent (EventType,TargetTag,TargetID,TargetClasses,TargetText,ClientIp,ClientUrl,Timestamp) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
            if driver_choice != "pymssql" else
            "INSERT INTO dbo.LogEvent (EventType,TargetTag,TargetID,TargetClasses,TargetText,ClientIp,ClientUrl,Timestamp) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s)"
        )
        cursor.execute(insert_sql, (eventType, targetTag, targetId, targetClasses, targetText, clientIp, clientUrl, timestamp))
        conn.commit()
        cursor.close()
        conn.close()
    except Exception:
        logging.error("Error inserting log data into SQL", exc_info=True)
        return func.HttpResponse(json.dumps({"error": "Internal server error"}), status_code=500, mimetype="application/json", headers=_cors_headers(req))

    return func.HttpResponse(json.dumps({"status": "ok", "message": "Log data received and inserted."}), status_code=200, mimetype="application/json", headers=_cors_headers(req))
