from __future__ import annotations

import base64
import hashlib
import json
import logging
import time
import uuid
from random import SystemRandom
from typing import Any, Optional

import azure.functions as func

from config import env, env_int

_entropy = SystemRandom()


def request_id_for(req: func.HttpRequest) -> str:
    incoming = (
        req.headers.get("x-request-id")
        or req.headers.get("X-Request-ID")
        or req.headers.get("x-ms-request-id")
    )
    return incoming.strip() if incoming else str(uuid.uuid4())


def log_with_request(message: str, request_id: str, **fields: Any) -> None:
    suffix = " ".join(f"{key}={value!r}" for key, value in fields.items())
    if suffix:
        logging.info("%s request_id=%s %s", message, request_id, suffix)
    else:
        logging.info("%s request_id=%s", message, request_id)


def allowed_origins() -> set[str]:
    raw = (env("CORS_ALLOWED_ORIGINS") or "").strip()
    if not raw:
        return {"http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:4280"}
    return {origin.strip() for origin in raw.split(",") if origin.strip()}


def cors_headers(req: func.HttpRequest) -> dict[str, str]:
    origin = req.headers.get("Origin")
    if not origin or origin not in allowed_origins():
        return {}
    return {
        "Access-Control-Allow-Origin": origin,
        "Vary": "Origin",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Request-Id",
        "Access-Control-Max-Age": "86400",
    }


def response_headers(req: func.HttpRequest, request_id: str, extra: Optional[dict[str, str]] = None) -> dict[str, str]:
    headers = {**cors_headers(req), "X-Request-Id": request_id}
    if extra:
        headers.update(extra)
    return headers


def json_response(
    req: func.HttpRequest,
    request_id: str,
    payload: Any,
    *,
    status_code: int = 200,
    extra_headers: Optional[dict[str, str]] = None,
) -> func.HttpResponse:
    return func.HttpResponse(
        json.dumps(payload, default=str),
        status_code=status_code,
        mimetype="application/json",
        headers=response_headers(req, request_id, extra_headers),
    )


def text_response(
    req: func.HttpRequest,
    request_id: str,
    body: str,
    *,
    status_code: int = 200,
    mimetype: str = "text/plain",
    extra_headers: Optional[dict[str, str]] = None,
) -> func.HttpResponse:
    return func.HttpResponse(
        body,
        status_code=status_code,
        mimetype=mimetype,
        headers=response_headers(req, request_id, extra_headers),
    )


def bytes_response(
    req: func.HttpRequest,
    request_id: str,
    body: bytes,
    *,
    status_code: int = 200,
    mimetype: str = "application/octet-stream",
    extra_headers: Optional[dict[str, str]] = None,
) -> func.HttpResponse:
    return func.HttpResponse(
        body=body,
        status_code=status_code,
        mimetype=mimetype,
        headers=response_headers(req, request_id, extra_headers),
    )


def parse_json_body(req: func.HttpRequest) -> dict[str, Any]:
    try:
        payload = req.get_json()
    except ValueError:
        return {}
    return payload if isinstance(payload, dict) else {}


def request_params(req: func.HttpRequest) -> dict[str, str]:
    query = {key.lower(): value for key, value in req.params.items()}
    body = parse_json_body(req)

    def pick(name: str, env_name: Optional[str] = None, default: Optional[str] = None) -> Optional[str]:
        return query.get(name) or body.get(name) or env((env_name or name).upper(), default)

    return {
        "container": pick("container", "BLOB_CONTAINER"),
        "blob": pick("blob", "BLOB_NAME"),
        "format": (pick("format") or "csv").lower(),
    }


def get_swa_principal(req: func.HttpRequest) -> Optional[dict[str, Any]]:
    raw_principal = req.headers.get("x-ms-client-principal")
    if not raw_principal:
        return None
    try:
        decoded = base64.b64decode(raw_principal).decode("utf-8")
        data = json.loads(decoded)
    except Exception:
        return None
    return data if isinstance(data, dict) else None


def require_swa_role(req: func.HttpRequest, required_role: str) -> bool:
    principal = get_swa_principal(req)
    if not principal:
        return False
    roles = principal.get("userRoles") or []
    return required_role in roles


def truncate(value: str, max_len: int) -> str:
    return value if len(value) <= max_len else value[:max_len]


def get_client_ip(req: func.HttpRequest) -> str:
    forwarded_for = req.headers.get("x-forwarded-for") or req.headers.get("X-Forwarded-For")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    for header in ("x-azure-clientip", "X-Azure-ClientIP", "client-ip", "Client-IP"):
        value = req.headers.get(header)
        if value:
            return value.strip()
    return ""


def ip_for_storage(raw_ip: str) -> str:
    mode = (env("LOG_EVENT_IP_MODE", "hash") or "hash").strip().lower()
    if mode == "none":
        return ""
    if mode == "hash":
        return hashlib.sha256((raw_ip or "").encode("utf-8")).hexdigest()
    return raw_ip or ""


def should_sample() -> bool:
    raw = (env("LOG_EVENT_SAMPLE_RATE", "1.0") or "1.0").strip()
    try:
        rate = float(raw)
    except Exception:
        rate = 1.0
    if rate >= 1.0:
        return True
    if rate <= 0.0:
        return False
    return _entropy.random() < rate


_rate_state: dict[str, list[float]] = {}


def rate_limit_key(req: func.HttpRequest) -> str:
    principal = get_swa_principal(req) or {}
    return principal.get("userId") or principal.get("userDetails") or get_client_ip(req) or "unknown"


def is_rate_limited(req: func.HttpRequest) -> bool:
    max_events = env_int("LOG_EVENT_RATE_LIMIT_MAX", 60)
    window_sec = env_int("LOG_EVENT_RATE_LIMIT_WINDOW_SEC", 60)
    if max_events <= 0 or window_sec <= 0:
        return False

    now = time.time()
    key = rate_limit_key(req)
    timestamps = _rate_state.get(key, [])
    cutoff = now - window_sec
    timestamps = [timestamp for timestamp in timestamps if timestamp >= cutoff]
    if len(timestamps) >= max_events:
        _rate_state[key] = timestamps
        return True

    timestamps.append(now)
    _rate_state[key] = timestamps
    return False
