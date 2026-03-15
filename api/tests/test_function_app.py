import datetime
import json
import os
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

import azure.functions as func
from azure.core.exceptions import ResourceNotFoundError

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import function_app


def build_request(method="GET", params=None, headers=None, body=None):
    payload = b""
    if body is not None:
        payload = json.dumps(body).encode("utf-8")

    return func.HttpRequest(
        method=method,
        url="http://localhost/api/test",
        params=params or {},
        headers=headers or {},
        body=payload,
    )


class FunctionAppTests(unittest.TestCase):
    def test_read_csv_requires_blob_name(self):
        response = function_app.read_csv(build_request())

        self.assertEqual(response.status_code, 400)
        self.assertIn("Provide blob", response.get_body().decode("utf-8"))

    def test_read_csv_rejects_unlisted_blob(self):
        with patch.dict(os.environ, {"PUBLIC_BLOBS": "locations.csv"}, clear=False):
            response = function_app.read_csv(
                build_request(params={"blob": "forbidden.csv"})
            )

        self.assertEqual(response.status_code, 403)
        self.assertIn("Blob not allowed", response.get_body().decode("utf-8"))

    def test_read_csv_returns_not_modified_when_etag_matches_cached_entry(self):
        entry = {
            "data": b"col\nvalue\n",
            "etag": "abc123",
            "last_modified": datetime.datetime(
                2026, 3, 14, 12, 0, tzinfo=datetime.timezone.utc
            ),
            "cached_at": 0.0,
            "rows": None,
        }

        with patch.dict(os.environ, {"PUBLIC_BLOBS": "locations.csv"}, clear=False):
            with patch.object(function_app, "_read_csv_cache_get", return_value=entry):
                response = function_app.read_csv(
                    build_request(
                        params={"blob": "locations.csv"},
                        headers={"If-None-Match": '"abc123"'},
                    )
                )

        self.assertEqual(response.status_code, 304)
        self.assertEqual(response.headers.get("ETag"), '"abc123"')

    def test_read_csv_short_circuits_download_when_conditional_header_matches(self):
        blob_client = Mock()
        blob_client.get_blob_properties.return_value = SimpleNamespace(
            etag="abc123",
            last_modified=datetime.datetime(
                2026, 3, 14, 12, 0, tzinfo=datetime.timezone.utc
            ),
        )

        with patch.dict(os.environ, {"PUBLIC_BLOBS": "locations.csv"}, clear=False):
            with patch.object(function_app, "_read_csv_cache_get", return_value=None):
                with patch.object(
                    function_app, "_read_csv_blob_client", return_value=blob_client
                ):
                    response = function_app.read_csv(
                        build_request(
                            params={"blob": "locations.csv"},
                            headers={"If-None-Match": '"abc123"'},
                        )
                    )

        self.assertEqual(response.status_code, 304)
        blob_client.download_blob.assert_not_called()

    def test_read_csv_returns_json_payload_and_cache_headers(self):
        entry = {
            "data": b"Site,Year\nLake Alpha,2024\n",
            "etag": "etag-123",
            "last_modified": datetime.datetime(
                2026, 3, 14, 12, 0, tzinfo=datetime.timezone.utc
            ),
            "cached_at": 0.0,
            "rows": None,
        }

        with patch.dict(os.environ, {"PUBLIC_BLOBS": "locations.csv"}, clear=False):
            with patch.object(function_app, "_read_csv_cache_get", return_value=entry):
                response = function_app.read_csv(
                    build_request(
                        params={"blob": "locations.csv", "format": "json"}
                    )
                )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers.get("ETag"), '"etag-123"')
        self.assertEqual(
            response.headers.get("Cache-Control"),
            function_app._read_csv_cache_control(),
        )
        self.assertEqual(
            response.headers.get("Last-Modified"),
            "Sat, 14 Mar 2026 12:00:00 GMT",
        )
        payload = json.loads(response.get_body().decode("utf-8"))
        self.assertEqual(payload, [{"Site": "Lake Alpha", "Year": "2024"}])

    def test_read_csv_returns_not_found_for_missing_blob(self):
        blob_client = Mock()
        blob_client.get_blob_properties.return_value = SimpleNamespace(
            etag="abc123",
            last_modified=datetime.datetime(
                2026, 3, 14, 12, 0, tzinfo=datetime.timezone.utc
            ),
        )

        with patch.dict(os.environ, {"PUBLIC_BLOBS": "locations.csv"}, clear=False):
            with patch.object(function_app, "_read_csv_cache_get", return_value=None):
                with patch.object(
                    function_app, "_read_csv_blob_client", return_value=blob_client
                ):
                    with patch.object(
                        function_app,
                        "_read_csv_load_blob",
                        side_effect=ResourceNotFoundError("missing"),
                    ):
                        response = function_app.read_csv(
                            build_request(params={"blob": "locations.csv"})
                        )

        self.assertEqual(response.status_code, 404)
        self.assertIn("Blob not found", response.get_body().decode("utf-8"))

    def test_read_csv_returns_internal_error_on_unexpected_failure(self):
        blob_client = Mock()
        blob_client.get_blob_properties.return_value = SimpleNamespace(
            etag="abc123",
            last_modified=datetime.datetime(
                2026, 3, 14, 12, 0, tzinfo=datetime.timezone.utc
            ),
        )

        with patch.dict(os.environ, {"PUBLIC_BLOBS": "locations.csv"}, clear=False):
            with patch.object(function_app, "_read_csv_cache_get", return_value=None):
                with patch.object(
                    function_app, "_read_csv_blob_client", return_value=blob_client
                ):
                    with patch.object(
                        function_app,
                        "_read_csv_load_blob",
                        side_effect=RuntimeError("boom"),
                    ):
                        response = function_app.read_csv(
                            build_request(params={"blob": "locations.csv"})
                        )

        self.assertEqual(response.status_code, 500)
        self.assertIn("Internal server error", response.get_body().decode("utf-8"))

    def test_log_event_returns_gone(self):
        response = function_app.log_event(
            build_request(
                method="POST",
                body={"clientUrl": "https://example.test/page"},
            )
        )

        self.assertEqual(response.status_code, 410)
        payload = json.loads(response.get_body().decode("utf-8"))
        self.assertEqual(payload["error"], "Endpoint removed")


if __name__ == "__main__":
    unittest.main()
