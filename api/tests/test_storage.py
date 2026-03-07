from __future__ import annotations

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
