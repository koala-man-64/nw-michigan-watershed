# function_app.py
# v2 Function App with:
#   - hello       : simple greeting
#   - read_csv    : get blob as CSV/JSON
#   - log_event   : write UI events to SQL Server (SWA-auth required)
#
# SQL env:
#   - Preferred: SQL_CONNECTION_STRING = "Server=tcp:...,...;Database=...;User ID=...;Password=...;"
#   - Or discrete vars: SQL_SERVER, SQL_DATABASE, SQL_USERNAME, SQL_PASSWORD, [optional] SQL_PORT=1433
#   - Driver choice:
#       SQL_DRIVER=pymssql (default; pure-Python) or SQL_DRIVER=pyodbc (requires ODBC driver present in the host)
#
# Storage env for read_csv (pick one auth path):
#   - BLOB_CONN  (connection string), or
#   - STORAGE_ACCOUNT_NAME + SAS_TOKEN, or
#   - STORAGE_ACCOUNT_URL (uses default creds/MSI)
#   plus: PUBLIC_BLOB_CONTAINER, PUBLIC_BLOBS (allowlist for anonymous reads)

import base64
import csv
import datetime
import io
import json
import logging
import os
import random
import threading
import time
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
elif os.getenv("ENABLE_DEBUGPY") == "1" and debugpy is None:
    logging.warning("ENABLE_DEBUGPY=1 but debugpy is not installed in this environment.")

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
        return {
            "NWMIWS Site Data.csv",
            "NWMIWS_Site_Data_testing.csv",
            "NWMIWS_Site_Data_testing_varied.csv",
            "info.csv",
            "locations.csv",
        }
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

_rate_lock = threading.Lock()
_rate_state: dict[str, list[float]] = {}

def _get_client_ip(req: func.HttpRequest) -> str:
    xff = req.headers.get("x-forwarded-for") or req.headers.get("X-Forwarded-For")
    if xff:
        return xff.split(",")[0].strip()
    for header in ("x-azure-clientip", "X-Azure-ClientIP", "client-ip", "Client-IP"):
        v = req.headers.get(header)
        if v:
            return v.strip()
    return ""

def _ip_for_storage(raw_ip: str) -> str:
    mode = os.getenv("LOG_EVENT_IP_MODE", "raw").strip().lower()  # raw | hash | none
    if mode == "none":
        return ""
    ip = raw_ip or ""
    if mode == "hash":
        import hashlib
        return hashlib.sha256(ip.encode("utf-8")).hexdigest()
    return ip

def _should_sample() -> bool:
    raw = os.getenv("LOG_EVENT_SAMPLE_RATE", "1.0").strip()
    try:
        rate = float(raw)
    except Exception:
        rate = 1.0
    if rate >= 1.0:
        return True
    if rate <= 0.0:
        return False
    return random.random() < rate

def _rate_limit_key(req: func.HttpRequest) -> str:
    principal = _get_swa_principal(req) or {}
    return (
        principal.get("userId")
        or principal.get("userDetails")
        or _get_client_ip(req)
        or "unknown"
    )

def _is_rate_limited(req: func.HttpRequest) -> bool:
    try:
        max_events = int(os.getenv("LOG_EVENT_RATE_LIMIT_MAX", "60"))
        window_sec = int(os.getenv("LOG_EVENT_RATE_LIMIT_WINDOW_SEC", "60"))
    except Exception:
        max_events, window_sec = 60, 60
    if max_events <= 0 or window_sec <= 0:
        return False
    now = time.time()
    key = _rate_limit_key(req)
    with _rate_lock:
        timestamps = _rate_state.get(key, [])
        cutoff = now - window_sec
        timestamps = [t for t in timestamps if t >= cutoff]
        if len(timestamps) >= max_events:
            _rate_state[key] = timestamps
            return True
        timestamps.append(now)
        _rate_state[key] = timestamps
        return False

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
def _parse_kv_conn_string(conn_str: str) -> dict:
    items: dict[str, str] = {}
    for part in (conn_str or "").split(";"):
        if not part.strip() or "=" not in part:
            continue
        k, v = part.split("=", 1)
        items[k.strip().lower()] = v.strip()
    return items

def _sql_from_env() -> dict:
    """
    Supports:
    - SQL_CONNECTION_STRING (preferred; ADO-style key/value string)
    - Discrete env vars: SQL_SERVER, SQL_DATABASE, SQL_USERNAME, SQL_PASSWORD, [SQL_PORT]
    """
    conn = os.getenv("SQL_CONNECTION_STRING", "").strip()
    if conn:
        kv = _parse_kv_conn_string(conn)
        server_raw = kv.get("server") or kv.get("data source") or kv.get("address") or kv.get("addr") or kv.get("network address")
        database = kv.get("database") or kv.get("initial catalog")
        user = kv.get("user id") or kv.get("uid") or kv.get("user")
        password = kv.get("password") or kv.get("pwd")
        if not (server_raw and database and user and password):
            raise RuntimeError("SQL_CONNECTION_STRING missing required keys (server, database, user id, password).")
        server_raw = server_raw.replace("tcp:", "")
        if "," in server_raw:
            server, port_str = server_raw.split(",", 1)
            port = int(port_str)
        else:
            server, port = server_raw, int(os.getenv("SQL_PORT", "1433"))
        return {"server": server, "database": database, "user": user, "password": password, "port": port}

    server = os.getenv("SQL_SERVER")
    database = os.getenv("SQL_DATABASE")
    user = os.getenv("SQL_USERNAME")
    password = os.getenv("SQL_PASSWORD")
    port = int(os.getenv("SQL_PORT", "1433"))
    missing = [k for k, v in {"SQL_SERVER": server, "SQL_DATABASE": database, "SQL_USERNAME": user, "SQL_PASSWORD": password}.items() if not v]
    if missing:
        raise RuntimeError(f"Missing required SQL env vars: {', '.join(missing)}")
    return {"server": server.replace("tcp:", ""), "database": database, "user": user, "password": password, "port": port}


def _connect_sql():
    choice = os.getenv("SQL_DRIVER", "pymssql").lower()
    if choice == "pymssql":
        if pymssql is None:
            raise RuntimeError("SQL_DRIVER=pymssql but pymssql is not installed.")
        params = _sql_from_env()
        return pymssql.connect(
            server=params["server"],
            user=params["user"],
            password=params["password"],
            database=params["database"],
            port=params["port"],
        )
    # default: pyodbc
    if pyodbc is None:
        raise RuntimeError("pyodbc is not installed and SQL_DRIVER is not set to 'pymssql'.")
    conn_str = os.getenv("SQLSERVER_CONNSTR") or os.getenv("SQL_CONNECTION_STRING")
    if not conn_str:
        raise RuntimeError("Set SQLSERVER_CONNSTR (ODBC) or SQL_CONNECTION_STRING.")
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

    if os.getenv("LOG_EVENT_ENABLED", "1").strip() != "1":
        return func.HttpResponse(
            json.dumps({"status": "disabled"}),
            status_code=200,
            mimetype="application/json",
            headers=_cors_headers(req),
        )

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

    if _is_rate_limited(req):
        return func.HttpResponse(
            json.dumps({"error": "Too many requests"}),
            status_code=429,
            mimetype="application/json",
            headers=_cors_headers(req),
        )

    if not _should_sample():
        return func.HttpResponse(
            json.dumps({"status": "sampled_out"}),
            status_code=200,
            mimetype="application/json",
            headers=_cors_headers(req),
        )

    eventType     = _truncate((req_body.get("eventType")     or "").strip(), 50)
    targetTag     = _truncate((req_body.get("targetTag")     or "").strip(), 50)
    targetId      = _truncate((req_body.get("targetId")      or "").strip(), 100)
    targetClasses = _truncate((req_body.get("targetClasses") or "").strip(), 255)
    capture_text  = os.getenv("LOG_EVENT_CAPTURE_TEXT", "0").strip() == "1"
    targetText    = _truncate((req_body.get("targetText")    or "").strip(), 255) if capture_text else ""
    clientIp      = _truncate(_ip_for_storage(_get_client_ip(req)), 255)
    clientUrl     = _truncate((req_body.get("clientUrl")     or "").strip(), 255)
    timestamp     = datetime.datetime.utcnow()

    if not eventType or not targetTag:
        return func.HttpResponse(
            json.dumps({"error": "Missing required fields: eventType, targetTag"}),
            status_code=400,
            mimetype="application/json",
            headers=_cors_headers(req),
        )

    try:
        driver_choice = os.getenv("SQL_DRIVER", "pymssql").lower()
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
