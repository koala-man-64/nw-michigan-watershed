from __future__ import annotations

import function_app

from conftest import make_request, make_swa_principal_header, response_json


def test_log_event_returns_disabled_when_feature_off(monkeypatch) -> None:
    monkeypatch.setenv("LOG_EVENT_ENABLED", "0")

    response = function_app.log_event(
        make_request(method="POST", path="/api/log-event", json_body={"eventType": "click", "targetTag": "button"})
    )

    assert response.status_code == 200
    assert response_json(response)["status"] == "disabled"


def test_log_event_requires_authenticated_principal() -> None:
    response = function_app.log_event(
        make_request(method="POST", path="/api/log-event", json_body={"eventType": "click", "targetTag": "button"})
    )

    assert response.status_code == 401
    assert response_json(response)["error"] == "Authentication required"


def test_log_event_rejects_invalid_json() -> None:
    response = function_app.log_event(
        make_request(
            method="POST",
            path="/api/log-event",
            headers=make_swa_principal_header("authenticated"),
            body="{not json}",
        )
    )

    assert response.status_code == 400
    assert response_json(response)["error"] == "Invalid JSON"


def test_log_event_returns_429_when_rate_limited(monkeypatch) -> None:
    monkeypatch.setattr(function_app, "is_rate_limited", lambda *args, **kwargs: True)

    response = function_app.log_event(
        make_request(
            method="POST",
            path="/api/log-event",
            headers=make_swa_principal_header("authenticated"),
            json_body={"eventType": "click", "targetTag": "button"},
        )
    )

    assert response.status_code == 429
    assert response_json(response)["error"] == "Too many requests"


def test_log_event_returns_sampled_out(monkeypatch) -> None:
    monkeypatch.setattr(function_app, "should_sample", lambda: False)

    response = function_app.log_event(
        make_request(
            method="POST",
            path="/api/log-event",
            headers=make_swa_principal_header("authenticated"),
            json_body={"eventType": "click", "targetTag": "button"},
        )
    )

    assert response.status_code == 200
    assert response_json(response)["status"] == "sampled_out"


def test_log_event_requires_event_type_and_target_tag() -> None:
    response = function_app.log_event(
        make_request(
            method="POST",
            path="/api/log-event",
            headers=make_swa_principal_header("authenticated"),
            json_body={"eventType": "click"},
        )
    )

    assert response.status_code == 400
    assert response_json(response)["error"] == "Missing required fields: eventType, targetTag"


def test_log_event_returns_500_when_write_fails(monkeypatch) -> None:
    monkeypatch.setattr(function_app, "write_log_event", lambda **kwargs: (_ for _ in ()).throw(RuntimeError("db down")))

    response = function_app.log_event(
        make_request(
            method="POST",
            path="/api/log-event",
            headers=make_swa_principal_header("authenticated"),
            json_body={"eventType": "click", "targetTag": "button"},
        )
    )

    assert response.status_code == 500
    assert response_json(response)["error"] == "Internal server error"


def test_log_event_returns_success_contract(monkeypatch) -> None:
    captured: dict[str, object] = {}

    def fake_write_log_event(**kwargs):
        captured.update(kwargs)

    monkeypatch.setenv("LOG_EVENT_CAPTURE_TEXT", "1")
    monkeypatch.setenv("LOG_EVENT_IP_MODE", "none")
    monkeypatch.setattr(function_app, "write_log_event", fake_write_log_event)

    response = function_app.log_event(
        make_request(
            method="POST",
            path="/api/log-event",
            headers={
                **make_swa_principal_header("authenticated"),
                "x-forwarded-for": "203.0.113.10",
            },
            json_body={
                "eventType": "click",
                "targetTag": "button",
                "targetId": "submit",
                "targetClasses": "primary",
                "targetText": "Submit",
                "clientUrl": "/dashboard",
            },
        )
    )

    assert response.status_code == 200
    assert response_json(response) == {
        "status": "ok",
        "message": "Log data received and inserted.",
        "requestId": response.headers["X-Request-Id"],
    }
    assert captured["event_type"] == "click"
    assert captured["target_text"] == "Submit"
    assert captured["client_url"] == "/dashboard"
