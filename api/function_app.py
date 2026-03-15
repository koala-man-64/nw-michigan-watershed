# function_app.py
# v2 Function App with:
#   - hello       : simple greeting
#   - read_csv    : get blob as CSV/JSON
#   - log_event   : temporary deprecation stub returning 410 Gone
#
# Storage env for read_csv (pick one auth path):
#   - BLOB_CONN  (connection string), or
#   - STORAGE_ACCOUNT_NAME + SAS_TOKEN, or
#   - STORAGE_ACCOUNT_URL (uses default creds/MSI)
#   plus: PUBLIC_BLOB_CONTAINER, PUBLIC_BLOBS (allowlist for anonymous reads)
#   optional cache controls:
#       READ_CSV_MEMORY_CACHE_TTL_SEC=900
#       READ_CSV_BROWSER_CACHE_MAX_AGE_SEC=3600
#       READ_CSV_BROWSER_CACHE_SWR_SEC=86400

import csv
import datetime
import hashlib
import io
import json
import logging
import os
import re
import threading
import time
from email.utils import parsedate_to_datetime
from typing import Optional

import azure.functions as func
from azure.storage.blob import BlobServiceClient
from azure.core.credentials import AzureSasCredential
from azure.core.exceptions import ResourceNotFoundError

# ---------------------------
# Local env loading (dev convenience)
# ---------------------------
def _load_local_env_file() -> None:
    env_path = os.path.join(os.path.dirname(__file__), ".env")
    try:
        with open(env_path, "r", encoding="utf-8") as f:
            raw = f.read()
    except Exception:
        return

    pattern = re.compile(r"^\s*([A-Za-z_][A-Za-z0-9_]*)\s*(=|:)\s*(.*?)\s*$")

    for line in raw.splitlines():
        s = line.strip()
        if not s or s.startswith("#"):
            continue

        m = pattern.match(s)
        if not m:
            continue
        key, _, value = m.groups()

        if not key or key in os.environ:
            continue

        if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
            value = value[1:-1]
        os.environ[key] = value


_load_local_env_file()

try:
    from azure.identity import DefaultAzureCredential
except Exception:
    DefaultAzureCredential = None
try:
    import debugpy
except Exception:
    debugpy = None

_blob_service_client_lock = threading.Lock()
_blob_service_client: Optional[BlobServiceClient] = None

_read_csv_cache_lock = threading.Lock()
_read_csv_cache: dict[tuple[str, str], dict] = {}


def _env(name: str, default: Optional[str] = None) -> Optional[str]:
    value = os.getenv(name)
    if value is None:
        return default
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
        value = value[1:-1].strip()
    return value if value else default


def _env_int(name: str, default: int) -> int:
    raw = _env(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except Exception:
        return default

# ---------------------------
# CORS (restricted; SWA is usually same-origin)
# ---------------------------
if os.getenv("ENABLE_DEBUGPY") == "1" and debugpy is not None:
    host = _env("DEBUGPY_HOST", "127.0.0.1") or "127.0.0.1"
    port = _env_int("DEBUGPY_PORT", 5678)
    try:
        debugpy.listen((host, port))
        logging.info("debugpy listening on %s:%s", host, port)
    except RuntimeError:
        pass  # already listening
    if os.getenv("WAIT_FOR_DEBUGGER") == "1":
        logging.info("Waiting for debugger to attach...")
        debugpy.wait_for_client()
elif os.getenv("ENABLE_DEBUGPY") == "1" and debugpy is None:
    logging.info("ENABLE_DEBUGPY=1 but debugpy is not installed in this environment.")

def _allowed_origins() -> set[str]:
    raw = (_env("CORS_ALLOWED_ORIGINS") or "").strip()
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

def _ensure_trailing_slash(url: str) -> str:
    u = (url or "").strip()
    if not u:
        return u
    return u if u.endswith("/") else (u + "/")

def _bsc() -> BlobServiceClient:
    global _blob_service_client
    if _blob_service_client is not None:
        return _blob_service_client

    with _blob_service_client_lock:
        if _blob_service_client is not None:
            return _blob_service_client

        conn = _env("BLOB_CONN")
        if conn:
            logging.info("storage: auth=connection_string")
            _blob_service_client = BlobServiceClient.from_connection_string(conn)
            logging.info("storage: account_name=%s", getattr(_blob_service_client, "account_name", None))
            return _blob_service_client
        acct = _env("STORAGE_ACCOUNT_NAME")
        sas = _normalize_sas(_env("SAS_TOKEN"))
        if acct and sas:
            account_url = _ensure_trailing_slash(f"https://{acct}.blob.core.windows.net")
            logging.info("storage: auth=account+sas account_url=%s", account_url)
            _blob_service_client = BlobServiceClient(
                account_url=account_url,
                credential=sas,
            )
            return _blob_service_client
        url = _env("STORAGE_ACCOUNT_URL")
        if url:
            if DefaultAzureCredential is None:
                raise RuntimeError("STORAGE_ACCOUNT_URL set but azure-identity is missing; add 'azure-identity' or use BLOB_CONN.")
            account_url = _ensure_trailing_slash(url)
            logging.info("storage: auth=account_url(DefaultAzureCredential) account_url=%s", account_url)
            _blob_service_client = BlobServiceClient(account_url=account_url, credential=DefaultAzureCredential())
            return _blob_service_client
    raise RuntimeError("Missing storage auth: set BLOB_CONN or (STORAGE_ACCOUNT_NAME+SAS_TOKEN) or STORAGE_ACCOUNT_URL")

def _public_container() -> str:
    return _env("PUBLIC_BLOB_CONTAINER") or _env("BLOB_CONTAINER") or "nwmiws"

def _public_blobs() -> set[str]:
    raw = (_env("PUBLIC_BLOBS") or "").strip()
    if not raw:
        return {
            "NWMIWS_Site_Data_testing_varied.csv",
            "info.csv",
            "locations.csv",
        }
    return {b.strip() for b in raw.split(",") if b.strip()}

def _allow_arbitrary_blob_reads() -> bool:
    return (_env("ALLOW_ARBITRARY_BLOB_READS", "0") or "0").strip() == "1"

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
    pick = lambda k, env=None, d=None: qs.get(k) or body.get(k) or _env((env or k).upper(), d)
    return {
        "container": pick("container", "BLOB_CONTAINER"),
        "blob":      pick("blob", "BLOB_NAME"),
        "format":   (pick("format") or "csv").lower(),  # csv | json
    }

def _csv_to_rows(data: bytes):
    try:
        text = data.decode("utf-8")
    except Exception:
        text = data.decode("latin-1")
    reader = csv.DictReader(io.StringIO(text))
    return [dict(row) for row in reader]


def _read_csv_memory_cache_ttl_sec() -> int:
    return max(0, _env_int("READ_CSV_MEMORY_CACHE_TTL_SEC", 900))


def _read_csv_browser_cache_max_age_sec() -> int:
    return max(0, _env_int("READ_CSV_BROWSER_CACHE_MAX_AGE_SEC", 3600))


def _read_csv_browser_cache_swr_sec() -> int:
    return max(0, _env_int("READ_CSV_BROWSER_CACHE_SWR_SEC", 86400))


def _normalize_http_etag(value: Optional[str]) -> str:
    s = (value or "").strip()
    if s.startswith("W/"):
        s = s[2:].strip()
    if len(s) >= 2 and s[0] == s[-1] and s[0] in ('"', "'"):
        s = s[1:-1]
    return s.strip()


def _quote_http_etag(value: Optional[str]) -> Optional[str]:
    normalized = _normalize_http_etag(value)
    return f'"{normalized}"' if normalized else None


def _etag_matches(header_value: Optional[str], etag: Optional[str]) -> bool:
    normalized = _normalize_http_etag(etag)
    if not header_value or not normalized:
        return False
    for token in header_value.split(","):
        candidate = token.strip()
        if candidate == "*":
            return True
        if _normalize_http_etag(candidate) == normalized:
            return True
    return False


def _format_http_datetime(value: Optional[datetime.datetime]) -> Optional[str]:
    if value is None:
        return None
    dt = value
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=datetime.timezone.utc)
    else:
        dt = dt.astimezone(datetime.timezone.utc)
    return dt.strftime("%a, %d %b %Y %H:%M:%S GMT")


def _is_not_modified(req: func.HttpRequest, etag: Optional[str], last_modified: Optional[datetime.datetime]) -> bool:
    if _etag_matches(req.headers.get("If-None-Match"), etag):
        return True

    header_value = req.headers.get("If-Modified-Since")
    if not header_value or last_modified is None:
        return False

    try:
        since = parsedate_to_datetime(header_value)
    except Exception:
        return False

    if since.tzinfo is None:
        since = since.replace(tzinfo=datetime.timezone.utc)

    blob_last_modified = last_modified
    if blob_last_modified.tzinfo is None:
        blob_last_modified = blob_last_modified.replace(tzinfo=datetime.timezone.utc)
    else:
        blob_last_modified = blob_last_modified.astimezone(datetime.timezone.utc)

    # HTTP-date precision is seconds.
    return blob_last_modified.replace(microsecond=0) <= since.astimezone(datetime.timezone.utc).replace(microsecond=0)


def _read_csv_cache_control() -> str:
    max_age = _read_csv_browser_cache_max_age_sec()
    swr = _read_csv_browser_cache_swr_sec()
    if max_age <= 0 and swr <= 0:
        return "no-store"

    parts = ["public", f"max-age={max_age}"]
    if swr > 0:
        parts.append(f"stale-while-revalidate={swr}")
    return ", ".join(parts)


def _read_csv_response_headers(blob_name: str, etag: Optional[str], last_modified: Optional[datetime.datetime]) -> dict:
    headers = {
        "Content-Disposition": f'inline; filename="{os.path.basename(blob_name)}"',
        "Cache-Control": _read_csv_cache_control(),
    }
    quoted_etag = _quote_http_etag(etag)
    if quoted_etag:
        headers["ETag"] = quoted_etag
    last_modified_http = _format_http_datetime(last_modified)
    if last_modified_http:
        headers["Last-Modified"] = last_modified_http
    return headers


def _read_csv_cache_key(container: str, blob_name: str) -> tuple[str, str]:
    return (container, blob_name)


def _read_csv_cache_get(container: str, blob_name: str) -> Optional[dict]:
    ttl = _read_csv_memory_cache_ttl_sec()
    if ttl <= 0:
        return None

    key = _read_csv_cache_key(container, blob_name)
    now = time.time()
    with _read_csv_cache_lock:
        entry = _read_csv_cache.get(key)
        if entry is None:
            return None
        if now - float(entry.get("cached_at", 0.0)) > ttl:
            _read_csv_cache.pop(key, None)
            return None
        return entry


def _read_csv_cache_put(container: str, blob_name: str, entry: dict) -> dict:
    ttl = _read_csv_memory_cache_ttl_sec()
    if ttl <= 0:
        return entry

    key = _read_csv_cache_key(container, blob_name)
    with _read_csv_cache_lock:
        _read_csv_cache[key] = entry
    return entry


def _read_csv_blob_client(container: str, blob_name: str):
    return _bsc().get_container_client(container).get_blob_client(blob_name)


def _read_csv_blob_properties(blob_client) -> tuple[Optional[str], Optional[datetime.datetime]]:
    props = blob_client.get_blob_properties()
    return getattr(props, "etag", None), getattr(props, "last_modified", None)


def _read_csv_load_blob(
    container: str,
    blob_name: str,
    *,
    blob_client=None,
    etag: Optional[str] = None,
    last_modified: Optional[datetime.datetime] = None,
) -> tuple[dict, bool]:
    cached = _read_csv_cache_get(container, blob_name)
    if cached is not None:
        logging.info("read_csv_cache: hit container=%r blob=%r", container, blob_name)
        return cached, True

    if blob_client is None:
        blob_client = _read_csv_blob_client(container, blob_name)
    if etag is None or last_modified is None:
        fetched_etag, fetched_last_modified = _read_csv_blob_properties(blob_client)
        if etag is None:
            etag = fetched_etag
        if last_modified is None:
            last_modified = fetched_last_modified

    data = blob_client.download_blob(max_concurrency=2).readall()
    etag = etag or hashlib.sha256(data).hexdigest()
    entry = {
        "data": data,
        "etag": etag,
        "last_modified": last_modified,
        "cached_at": time.time(),
        "rows": None,
    }
    logging.info("read_csv_cache: miss container=%r blob=%r bytes=%s", container, blob_name, len(data))
    return _read_csv_cache_put(container, blob_name, entry), False


def _read_csv_rows(entry: dict):
    rows = entry.get("rows")
    if rows is None:
        rows = _csv_to_rows(entry["data"])
        entry["rows"] = rows
    return rows

# ---------------------------
# v2 FunctionApp + routes
# ---------------------------
app = func.FunctionApp()
LOG_EVENT_DEPRECATION_MESSAGE = (
    "The /api/log-event endpoint has been retired. "
    "Use client-side Application Insights telemetry instead."
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
    logging.info("read_csv: received request method=%s", req.method)
    if req.method == "OPTIONS":
        logging.info("read_csv: OPTIONS preflight")
        return func.HttpResponse(status_code=204, headers=_cors_headers(req))
    try:
        p = _params(req)
        if not p["blob"]:
            logging.info("read_csv: missing blob param")
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
                logging.info("read_csv: blob not allowed blob=%r", blob_name)
                return func.HttpResponse(
                    json.dumps({"error": "Blob not allowed"}),
                    status_code=403,
                    mimetype="application/json",
                    headers=_cors_headers(req),
                )
        logging.info("read_csv: loading container=%r blob=%r format=%r", container, blob_name, p["format"])
        entry = _read_csv_cache_get(container, blob_name)
        cache_hit = entry is not None

        if entry is None:
            blob_client = _read_csv_blob_client(container, blob_name)
            etag, last_modified = _read_csv_blob_properties(blob_client)

            if req.method == "GET" and _is_not_modified(req, etag, last_modified):
                headers = {
                    **_cors_headers(req),
                    **_read_csv_response_headers(blob_name, etag, last_modified),
                }
                logging.info("read_csv: not modified blob=%r cache_hit=%s", blob_name, False)
                return func.HttpResponse(status_code=304, headers=headers)

            entry, cache_hit = _read_csv_load_blob(
                container,
                blob_name,
                blob_client=blob_client,
                etag=etag,
                last_modified=last_modified,
            )

        headers = {
            **_cors_headers(req),
            **_read_csv_response_headers(blob_name, entry.get("etag"), entry.get("last_modified")),
        }

        if req.method == "GET" and _is_not_modified(req, entry.get("etag"), entry.get("last_modified")):
            logging.info("read_csv: not modified blob=%r cache_hit=%s", blob_name, cache_hit)
            return func.HttpResponse(status_code=304, headers=headers)

        data = entry["data"]
        if p["format"] == "json":
            rows = _read_csv_rows(entry)
            logging.info("read_csv: ok json rows=%s bytes=%s cache_hit=%s", len(rows), len(data), cache_hit)
            return func.HttpResponse(json.dumps(rows, default=str), status_code=200, mimetype="application/json", headers=headers)
        logging.info("read_csv: ok csv bytes=%s cache_hit=%s", len(data), cache_hit)
        return func.HttpResponse(
            body=data,
            status_code=200,
            mimetype="text/csv",
            headers=headers,
        )
    except ResourceNotFoundError:
        logging.info("read_csv: blob not found")
        return func.HttpResponse(json.dumps({"error": "Blob not found"}), status_code=404, mimetype="application/json", headers=_cors_headers(req))
    except Exception:
        logging.info("read_csv: failed", exc_info=True)
        return func.HttpResponse(json.dumps({"error": "Internal server error"}), status_code=500, mimetype="application/json", headers=_cors_headers(req))

@app.function_name(name="log_event")
@app.route(route="log-event", methods=["POST", "OPTIONS"], auth_level=func.AuthLevel.ANONYMOUS)
def log_event(req: func.HttpRequest) -> func.HttpResponse:
    if req.method == "OPTIONS":
        return func.HttpResponse(status_code=204, headers=_cors_headers(req))

    client_url = ""
    try:
        req_body = req.get_json()
    except ValueError:
        req_body = {}

    if isinstance(req_body, dict):
        client_url = str(req_body.get("clientUrl") or "").strip()[:255]

    logging.warning(
        "log_event_deprecated_call: origin=%r referer=%r client_url=%r",
        req.headers.get("Origin"),
        req.headers.get("Referer"),
        client_url,
    )
    return func.HttpResponse(
        json.dumps(
            {
                "error": "Endpoint removed",
                "message": LOG_EVENT_DEPRECATION_MESSAGE,
            }
        ),
        status_code=410,
        mimetype="application/json",
        headers=_cors_headers(req),
    )
