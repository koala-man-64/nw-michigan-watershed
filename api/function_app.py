import csv
import datetime
import io
import logging
import os

import azure.functions as func

from chat_rudy_service import generate_reply
from config import load_local_env_file
from http_utils import (
    bytes_response,
    get_client_ip,
    ip_for_storage,
    is_rate_limited,
    json_response,
    log_with_request,
    parse_json_body,
    request_id_for,
    request_params,
    require_swa_role,
    should_sample,
    text_response,
    truncate,
)
from sql import write_log_event
from storage import (
    ResourceNotFoundError,
    allow_arbitrary_blob_reads,
    download_blob,
    public_blobs,
    public_container,
)

try:
    import debugpy
except Exception:
    debugpy = None


load_local_env_file()


def maybe_enable_debugpy() -> None:
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


app = func.FunctionApp()


@app.function_name(name="health")
@app.route(route="health", methods=["GET"], auth_level=func.AuthLevel.ANONYMOUS)
def health(req: func.HttpRequest) -> func.HttpResponse:
    request_id = request_id_for(req)
    return json_response(
        req,
        request_id,
        {"ok": True, "service": "nwmiws-api", "requestId": request_id},
    )


@app.function_name(name="chat_rudy")
@app.route(route="chat-rudy", methods=["POST", "OPTIONS"], auth_level=func.AuthLevel.ANONYMOUS)
def chat_rudy(req: func.HttpRequest) -> func.HttpResponse:
    request_id = request_id_for(req)
    log_with_request("chat_rudy: received request", request_id, method=req.method)
    if req.method == "OPTIONS":
        return text_response(req, request_id, "", status_code=204)

    req_body = parse_json_body(req)
    user_message = (req_body.get("message") or "").strip()
    if not user_message:
        log_with_request("chat_rudy: missing message", request_id)
        return json_response(
            req,
            request_id,
            {"ok": False, "error": "Provide a non-empty 'message'.", "requestId": request_id},
            status_code=400,
        )

    try:
        result = generate_reply(user_message)
        log_with_request(
            "chat_rudy: completed",
            request_id,
            model=result["model"],
            rag_chunks=result["rag_chunks"],
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


@app.function_name(name="hello")
@app.route(route="hello", methods=["GET", "POST"], auth_level=func.AuthLevel.ANONYMOUS)
def hello(req: func.HttpRequest) -> func.HttpResponse:
    request_id = request_id_for(req)
    name = req.params.get("name") or parse_json_body(req).get("name")
    if not name:
        return text_response(
            req,
            request_id,
            "Please pass a 'name' in query or JSON body.",
            status_code=400,
        )
    return text_response(req, request_id, f"Hello, {name}!")


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

    try:
        data = download_blob(container, blob_name)
        if params["format"] == "json":
            rows = csv_to_rows(data)
            log_with_request("read_csv: returning json", request_id, rows=len(rows))
            return json_response(req, request_id, rows)

        log_with_request("read_csv: returning csv", request_id, bytes=len(data))
        return bytes_response(
            req,
            request_id,
            data,
            mimetype="text/csv",
            extra_headers={"Content-Disposition": f'inline; filename="{os.path.basename(blob_name)}"'},
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
    if req.method == "OPTIONS":
        return text_response(req, request_id, "", status_code=204)

    if os.getenv("LOG_EVENT_ENABLED", "1").strip() != "1":
        return json_response(req, request_id, {"status": "disabled", "requestId": request_id})

    required_role = os.getenv("LOG_EVENT_REQUIRED_ROLE", "authenticated")
    if not require_swa_role(req, required_role):
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

    if is_rate_limited(req):
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

    return json_response(
        req,
        request_id,
        {"status": "ok", "message": "Log data received and inserted.", "requestId": request_id},
    )
