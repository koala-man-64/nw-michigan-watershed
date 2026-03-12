from __future__ import annotations

import datetime
import types

import function_app

from conftest import make_request, response_json


def test_read_csv_requires_blob_name() -> None:
    response = function_app.read_csv(make_request(path="/api/read-csv"))

    assert response.status_code == 400
    assert response_json(response)["error"] == "Provide blob (query/body) or set BLOB_NAME"


def test_read_csv_rejects_disallowed_blob(monkeypatch) -> None:
    monkeypatch.setattr(function_app, "public_blobs", lambda: {"allowed.csv"})

    response = function_app.read_csv(
        make_request(path="/api/read-csv", params={"blob": "blocked.csv"})
    )

    assert response.status_code == 403
    assert response_json(response)["error"] == "Blob not allowed"


def test_read_csv_returns_csv_with_contract_headers(monkeypatch) -> None:
    monkeypatch.setattr(function_app, "public_blobs", lambda: {"allowed.csv"})
    monkeypatch.setattr(
        function_app,
        "download_blob_cached",
        lambda container, blob_name: types.SimpleNamespace(
            data=b"Name\nBoardman\n",
            etag="etag-1",
            last_modified=datetime.datetime(2026, 3, 11, 12, 0, tzinfo=datetime.timezone.utc),
            cache_hit=False,
        ),
    )

    response = function_app.read_csv(
        make_request(path="/api/read-csv", params={"blob": "allowed.csv"})
    )

    assert response.status_code == 200
    assert response.mimetype == "text/csv"
    assert response.get_body() == b"Name\nBoardman\n"
    assert response.headers["Content-Disposition"] == 'inline; filename="allowed.csv"'
    assert response.headers["Cache-Control"] == "public, max-age=3600, stale-while-revalidate=86400"
    assert response.headers["ETag"] == '"etag-1"'
    assert response.headers["Last-Modified"] == "Wed, 11 Mar 2026 12:00:00 GMT"
    assert response.headers["X-Request-Id"]


def test_read_csv_returns_json_rows(monkeypatch) -> None:
    monkeypatch.setattr(function_app, "public_blobs", lambda: {"allowed.csv"})
    monkeypatch.setattr(
        function_app,
        "download_blob_cached",
        lambda container, blob_name: types.SimpleNamespace(
            data=b"Site,Year\nLake A,2024\n",
            etag="etag-2",
            last_modified=datetime.datetime(2026, 3, 11, 12, 0, tzinfo=datetime.timezone.utc),
            cache_hit=False,
        ),
    )

    response = function_app.read_csv(
        make_request(path="/api/read-csv", params={"blob": "allowed.csv", "format": "json"})
    )

    assert response.status_code == 200
    assert response_json(response) == [{"Site": "Lake A", "Year": "2024"}]
    assert response.headers["ETag"] == '"etag-2"'


def test_read_csv_returns_404_for_missing_blob(monkeypatch) -> None:
    monkeypatch.setattr(function_app, "public_blobs", lambda: {"allowed.csv"})
    monkeypatch.setattr(
        function_app,
        "download_blob_cached",
        lambda container, blob_name: (_ for _ in ()).throw(function_app.ResourceNotFoundError("missing")),
    )

    response = function_app.read_csv(
        make_request(path="/api/read-csv", params={"blob": "allowed.csv"})
    )

    assert response.status_code == 404
    assert response_json(response)["error"] == "Blob not found"


def test_read_csv_returns_500_for_unexpected_error(monkeypatch) -> None:
    monkeypatch.setattr(function_app, "public_blobs", lambda: {"allowed.csv"})
    monkeypatch.setattr(
        function_app,
        "download_blob_cached",
        lambda container, blob_name: (_ for _ in ()).throw(RuntimeError("boom")),
    )

    response = function_app.read_csv(
        make_request(path="/api/read-csv", params={"blob": "allowed.csv"})
    )

    assert response.status_code == 500
    assert response_json(response)["error"] == "Internal server error"


def test_read_csv_returns_304_when_request_etag_matches(monkeypatch) -> None:
    monkeypatch.setattr(function_app, "public_blobs", lambda: {"allowed.csv"})
    monkeypatch.setattr(
        function_app,
        "download_blob_cached",
        lambda container, blob_name: types.SimpleNamespace(
            data=b"Name\nBoardman\n",
            etag="etag-1",
            last_modified=datetime.datetime(2026, 3, 11, 12, 0, tzinfo=datetime.timezone.utc),
            cache_hit=True,
        ),
    )

    response = function_app.read_csv(
        make_request(
            path="/api/read-csv",
            params={"blob": "allowed.csv"},
            headers={"If-None-Match": '"etag-1"'},
        )
    )

    assert response.status_code == 304
    assert response.get_body() == b""
    assert response.headers["ETag"] == '"etag-1"'
    assert response.headers["X-Request-Id"]
