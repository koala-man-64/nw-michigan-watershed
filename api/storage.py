from __future__ import annotations

import datetime
import hashlib
import threading
import time
from dataclasses import dataclass
from typing import Optional

from azure.core.credentials import AzureSasCredential
from azure.core.exceptions import ResourceNotFoundError
from azure.storage.blob import BlobServiceClient

from config import env, env_int, required_env

try:
    from azure.identity import DefaultAzureCredential
except Exception:
    DefaultAzureCredential = None


@dataclass(frozen=True)
class CachedBlob:
    data: bytes
    etag: str
    last_modified: Optional[datetime.datetime]
    cache_hit: bool


_blob_cache_lock = threading.Lock()
_blob_cache: dict[tuple[str, str], tuple[float, CachedBlob]] = {}


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


def read_csv_memory_cache_ttl_sec() -> int:
    return max(0, env_int("READ_CSV_MEMORY_CACHE_TTL_SEC", 300))


def reset_storage_caches() -> None:
    with _blob_cache_lock:
        _blob_cache.clear()


def _download_blob_cached_uncached(container: str, blob_name: str) -> CachedBlob:
    blob_client = (
        blob_service_client()
        .get_container_client(container)
        .get_blob_client(blob_name)
    )
    properties = blob_client.get_blob_properties()
    data = blob_client.download_blob(max_concurrency=2).readall()
    etag = getattr(properties, "etag", None) or hashlib.sha256(data).hexdigest()
    return CachedBlob(
        data=data,
        etag=etag,
        last_modified=getattr(properties, "last_modified", None),
        cache_hit=False,
    )


def download_blob_cached(container: str, blob_name: str) -> CachedBlob:
    ttl_sec = read_csv_memory_cache_ttl_sec()
    cache_key = (container, blob_name)
    if ttl_sec > 0:
        with _blob_cache_lock:
            cached = _blob_cache.get(cache_key)
            if cached is not None:
                cached_at, payload = cached
                if time.time() - cached_at <= ttl_sec:
                    return CachedBlob(
                        data=payload.data,
                        etag=payload.etag,
                        last_modified=payload.last_modified,
                        cache_hit=True,
                    )
                _blob_cache.pop(cache_key, None)

    payload = _download_blob_cached_uncached(container, blob_name)
    if ttl_sec > 0:
        with _blob_cache_lock:
            _blob_cache[cache_key] = (time.time(), payload)
    return payload


def download_blob_text(container: str, blob_name: str) -> str:
    data = download_blob(container, blob_name)
    try:
        return data.decode("utf-8")
    except Exception:
        return data.decode("utf-8", errors="ignore")


def check_storage_connection() -> None:
    blob_service_client().get_service_properties()


def check_blob_access(container: str, blob_name: str) -> None:
    (
        blob_service_client()
        .get_container_client(container)
        .get_blob_client(blob_name)
        .get_blob_properties()
    )


def required_chat_blob_names() -> tuple[str, str]:
    container = required_env("CHAT_WITH_RUDY_CONTAINER")
    prompt_blob = required_env("CHAT_WITH_RUDY_PROMPT_BLOB")
    return container, prompt_blob


__all__ = [
    "CachedBlob",
    "ResourceNotFoundError",
    "allow_arbitrary_blob_reads",
    "blob_service_client",
    "check_blob_access",
    "check_storage_connection",
    "download_blob",
    "download_blob_cached",
    "download_blob_text",
    "public_blobs",
    "public_container",
    "read_csv_memory_cache_ttl_sec",
    "reset_storage_caches",
]
