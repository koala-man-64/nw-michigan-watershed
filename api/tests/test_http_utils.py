from __future__ import annotations

import json
import uuid

import http_utils

from conftest import make_request, make_swa_principal_header


def test_request_id_for_prefers_existing_header() -> None:
    request = make_request(headers={"x-request-id": "req-123"})

    assert http_utils.request_id_for(request) == "req-123"


def test_request_id_for_generates_uuid_when_missing() -> None:
    request = make_request()

    generated = http_utils.request_id_for(request)

    assert generated
    uuid.UUID(generated)


def test_cors_headers_only_allow_configured_origins(monkeypatch) -> None:
    monkeypatch.setenv("CORS_ALLOWED_ORIGINS", "https://app.example.com")

    allowed = http_utils.cors_headers(make_request(headers={"Origin": "https://app.example.com"}))
    blocked = http_utils.cors_headers(make_request(headers={"Origin": "https://evil.example.com"}))

    assert allowed["Access-Control-Allow-Origin"] == "https://app.example.com"
    assert blocked == {}


def test_request_params_merges_query_body_and_env(monkeypatch) -> None:
    monkeypatch.setenv("BLOB_CONTAINER", "from-env")
    request = make_request(
        method="POST",
        params={"blob": "query.csv"},
        json_body={"container": "from-body", "format": "json"},
    )

    assert http_utils.request_params(request) == {
        "container": "from-body",
        "blob": "query.csv",
        "format": "json",
    }


def test_get_swa_principal_and_auth_helpers() -> None:
    request = make_request(headers=make_swa_principal_header("authenticated", "editor"))

    principal = http_utils.get_swa_principal(request)

    assert principal["userRoles"] == ["authenticated", "editor"]
    assert http_utils.is_authenticated_request(request) is True
    assert http_utils.require_swa_role(request, "editor") is True
    assert http_utils.require_swa_role(request, "admin") is False


def test_ip_for_storage_supports_hash_raw_and_none(monkeypatch) -> None:
    monkeypatch.setenv("LOG_EVENT_IP_MODE", "hash")
    hashed = http_utils.ip_for_storage("203.0.113.10")
    assert hashed != "203.0.113.10"
    assert len(hashed) == 64

    monkeypatch.setenv("LOG_EVENT_IP_MODE", "raw")
    assert http_utils.ip_for_storage("203.0.113.10") == "203.0.113.10"

    monkeypatch.setenv("LOG_EVENT_IP_MODE", "none")
    assert http_utils.ip_for_storage("203.0.113.10") == ""


def test_should_sample_uses_rate(monkeypatch) -> None:
    monkeypatch.setenv("LOG_EVENT_SAMPLE_RATE", "0.5")
    monkeypatch.setattr(http_utils._entropy, "random", lambda: 0.4)
    assert http_utils.should_sample() is True

    monkeypatch.setattr(http_utils._entropy, "random", lambda: 0.9)
    assert http_utils.should_sample() is False


def test_is_rate_limited_respects_window(monkeypatch) -> None:
    request = make_request(headers=make_swa_principal_header("authenticated"))
    monkeypatch.setenv("CHAT_RATE_LIMIT_MAX", "2")
    monkeypatch.setenv("CHAT_RATE_LIMIT_WINDOW_SEC", "10")
    times = iter([100.0, 101.0, 102.0, 120.0])
    monkeypatch.setattr(http_utils.time, "time", lambda: next(times))

    assert http_utils.is_rate_limited(request, prefix="CHAT", bucket="chat") is False
    assert http_utils.is_rate_limited(request, prefix="CHAT", bucket="chat") is False
    assert http_utils.is_rate_limited(request, prefix="CHAT", bucket="chat") is True
    assert http_utils.is_rate_limited(request, prefix="CHAT", bucket="chat") is False


def test_json_response_adds_request_id_header() -> None:
    response = http_utils.json_response(make_request(), "req-1", {"ok": True})

    assert response.headers["X-Request-Id"] == "req-1"
    assert json.loads(response.get_body().decode("utf-8")) == {"ok": True}
