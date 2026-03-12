from __future__ import annotations

import csv
import datetime
import io
import logging
import os
import time
from email.utils import parsedate_to_datetime

import azure.functions as func

from chat_rudy_service import check_chat_assets, check_openai_client, generate_reply
from config import env, env_bool, env_int, load_local_env_file, skip_local_bootstrap
from http_utils import (
    bytes_response,
    elapsed_ms,
    get_client_ip,
    ip_for_storage,
    is_authenticated_request,
    is_rate_limited,
    json_response,
    log_with_request,
    parse_json_body,
    request_id_for,
    request_params,
    require_swa_role,
    response_headers,
    should_sample,
    text_response,
    truncate,
)
from sql import check_sql_connection, sql_from_env, write_log_event
from storage import (
    ResourceNotFoundError,
    allow_arbitrary_blob_reads,
    blob_service_client,
    check_blob_access,
    check_storage_connection,
    download_blob_cached,
    public_blobs,
    public_container,
)

try:
    import debugpy
except Exception:
    debugpy = None


load_local_env_file()


def maybe_enable_debugpy() -> None:
    if skip_local_bootstrap():
        return
    if os.getenv("ENABLE_DEBUGPY") != "1":
        return
    if debugpy is None:
        logging.info("ENABLE_DEBUGPY=1 but debugpy is not installed in this environment.")
        return

    host = os.getenv("DEBUGPY_HOST", "127.0.0.1")
    port = int(os.getenv("DEBUGPY_PORT", "5678"))
    try:
        debugpy.listen((host, port))
        logging.info("debugpy listening on %s:%s", host, port)
    except RuntimeError:
        pass
    if os.getenv("WAIT_FOR_DEBUGGER") == "1":
        logging.info("Waiting for debugger to attach...")
        debugpy.wait_for_client()


maybe_enable_debugpy()


def csv_to_rows(data: bytes):
    try:
        text = data.decode("utf-8")
    except Exception:
        text = data.decode("latin-1")
    reader = csv.DictReader(io.StringIO(text))
    return [dict(row) for row in reader]


def read_csv_browser_cache_max_age_sec() -> int:
    return max(0, env_int("READ_CSV_BROWSER_CACHE_MAX_AGE_SEC", 3600))


def read_csv_browser_cache_swr_sec() -> int:
    return max(0, env_int("READ_CSV_BROWSER_CACHE_SWR_SEC", 86400))


def normalize_http_etag(value: str | None) -> str:
    candidate = (value or "").strip()
    if candidate.startswith("W/"):
        candidate = candidate[2:].strip()
    if len(candidate) >= 2 and candidate[0] == candidate[-1] and candidate[0] in {"'", '"'}:
        candidate = candidate[1:-1]
    return candidate.strip()


def quote_http_etag(value: str | None) -> str | None:
    normalized = normalize_http_etag(value)
    return f'"{normalized}"' if normalized else None


def etag_matches(header_value: str | None, etag: str | None) -> bool:
    normalized = normalize_http_etag(etag)
    if not header_value or not normalized:
        return False

    for token in header_value.split(","):
        candidate = token.strip()
        if candidate == "*":
            return True
        if normalize_http_etag(candidate) == normalized:
            return True
    return False


def format_http_datetime(value: datetime.datetime | None) -> str | None:
    if value is None:
        return None

    as_utc = value.astimezone(datetime.timezone.utc) if value.tzinfo else value.replace(tzinfo=datetime.timezone.utc)
    return as_utc.strftime("%a, %d %b %Y %H:%M:%S GMT")


def is_not_modified(req: func.HttpRequest, etag: str | None, last_modified: datetime.datetime | None) -> bool:
    if etag_matches(req.headers.get("If-None-Match"), etag):
        return True

    if_modified_since = req.headers.get("If-Modified-Since")
    if not if_modified_since or last_modified is None:
        return False

    try:
        requested_time = parsedate_to_datetime(if_modified_since)
    except Exception:
        return False

    if requested_time.tzinfo is None:
        requested_time = requested_time.replace(tzinfo=datetime.timezone.utc)
    blob_time = last_modified.astimezone(datetime.timezone.utc) if last_modified.tzinfo else last_modified.replace(tzinfo=datetime.timezone.utc)
    return blob_time.replace(microsecond=0) <= requested_time.astimezone(datetime.timezone.utc).replace(microsecond=0)


def read_csv_cache_control() -> str:
    max_age = read_csv_browser_cache_max_age_sec()
    stale_while_revalidate = read_csv_browser_cache_swr_sec()
    if max_age <= 0 and stale_while_revalidate <= 0:
        return "no-store"

    directives = ["public", f"max-age={max_age}"]
    if stale_while_revalidate > 0:
        directives.append(f"stale-while-revalidate={stale_while_revalidate}")
    return ", ".join(directives)


def read_csv_response_headers(blob_name: str, etag: str | None, last_modified: datetime.datetime | None) -> dict[str, str]:
    headers = {
        "Content-Disposition": f'inline; filename="{os.path.basename(blob_name)}"',
        "Cache-Control": read_csv_cache_control(),
    }
    quoted_etag = quote_http_etag(etag)
    if quoted_etag:
        headers["ETag"] = quoted_etag
    last_modified_header = format_http_datetime(last_modified)
    if last_modified_header:
        headers["Last-Modified"] = last_modified_header
    return headers


app = func.FunctionApp()


def require_route_access(
    req: func.HttpRequest,
    request_id: str,
    *,
    allow_anonymous_env: str,
    required_role_env: str,
    default_role: str = "authenticated",
) -> func.HttpResponse | None:
    if env_bool(allow_anonymous_env, False):
        return None

    required_role = env(required_role_env, default_role) or default_role
    if require_swa_role(req, required_role):
        return None

    return json_response(
        req,
        request_id,
        {"ok": False, "error": "Authentication required", "requestId": request_id},
        status_code=401,
    )


def preferred_public_blob() -> str | None:
    preferred = ("locations.csv", "info.csv")
    allowed = public_blobs()
    for blob_name in preferred:
        if blob_name in allowed:
            return blob_name
    return next(iter(allowed), None)


def run_readiness_check(name: str, checks: dict[str, dict[str, object]], probe) -> bool:
    started = time.perf_counter()
    try:
        probe()
    except Exception as exc:
        checks[name] = {
            "ok": False,
            "durationMs": elapsed_ms(started),
            "error": str(exc),
        }
        return False

    checks[name] = {"ok": True, "durationMs": elapsed_ms(started)}
    return True


@app.function_name(name="health")
@app.route(route="health", methods=["GET"], auth_level=func.AuthLevel.ANONYMOUS)
def health(req: func.HttpRequest) -> func.HttpResponse:
    request_id = request_id_for(req)
    return json_response(
        req,
        request_id,
        {"ok": True, "service": "nwmiws-api", "requestId": request_id},
    )


@app.function_name(name="ready")
@app.route(route="ready", methods=["GET"], auth_level=func.AuthLevel.ANONYMOUS)
def ready(req: func.HttpRequest) -> func.HttpResponse:
    request_id = request_id_for(req)
    authenticated = is_authenticated_request(req)
    access_response = require_route_access(
        req,
        request_id,
        allow_anonymous_env="READINESS_ALLOW_ANONYMOUS",
        required_role_env="READINESS_REQUIRED_ROLE",
    )
    if access_response is not None:
        log_with_request("ready: authentication required", request_id, route="ready", authenticated=authenticated)
        return access_response

    started = time.perf_counter()
    deep = (req.params.get("deep") or "").strip() == "1"
    checks: dict[str, dict[str, object]] = {}
    ok = True

    ok = run_readiness_check("storageClient", checks, blob_service_client) and ok
    ok = run_readiness_check("openaiClient", checks, check_openai_client) and ok

    if deep:
        ok = run_readiness_check("storageAccess", checks, check_storage_connection) and ok
        blob_name = preferred_public_blob()
        if blob_name:
            ok = run_readiness_check(
                "publicBlob",
                checks,
                lambda: check_blob_access(public_container(), blob_name),
            ) and ok
        ok = run_readiness_check("chatAssets", checks, check_chat_assets) and ok

    if (env("LOG_EVENT_ENABLED", "1") or "1").strip() == "1":
        sql_probe = check_sql_connection if deep else sql_from_env
        ok = run_readiness_check("sql", checks, sql_probe) and ok

    status_code = 200 if ok else 503
    failed_checks = [name for name, result in checks.items() if not result["ok"]]
    log_with_request(
        "ready: completed",
        request_id,
        route="ready",
        authenticated=authenticated,
        deep=deep,
        ok=ok,
        failed_checks=failed_checks,
        duration_ms=elapsed_ms(started),
    )
    return json_response(
        req,
        request_id,
        {
            "ok": ok,
            "service": "nwmiws-api",
            "mode": "deep" if deep else "config",
            "checks": checks,
            "requestId": request_id,
        },
        status_code=status_code,
    )


@app.function_name(name="chat_rudy")
@app.route(route="chat-rudy", methods=["POST", "OPTIONS"], auth_level=func.AuthLevel.ANONYMOUS)
def chat_rudy(req: func.HttpRequest) -> func.HttpResponse:
    request_id = request_id_for(req)
    authenticated = is_authenticated_request(req)
    feature_enabled = env_bool("CHAT_ENABLED", False)
    log_with_request(
        "chat_rudy: received request",
        request_id,
        route="chat-rudy",
        method=req.method,
        authenticated=authenticated,
        feature_enabled=feature_enabled,
    )
    if req.method == "OPTIONS":
        return text_response(req, request_id, "", status_code=204)

    if not feature_enabled:
        log_with_request(
            "chat_rudy: disabled",
            request_id,
            route="chat-rudy",
            authenticated=authenticated,
            feature_enabled=feature_enabled,
        )
        return json_response(
            req,
            request_id,
            {"ok": False, "error": "Chat is unavailable.", "requestId": request_id},
            status_code=404,
        )

    access_response = require_route_access(
        req,
        request_id,
        allow_anonymous_env="CHAT_ALLOW_ANONYMOUS",
        required_role_env="CHAT_REQUIRED_ROLE",
    )
    if access_response is not None:
        log_with_request(
            "chat_rudy: authentication required",
            request_id,
            route="chat-rudy",
            authenticated=authenticated,
            feature_enabled=feature_enabled,
        )
        return access_response

    if is_rate_limited(req, prefix="CHAT", default_max=12, default_window=60, bucket="chat-rudy"):
        log_with_request(
            "chat_rudy: rate limited",
            request_id,
            route="chat-rudy",
            authenticated=authenticated,
            rate_limited=True,
            feature_enabled=feature_enabled,
        )
        return json_response(
            req,
            request_id,
            {"ok": False, "error": "Too many requests", "requestId": request_id},
            status_code=429,
        )

    req_body = parse_json_body(req)
    user_message = (req_body.get("message") or "").strip()
    max_message_chars = env_int("CHAT_MAX_MESSAGE_CHARS", 2000)
    if not user_message:
        log_with_request(
            "chat_rudy: missing message",
            request_id,
            route="chat-rudy",
            authenticated=authenticated,
            feature_enabled=feature_enabled,
        )
        return json_response(
            req,
            request_id,
            {"ok": False, "error": "Provide a non-empty 'message'.", "requestId": request_id},
            status_code=400,
        )
    if len(user_message) > max_message_chars:
        log_with_request(
            "chat_rudy: message too large",
            request_id,
            route="chat-rudy",
            authenticated=authenticated,
            feature_enabled=feature_enabled,
            message_chars=len(user_message),
        )
        return json_response(
            req,
            request_id,
            {
                "ok": False,
                "error": f"Message exceeds {max_message_chars} characters.",
                "requestId": request_id,
            },
            status_code=413,
        )

    started = time.perf_counter()
    try:
        result = generate_reply(user_message)
        log_with_request(
            "chat_rudy: completed",
            request_id,
            route="chat-rudy",
            authenticated=authenticated,
            feature_enabled=feature_enabled,
            model=result["model"],
            rag_chunks=result["rag_chunks"],
            duration_ms=elapsed_ms(started),
        )
    except RuntimeError as exc:
        logging.info("chat_rudy: configuration error request_id=%s", request_id, exc_info=True)
        return json_response(
            req,
            request_id,
            {"ok": False, "error": str(exc), "requestId": request_id},
            status_code=500,
        )
    except Exception:
        logging.info("chat_rudy: request failed request_id=%s", request_id, exc_info=True)
        return json_response(
            req,
            request_id,
            {"ok": False, "error": "Chat request failed.", "requestId": request_id},
            status_code=502,
        )

    return json_response(
        req,
        request_id,
        {
            "ok": True,
            "message": user_message,
            "reply": result["reply"],
            "requestId": request_id,
        },
    )


@app.function_name(name="read_csv")
@app.route(route="read-csv", methods=["GET", "POST", "OPTIONS"], auth_level=func.AuthLevel.ANONYMOUS)
def read_csv(req: func.HttpRequest) -> func.HttpResponse:
    request_id = request_id_for(req)
    log_with_request("read_csv: received request", request_id, method=req.method)
    if req.method == "OPTIONS":
        return text_response(req, request_id, "", status_code=204)

    params = request_params(req)
    if not params["blob"]:
        return json_response(
            req,
            request_id,
            {"error": "Provide blob (query/body) or set BLOB_NAME", "requestId": request_id},
            status_code=400,
        )

    if allow_arbitrary_blob_reads():
        container = params["container"] or public_container()
        blob_name = params["blob"]
    else:
        container = public_container()
        blob_name = params["blob"]
        if blob_name not in public_blobs():
            log_with_request("read_csv: blob not allowed", request_id, blob=blob_name)
            return json_response(
                req,
                request_id,
                {"error": "Blob not allowed", "requestId": request_id},
                status_code=403,
            )

    started = time.perf_counter()
    try:
        blob = download_blob_cached(container, blob_name)
        headers = read_csv_response_headers(blob_name, blob.etag, blob.last_modified)

        if req.method == "GET" and is_not_modified(req, blob.etag, blob.last_modified):
            log_with_request(
                "read_csv: returning not modified",
                request_id,
                cache_hit=blob.cache_hit,
                duration_ms=elapsed_ms(started),
            )
            return func.HttpResponse(status_code=304, headers=response_headers(req, request_id, headers))

        data = blob.data
        if params["format"] == "json":
            rows = csv_to_rows(data)
            log_with_request(
                "read_csv: returning json",
                request_id,
                rows=len(rows),
                cache_hit=blob.cache_hit,
                duration_ms=elapsed_ms(started),
            )
            return json_response(req, request_id, rows, extra_headers=headers)

        log_with_request(
            "read_csv: returning csv",
            request_id,
            bytes=len(data),
            cache_hit=blob.cache_hit,
            duration_ms=elapsed_ms(started),
        )
        return bytes_response(
            req,
            request_id,
            data,
            mimetype="text/csv",
            extra_headers=headers,
        )
    except ResourceNotFoundError:
        return json_response(
            req,
            request_id,
            {"error": "Blob not found", "requestId": request_id},
            status_code=404,
        )
    except Exception:
        logging.info("read_csv: failed request_id=%s", request_id, exc_info=True)
        return json_response(
            req,
            request_id,
            {"error": "Internal server error", "requestId": request_id},
            status_code=500,
        )


@app.function_name(name="log_event")
@app.route(route="log-event", methods=["POST", "OPTIONS"], auth_level=func.AuthLevel.ANONYMOUS)
def log_event(req: func.HttpRequest) -> func.HttpResponse:
    request_id = request_id_for(req)
    authenticated = is_authenticated_request(req)
    if req.method == "OPTIONS":
        return text_response(req, request_id, "", status_code=204)

    if os.getenv("LOG_EVENT_ENABLED", "1").strip() != "1":
        return json_response(req, request_id, {"status": "disabled", "requestId": request_id})

    required_role = os.getenv("LOG_EVENT_REQUIRED_ROLE", "authenticated")
    if not require_swa_role(req, required_role):
        log_with_request("log_event: authentication required", request_id, route="log-event", authenticated=authenticated)
        return json_response(
            req,
            request_id,
            {"error": "Authentication required", "requestId": request_id},
            status_code=401,
        )

    req_body = parse_json_body(req)
    if not req_body:
        return json_response(
            req,
            request_id,
            {"error": "Invalid JSON", "requestId": request_id},
            status_code=400,
        )

    if is_rate_limited(req, prefix="LOG_EVENT", default_max=60, default_window=60, bucket="log-event"):
        log_with_request("log_event: rate limited", request_id, route="log-event", authenticated=authenticated, rate_limited=True)
        return json_response(
            req,
            request_id,
            {"error": "Too many requests", "requestId": request_id},
            status_code=429,
        )

    if not should_sample():
        return json_response(req, request_id, {"status": "sampled_out", "requestId": request_id})

    event_type = truncate((req_body.get("eventType") or "").strip(), 50)
    target_tag = truncate((req_body.get("targetTag") or "").strip(), 50)
    target_id = truncate((req_body.get("targetId") or "").strip(), 100)
    target_classes = truncate((req_body.get("targetClasses") or "").strip(), 255)
    capture_text = os.getenv("LOG_EVENT_CAPTURE_TEXT", "0").strip() == "1"
    target_text = truncate((req_body.get("targetText") or "").strip(), 255) if capture_text else ""
    client_ip = truncate(ip_for_storage(get_client_ip(req)), 255)
    client_url = truncate((req_body.get("clientUrl") or "").strip(), 255)
    timestamp = datetime.datetime.utcnow()

    if not event_type or not target_tag:
        return json_response(
            req,
            request_id,
            {"error": "Missing required fields: eventType, targetTag", "requestId": request_id},
            status_code=400,
        )

    started = time.perf_counter()
    try:
        write_log_event(
            event_type=event_type,
            target_tag=target_tag,
            target_id=target_id,
            target_classes=target_classes,
            target_text=target_text,
            client_ip=client_ip,
            client_url=client_url,
            timestamp=timestamp,
        )
    except Exception:
        logging.info("log_event: failed request_id=%s", request_id, exc_info=True)
        return json_response(
            req,
            request_id,
            {"error": "Internal server error", "requestId": request_id},
            status_code=500,
        )

    log_with_request(
        "log_event: completed",
        request_id,
        route="log-event",
        authenticated=authenticated,
        event_type=event_type,
        duration_ms=elapsed_ms(started),
    )
    return json_response(
        req,
        request_id,
        {"status": "ok", "message": "Log data received and inserted.", "requestId": request_id},
    )
