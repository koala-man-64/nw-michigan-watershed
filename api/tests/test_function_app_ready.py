from __future__ import annotations

import function_app

from conftest import make_request, make_swa_principal_header, response_json


def test_ready_requires_authenticated_principal() -> None:
    response = function_app.ready(make_request(path="/api/ready"))

    assert response.status_code == 401
    assert response_json(response) == {
        "ok": False,
        "error": "Authentication required",
        "requestId": response.headers["X-Request-Id"],
    }


def test_ready_returns_ok_when_shallow_checks_pass(monkeypatch) -> None:
    monkeypatch.setattr(function_app, "blob_service_client", lambda: object())
    monkeypatch.setattr(function_app, "check_openai_client", lambda: None)
    monkeypatch.setattr(function_app, "sql_from_env", lambda: {"server": "sql"})

    response = function_app.ready(
        make_request(path="/api/ready", headers=make_swa_principal_header("authenticated"))
    )

    assert response.status_code == 200
    payload = response_json(response)
    assert payload["ok"] is True
    assert payload["mode"] == "config"
    assert payload["checks"]["storageClient"]["ok"] is True
    assert payload["checks"]["openaiClient"]["ok"] is True
    assert payload["checks"]["sql"]["ok"] is True


def test_ready_returns_503_when_deep_check_fails(monkeypatch) -> None:
    monkeypatch.setattr(function_app, "blob_service_client", lambda: object())
    monkeypatch.setattr(function_app, "check_openai_client", lambda: None)
    monkeypatch.setattr(function_app, "check_storage_connection", lambda: None)
    monkeypatch.setattr(function_app, "check_blob_access", lambda container, blob: None)
    monkeypatch.setattr(function_app, "check_chat_assets", lambda: (_ for _ in ()).throw(RuntimeError("rag missing")))
    monkeypatch.setattr(function_app, "check_sql_connection", lambda: None)

    response = function_app.ready(
        make_request(
            path="/api/ready",
            params={"deep": "1"},
            headers=make_swa_principal_header("authenticated"),
        )
    )

    assert response.status_code == 503
    payload = response_json(response)
    assert payload["ok"] is False
    assert payload["mode"] == "deep"
    assert payload["checks"]["chatAssets"]["ok"] is False
    assert payload["checks"]["chatAssets"]["error"] == "rag missing"
