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
import math
import os
import random
import re
import threading
import time
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

# OpenAI (optional until dependency is installed)
try:
    from openai import OpenAI
except Exception:
    OpenAI = None

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
# OpenAI helpers (chat-rudy)
# ---------------------------
_openai_lock = threading.Lock()
_openai_client = None

_rudy_prompt_lock = threading.Lock()
_rudy_prompt_cached: Optional[str] = None

_rudy_rag_lock = threading.Lock()
_rudy_rag_chunks_cached: Optional[list[str]] = None
_rudy_rag_embeddings_cached: Optional[list[Optional[list[float]]]] = None
_rudy_rag_embeddings_disabled_until: float = 0.0


def _openai() -> "OpenAI":
    global _openai_client
    if _openai_client is not None:
        return _openai_client

    if OpenAI is None:
        raise RuntimeError("OpenAI SDK not installed. Add 'openai' to api/requirements.txt.")

    api_key = (os.getenv("OPENAI_API_KEY") or "").strip()
    if not api_key:
        raise RuntimeError("Missing required env var: OPENAI_API_KEY")

    with _openai_lock:
        if _openai_client is None:
            try:
                max_retries = int(os.getenv("OPENAI_MAX_RETRIES") or "2")
            except Exception:
                max_retries = 2
            _openai_client = OpenAI(api_key=api_key, max_retries=max_retries)
    return _openai_client


def _download_blob_text(container: str, blob_name: str) -> str:
    data = (
        _bsc()
        .get_container_client(container)
        .get_blob_client(blob_name)
        .download_blob(max_concurrency=2)
        .readall()
    )
    try:
        return data.decode("utf-8")
    except Exception:
        return data.decode("utf-8", errors="ignore")


def _required_env(name: str) -> str:
    value = (os.getenv(name) or "").strip()
    if not value:
        raise RuntimeError(f"Missing required env var: {name}")
    return value


def _rudy_system_prompt() -> str:
    container = _required_env("CHAT_WITH_RUDY_CONTAINER")
    blob_name = _required_env("CHAT_WITH_RUDY_PROMPT_BLOB")

    global _rudy_prompt_cached
    if _rudy_prompt_cached is not None:
        return _rudy_prompt_cached

    with _rudy_prompt_lock:
        if _rudy_prompt_cached is None:
            _rudy_prompt_cached = _download_blob_text(container, blob_name).strip()
    return _rudy_prompt_cached or ""


def _chunk_text(text: str, chunk_size: int = 1200, overlap: int = 150) -> list[str]:
    t = " ".join(text.split())
    if not t:
        return []
    chunks = []
    start = 0
    while start < len(t):
        end = min(len(t), start + chunk_size)
        chunks.append(t[start:end])
        if end == len(t):
            break
        start = max(0, end - overlap)
    return chunks


def _split_rag_chunks(text: str, chunk_size: int, overlap: int) -> list[str]:
    lines = text.splitlines()
    preamble: list[str] = []
    chunks: list[str] = []
    current: list[str] = []
    saw_chunk_marker = False

    for line in lines:
        if line.startswith("CHUNK:"):
            if not saw_chunk_marker:
                saw_chunk_marker = True
                pre = "\n".join(preamble).strip()
                if pre:
                    chunks.append(pre)
                preamble = []
            if current:
                chunks.append("\n".join(current).strip())
                current = []
        if saw_chunk_marker:
            current.append(line)
        else:
            preamble.append(line)

    if saw_chunk_marker and current:
        chunks.append("\n".join(current).strip())

    if not saw_chunk_marker:
        chunks = _chunk_text(text, chunk_size=chunk_size, overlap=overlap)

    out: list[str] = []
    for c in chunks:
        if not c:
            continue
        if len(c) > chunk_size * 2:
            out.extend(_chunk_text(c, chunk_size=chunk_size, overlap=overlap))
        else:
            out.append(c)
    return out


def _cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    return dot / (na * nb + 1e-12)


def _embed(texts: list[str]) -> list[list[float]]:
    model = (os.getenv("OPENAI_EMBEDDING_MODEL") or "text-embedding-3-small").strip()
    batch_size = int(os.getenv("OPENAI_EMBED_BATCH_SIZE") or "64")
    if batch_size < 1:
        batch_size = 64

    vectors: list[list[float]] = []
    for i in range(0, len(texts), batch_size):
        batch = texts[i : i + batch_size]
        r = _openai().embeddings.create(model=model, input=batch)
        vectors.extend([d.embedding for d in r.data])
    return vectors


def _is_openai_rate_limited(exc: Exception) -> bool:
    status = getattr(exc, "status_code", None)
    if status == 429:
        return True
    response = getattr(exc, "response", None)
    if response is not None and getattr(response, "status_code", None) == 429:
        return True
    return "429" in str(exc) or "rate limit" in str(exc).lower() or "too many requests" in str(exc).lower()


def _tokenize_for_rag(text: str) -> set[str]:
    # Keep this tiny/fast; it's a fallback and a pre-filter.
    words = re.findall(r"[a-z0-9]{2,}", (text or "").lower())
    return set(words)


def _lexical_prefilter(query: str, chunks: list[str], take: int) -> list[int]:
    q = _tokenize_for_rag(query)
    if not q:
        return list(range(min(take, len(chunks))))
    scored: list[tuple[int, int]] = []
    for i, chunk in enumerate(chunks):
        c = _tokenize_for_rag(chunk)
        scored.append((len(q & c), i))
    scored.sort(reverse=True)
    return [i for _, i in scored[: min(take, len(scored))]]


def _rudy_rag_load() -> tuple[list[str], list[Optional[list[float]]]]:
    global _rudy_rag_chunks_cached, _rudy_rag_embeddings_cached

    if _rudy_rag_chunks_cached is not None and _rudy_rag_embeddings_cached is not None:
        return _rudy_rag_chunks_cached, _rudy_rag_embeddings_cached

    with _rudy_rag_lock:
        if _rudy_rag_chunks_cached is not None and _rudy_rag_embeddings_cached is not None:
            return _rudy_rag_chunks_cached, _rudy_rag_embeddings_cached

        container = _required_env("CHAT_WITH_RUDY_CONTAINER")
        blob_name = _required_env("CHAT_WITH_RUDY_RAG_BLOB")
        raw = _download_blob_text(container, blob_name)
        chunk_size = int(os.getenv("RUDY_RAG_CHUNK_SIZE") or "1200")
        overlap = int(os.getenv("RUDY_RAG_CHUNK_OVERLAP") or "150")
        chunks = _split_rag_chunks(raw, chunk_size=chunk_size, overlap=overlap)
        if not chunks:
            raise RuntimeError("RAG source produced no chunks.")
        _rudy_rag_chunks_cached = chunks
        _rudy_rag_embeddings_cached = [None] * len(chunks)
        return _rudy_rag_chunks_cached, _rudy_rag_embeddings_cached


def _rudy_rag_retrieve(query: str) -> list[str]:
    k = int(os.getenv("RUDY_RAG_TOP_K") or "6")
    if k < 1:
        k = 6

    chunks, embeddings = _rudy_rag_load()

    try:
        prefilter_k = int(os.getenv("RUDY_RAG_PREFILTER_K") or "25")
    except Exception:
        prefilter_k = 25

    candidate_idxs = _lexical_prefilter(query, chunks, take=max(k, prefilter_k))

    global _rudy_rag_embeddings_disabled_until
    if time.time() < _rudy_rag_embeddings_disabled_until:
        return [chunks[i] for i in candidate_idxs[: min(k, len(candidate_idxs))]]

    mode = (os.getenv("RUDY_RAG_MODE") or "embeddings").strip().lower()  # embeddings | lexical
    if mode == "lexical":
        return [chunks[i] for i in candidate_idxs[: min(k, len(candidate_idxs))]]

    try:
        query_vec = _embed([query])[0]

        missing_texts: list[str] = []
        missing_idxs: list[int] = []
        for idx in candidate_idxs:
            if embeddings[idx] is None:
                missing_idxs.append(idx)
                missing_texts.append(chunks[idx])
        if missing_texts:
            new_vecs = _embed(missing_texts)
            for idx, vec in zip(missing_idxs, new_vecs):
                embeddings[idx] = vec

        scored: list[tuple[float, int]] = []
        for idx in candidate_idxs:
            vec = embeddings[idx]
            if vec is None:
                continue
            scored.append((_cosine(query_vec, vec), idx))
        scored.sort(reverse=True)
        top = scored[: min(k, len(scored))]
        if top:
            return [chunks[idx] for _, idx in top]
    except Exception as e:
        if _is_openai_rate_limited(e):
            logging.warning("RAG embeddings rate-limited; falling back to lexical retrieval.")
            try:
                cooldown = int(os.getenv("RUDY_RAG_RATE_LIMIT_COOLDOWN_SEC") or "60")
            except Exception:
                cooldown = 60
            _rudy_rag_embeddings_disabled_until = time.time() + max(0, cooldown)
        else:
            logging.exception("RAG retrieval failed; falling back to lexical retrieval.")

    return [chunks[i] for i in candidate_idxs[: min(k, len(candidate_idxs))]]

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
    debug_console = (os.getenv("CHAT_RUDY_DEBUG_CONSOLE") or "").strip().lower() in ("1", "true", "yes", "on")

    def _console(msg: str) -> None:
        if not debug_console:
            return
        try:
            print(f"[chat_rudy] {msg}", flush=True)
        except Exception:
            pass

    logging.info("Received chat request.")
    _console(f"Received request method={req.method}")
    if req.method == "OPTIONS":
        return func.HttpResponse(status_code=204, headers=_cors_headers(req))

    try:
        req_body = req.get_json()
    except ValueError:
        req_body = {}

    user_message = (req_body.get("message") or "").strip()
    if not user_message:
        _console("Missing/empty message")
        return func.HttpResponse(
            json.dumps({"ok": False, "error": "Provide a non-empty 'message'."}),
            status_code=400,
            mimetype="application/json",
            headers=_cors_headers(req),
        )

    try:
        _console(f"Message length={len(user_message)}")
        system_prompt = _rudy_system_prompt()
        top_chunks = _rudy_rag_retrieve(user_message)
        _console(f"RAG chunks={len(top_chunks)}")
        reference_block = "\n\n".join(
            [f"[Excerpt {i+1}]\n{txt}" for i, txt in enumerate(top_chunks)]
        )
        user_input = (
            f"INTERVIEWER_QUESTION: {user_message}\n\n"
            f"RETRIEVED_CONTEXT:\n{reference_block}\n"
        )
        model = (os.getenv("OPENAI_MODEL") or "gpt-4o-mini").strip()
        _console(f"OpenAI model={model}")
        resp = _openai().responses.create(
            model=model,
            instructions=system_prompt,
            input=user_input,
        )
        reply = (getattr(resp, "output_text", "") or "").strip()
        if not reply:
            reply = "Sorry — I couldn’t generate a response right now."
    except RuntimeError as e:
        logging.error("Chat configuration error: %s", e)
        _console(f"RuntimeError: {e}")
        return func.HttpResponse(
            json.dumps({"ok": False, "error": str(e)}),
            status_code=500,
            mimetype="application/json",
            headers=_cors_headers(req),
        )
    except Exception:
        logging.exception("Chat request failed.")
        _console("Exception: chat request failed (see function logs for traceback)")
        return func.HttpResponse(
            json.dumps({"ok": False, "error": "Chat request failed."}),
            status_code=502,
            mimetype="application/json",
            headers=_cors_headers(req),
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
