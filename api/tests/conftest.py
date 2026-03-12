from __future__ import annotations

import base64
import json
import os
import sys
from pathlib import Path
from typing import Any

import azure.functions as func
import pytest

os.environ.setdefault("NWMIWS_SKIP_LOCAL_BOOTSTRAP", "1")

API_DIR = Path(__file__).resolve().parents[1]
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))

import chat_rudy_service  # noqa: E402
import http_utils  # noqa: E402
import storage  # noqa: E402


CONTROLLED_ENV_VARS = (
    "ALLOW_ARBITRARY_BLOB_READS",
    "BLOB_CONN",
    "BLOB_CONTAINER",
    "BLOB_NAME",
    "CHAT_ALLOW_ANONYMOUS",
    "CHAT_ENABLED",
    "CHAT_MAX_MESSAGE_CHARS",
    "CHAT_RATE_LIMIT_MAX",
    "CHAT_RATE_LIMIT_WINDOW_SEC",
    "CHAT_REQUIRED_ROLE",
    "CHAT_WITH_RUDY_CONTAINER",
    "CHAT_WITH_RUDY_PROMPT_BLOB",
    "CHAT_WITH_RUDY_RAG_BLOB",
    "CORS_ALLOWED_ORIGINS",
    "LOG_EVENT_CAPTURE_TEXT",
    "LOG_EVENT_ENABLED",
    "LOG_EVENT_IP_MODE",
    "LOG_EVENT_RATE_LIMIT_MAX",
    "LOG_EVENT_RATE_LIMIT_WINDOW_SEC",
    "LOG_EVENT_REQUIRED_ROLE",
    "LOG_EVENT_SAMPLE_RATE",
    "OPENAI_API_KEY",
    "OPENAI_EMBEDDING_MODEL",
    "OPENAI_MAX_RETRIES",
    "OPENAI_MODEL",
    "PUBLIC_BLOB_CONTAINER",
    "PUBLIC_BLOBS",
    "READ_CSV_BROWSER_CACHE_MAX_AGE_SEC",
    "READ_CSV_BROWSER_CACHE_SWR_SEC",
    "READ_CSV_MEMORY_CACHE_TTL_SEC",
    "READINESS_ALLOW_ANONYMOUS",
    "READINESS_REQUIRED_ROLE",
    "RUDY_RAG_CHUNK_OVERLAP",
    "RUDY_RAG_CHUNK_SIZE",
    "RUDY_RAG_MODE",
    "RUDY_RAG_PREFILTER_K",
    "RUDY_RAG_RATE_LIMIT_COOLDOWN_SEC",
    "RUDY_RAG_TOP_K",
    "SAS_TOKEN",
    "SQL_CONNECTION_STRING",
    "SQL_DATABASE",
    "SQL_DRIVER",
    "SQL_PASSWORD",
    "SQL_PORT",
    "SQL_SERVER",
    "SQLSERVER_CONNSTR",
    "SQL_USERNAME",
    "STORAGE_ACCOUNT_NAME",
    "STORAGE_ACCOUNT_URL",
)


def _json_bytes(data: Any) -> bytes:
    return json.dumps(data).encode("utf-8")


def make_swa_principal_header(*roles: str, user_id: str = "user-1", user_details: str = "user@example.com") -> dict[str, str]:
    payload = {
        "auth_typ": "aad",
        "claims": [],
        "name_typ": "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name",
        "role_typ": "http://schemas.microsoft.com/ws/2008/06/identity/claims/role",
        "userId": user_id,
        "userDetails": user_details,
        "userRoles": list(roles) or ["authenticated"],
    }
    principal = base64.b64encode(_json_bytes(payload)).decode("utf-8")
    return {"x-ms-client-principal": principal}


def make_request(
    method: str = "GET",
    path: str = "/api/test",
    *,
    headers: dict[str, str] | None = None,
    params: dict[str, str] | None = None,
    route_params: dict[str, str] | None = None,
    body: bytes | str | None = None,
    json_body: Any | None = None,
) -> func.HttpRequest:
    final_headers = dict(headers or {})
    if json_body is not None:
        final_headers.setdefault("Content-Type", "application/json")
        body_bytes = _json_bytes(json_body)
    else:
        if body is None:
            body_bytes = b""
        elif isinstance(body, str):
            body_bytes = body.encode("utf-8")
        else:
            body_bytes = body

    return func.HttpRequest(
        method=method,
        url=f"http://localhost:7071{path}",
        headers=final_headers,
        params=params or {},
        route_params=route_params or {},
        body=body_bytes,
    )


def response_json(response: func.HttpResponse) -> Any:
    return json.loads(response.get_body().decode("utf-8"))


@pytest.fixture(autouse=True)
def reset_test_state(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("NWMIWS_SKIP_LOCAL_BOOTSTRAP", "1")
    for name in CONTROLLED_ENV_VARS:
        monkeypatch.delenv(name, raising=False)

    http_utils._rate_state.clear()
    storage.reset_storage_caches()
    chat_rudy_service._openai_client = None
    chat_rudy_service._rudy_prompt_cached = None
    chat_rudy_service._rudy_rag_chunks_cached = None
    chat_rudy_service._rudy_rag_embeddings_cached = None
    chat_rudy_service._rudy_rag_embeddings_disabled_until = 0.0
    yield
    http_utils._rate_state.clear()
    storage.reset_storage_caches()
    chat_rudy_service._openai_client = None
    chat_rudy_service._rudy_prompt_cached = None
    chat_rudy_service._rudy_rag_chunks_cached = None
    chat_rudy_service._rudy_rag_embeddings_cached = None
    chat_rudy_service._rudy_rag_embeddings_disabled_until = 0.0
