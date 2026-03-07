from __future__ import annotations

import function_app

from conftest import make_request, make_swa_principal_header, response_json


def test_chat_rudy_returns_404_when_feature_disabled() -> None:
    response = function_app.chat_rudy(
        make_request(method="POST", path="/api/chat-rudy", json_body={"message": "hello"})
    )

    assert response.status_code == 404
    payload = response_json(response)
    assert payload["ok"] is False
    assert payload["error"] == "Chat is unavailable."
    assert payload["requestId"] == response.headers["X-Request-Id"]


def test_chat_rudy_requires_authenticated_principal_when_enabled(monkeypatch) -> None:
    monkeypatch.setenv("CHAT_ENABLED", "1")

    response = function_app.chat_rudy(
        make_request(method="POST", path="/api/chat-rudy", json_body={"message": "hello"})
    )

    assert response.status_code == 401
    assert response_json(response)["error"] == "Authentication required"


def test_chat_rudy_rejects_empty_message(monkeypatch) -> None:
    monkeypatch.setenv("CHAT_ENABLED", "1")

    response = function_app.chat_rudy(
        make_request(
            method="POST",
            path="/api/chat-rudy",
            headers=make_swa_principal_header("authenticated"),
            json_body={"message": "   "},
        )
    )

    assert response.status_code == 400
    assert response_json(response)["error"] == "Provide a non-empty 'message'."


def test_chat_rudy_rejects_oversized_message(monkeypatch) -> None:
    monkeypatch.setenv("CHAT_ENABLED", "1")
    monkeypatch.setenv("CHAT_MAX_MESSAGE_CHARS", "4")

    response = function_app.chat_rudy(
        make_request(
            method="POST",
            path="/api/chat-rudy",
            headers=make_swa_principal_header("authenticated"),
            json_body={"message": "hello"},
        )
    )

    assert response.status_code == 413
    assert response_json(response)["error"] == "Message exceeds 4 characters."


def test_chat_rudy_returns_429_when_rate_limited(monkeypatch) -> None:
    monkeypatch.setenv("CHAT_ENABLED", "1")
    monkeypatch.setattr(function_app, "is_rate_limited", lambda *args, **kwargs: True)

    response = function_app.chat_rudy(
        make_request(
            method="POST",
            path="/api/chat-rudy",
            headers=make_swa_principal_header("authenticated"),
            json_body={"message": "hello"},
        )
    )

    assert response.status_code == 429
    assert response_json(response)["error"] == "Too many requests"


def test_chat_rudy_returns_500_for_runtime_configuration_error(monkeypatch) -> None:
    monkeypatch.setenv("CHAT_ENABLED", "1")
    monkeypatch.setattr(function_app, "generate_reply", lambda message: (_ for _ in ()).throw(RuntimeError("missing model")))

    response = function_app.chat_rudy(
        make_request(
            method="POST",
            path="/api/chat-rudy",
            headers=make_swa_principal_header("authenticated"),
            json_body={"message": "hello"},
        )
    )

    assert response.status_code == 500
    assert response_json(response)["error"] == "missing model"


def test_chat_rudy_returns_502_for_unexpected_error(monkeypatch) -> None:
    monkeypatch.setenv("CHAT_ENABLED", "1")
    monkeypatch.setattr(function_app, "generate_reply", lambda message: (_ for _ in ()).throw(ValueError("boom")))

    response = function_app.chat_rudy(
        make_request(
            method="POST",
            path="/api/chat-rudy",
            headers=make_swa_principal_header("authenticated"),
            json_body={"message": "hello"},
        )
    )

    assert response.status_code == 502
    assert response_json(response)["error"] == "Chat request failed."


def test_chat_rudy_returns_success_contract(monkeypatch) -> None:
    monkeypatch.setenv("CHAT_ENABLED", "1")
    monkeypatch.setattr(
        function_app,
        "generate_reply",
        lambda message: {"reply": f"echo:{message}", "model": "gpt-test", "rag_chunks": 2},
    )

    response = function_app.chat_rudy(
        make_request(
            method="POST",
            path="/api/chat-rudy",
            headers=make_swa_principal_header("authenticated"),
            json_body={"message": "hello"},
        )
    )

    assert response.status_code == 200
    payload = response_json(response)
    assert payload == {
        "ok": True,
        "message": "hello",
        "reply": "echo:hello",
        "requestId": response.headers["X-Request-Id"],
    }
