from __future__ import annotations

from typing import Optional

from azure.core.credentials import AzureSasCredential
from azure.core.exceptions import ResourceNotFoundError
from azure.storage.blob import BlobServiceClient

from config import env, required_env

try:
    from azure.identity import DefaultAzureCredential
except Exception:
    DefaultAzureCredential = None


def normalize_sas(token: Optional[str]) -> Optional[AzureSasCredential]:
    if not token:
        return None
    cleaned = token.strip()
    if cleaned.startswith("?"):
        cleaned = cleaned[1:]
    return AzureSasCredential(cleaned)


def ensure_trailing_slash(url: str) -> str:
    if not url:
        return url
    return url if url.endswith("/") else f"{url}/"


def blob_service_client() -> BlobServiceClient:
    connection_string = env("BLOB_CONN")
    if connection_string:
        return BlobServiceClient.from_connection_string(connection_string)

    account_name = env("STORAGE_ACCOUNT_NAME")
    sas = normalize_sas(env("SAS_TOKEN"))
    if account_name and sas:
        account_url = ensure_trailing_slash(f"https://{account_name}.blob.core.windows.net")
        return BlobServiceClient(account_url=account_url, credential=sas)

    account_url = env("STORAGE_ACCOUNT_URL")
    if account_url:
        if DefaultAzureCredential is None:
            raise RuntimeError(
                "STORAGE_ACCOUNT_URL set but azure-identity is missing; add 'azure-identity' or use BLOB_CONN."
            )
        return BlobServiceClient(
            account_url=ensure_trailing_slash(account_url),
            credential=DefaultAzureCredential(),
        )

    raise RuntimeError(
        "Missing storage auth: set BLOB_CONN or (STORAGE_ACCOUNT_NAME+SAS_TOKEN) or STORAGE_ACCOUNT_URL"
    )


def public_container() -> str:
    return env("PUBLIC_BLOB_CONTAINER") or env("BLOB_CONTAINER") or "nwmiws"


def public_blobs() -> set[str]:
    raw = (env("PUBLIC_BLOBS") or "").strip()
    if not raw:
        return {
            "NWMIWS Site Data.csv",
            "NWMIWS_Site_Data_testing.csv",
            "NWMIWS_Site_Data_testing_varied.csv",
            "info.csv",
            "locations.csv",
        }
    return {blob.strip() for blob in raw.split(",") if blob.strip()}


def allow_arbitrary_blob_reads() -> bool:
    return (env("ALLOW_ARBITRARY_BLOB_READS", "0") or "0").strip() == "1"


def download_blob(container: str, blob_name: str) -> bytes:
    return (
        blob_service_client()
        .get_container_client(container)
        .get_blob_client(blob_name)
        .download_blob(max_concurrency=2)
        .readall()
    )


def download_blob_text(container: str, blob_name: str) -> str:
    data = download_blob(container, blob_name)
    try:
        return data.decode("utf-8")
    except Exception:
        return data.decode("utf-8", errors="ignore")


def required_chat_blob_names() -> tuple[str, str]:
    container = required_env("CHAT_WITH_RUDY_CONTAINER")
    prompt_blob = required_env("CHAT_WITH_RUDY_PROMPT_BLOB")
    return container, prompt_blob


__all__ = [
    "ResourceNotFoundError",
    "allow_arbitrary_blob_reads",
    "blob_service_client",
    "download_blob",
    "download_blob_text",
    "public_blobs",
    "public_container",
]
