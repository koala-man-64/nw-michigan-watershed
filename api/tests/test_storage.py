from __future__ import annotations

import datetime
import types

import storage


def test_normalize_sas_and_trailing_slash_helpers() -> None:
    credential = storage.normalize_sas("?sig=abc")

    assert credential.signature == "sig=abc"
    assert storage.ensure_trailing_slash("https://example.com") == "https://example.com/"


def test_public_blob_defaults_and_flags(monkeypatch) -> None:
    assert "locations.csv" in storage.public_blobs()
    assert storage.allow_arbitrary_blob_reads() is False

    monkeypatch.setenv("PUBLIC_BLOBS", "one.csv, two.csv")
    monkeypatch.setenv("ALLOW_ARBITRARY_BLOB_READS", "1")

    assert storage.public_blobs() == {"one.csv", "two.csv"}
    assert storage.allow_arbitrary_blob_reads() is True


def test_blob_service_client_prefers_connection_string(monkeypatch) -> None:
    monkeypatch.setenv("BLOB_CONN", "UseDevelopmentStorage=true")
    monkeypatch.setattr(
        storage.BlobServiceClient,
        "from_connection_string",
        staticmethod(lambda conn_str: ("conn", conn_str)),
    )

    assert storage.blob_service_client() == ("conn", "UseDevelopmentStorage=true")


def test_blob_service_client_supports_account_name_and_sas(monkeypatch) -> None:
    monkeypatch.setenv("STORAGE_ACCOUNT_NAME", "nwmiws")
    monkeypatch.setenv("SAS_TOKEN", "?sig=abc")

    fake_client = types.SimpleNamespace()
    monkeypatch.setattr(
        storage,
        "BlobServiceClient",
        lambda account_url, credential: (account_url, credential.signature, fake_client),
    )

    account_url, signature, sentinel = storage.blob_service_client()
    assert account_url == "https://nwmiws.blob.core.windows.net/"
    assert signature == "sig=abc"
    assert sentinel is fake_client


def test_blob_service_client_supports_managed_identity(monkeypatch) -> None:
    monkeypatch.setenv("STORAGE_ACCOUNT_URL", "https://nwmiws.blob.core.windows.net")
    monkeypatch.setattr(storage, "DefaultAzureCredential", lambda: "cred")
    monkeypatch.setattr(storage, "BlobServiceClient", lambda account_url, credential: (account_url, credential))

    assert storage.blob_service_client() == ("https://nwmiws.blob.core.windows.net/", "cred")


def test_download_blob_cached_reuses_memory_cache(monkeypatch) -> None:
    download_calls = {"properties": 0, "download": 0}

    class FakeDownloader:
        def readall(self):
            download_calls["download"] += 1
            return b"Site,Year\nLake A,2024\n"

    class FakeBlobClient:
        def get_blob_properties(self):
            download_calls["properties"] += 1
            return types.SimpleNamespace(
                etag="abc123",
                last_modified=datetime.datetime(2026, 3, 11, 12, 0, tzinfo=datetime.timezone.utc),
            )

        def download_blob(self, max_concurrency=2):
            return FakeDownloader()

    class FakeContainerClient:
        def get_blob_client(self, blob_name):
            assert blob_name == "allowed.csv"
            return FakeBlobClient()

    class FakeServiceClient:
        def get_container_client(self, container):
            assert container == "nwmiws"
            return FakeContainerClient()

    monkeypatch.setenv("READ_CSV_MEMORY_CACHE_TTL_SEC", "300")
    monkeypatch.setattr(storage, "blob_service_client", lambda: FakeServiceClient())

    first = storage.download_blob_cached("nwmiws", "allowed.csv")
    second = storage.download_blob_cached("nwmiws", "allowed.csv")

    assert first.data == b"Site,Year\nLake A,2024\n"
    assert first.cache_hit is False
    assert second.cache_hit is True
    assert second.etag == "abc123"
    assert download_calls == {"properties": 1, "download": 1}
