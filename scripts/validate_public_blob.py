#!/usr/bin/env python3
"""Validation checks for direct public blob reads used by the SPA."""

from __future__ import annotations

import argparse
import sys
import urllib.error
import urllib.parse
import urllib.request
from typing import Dict, Optional, Tuple


def build_blob_url(base_url: str, blob_name: str) -> str:
    encoded_blob = urllib.parse.quote(blob_name, safe="")
    return f"{base_url.rstrip('/')}/{encoded_blob}"


def request(
    url: str,
    *,
    headers: Optional[Dict[str, str]] = None,
    timeout: int = 20,
) -> Tuple[int, Dict[str, str], bytes]:
    req = urllib.request.Request(url, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            return response.status, dict(response.headers.items()), response.read()
    except urllib.error.HTTPError as exc:
        return exc.code, dict(exc.headers.items()), exc.read()


def require(status: int, expected: int, message: str) -> None:
    if status != expected:
        raise SystemExit(f"{message}: expected HTTP {expected}, got HTTP {status}")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Validate direct public blob reads used by the client."
    )
    parser.add_argument(
        "--blob-base-url",
        required=True,
        help="Container base URL, e.g. https://example.blob.core.windows.net/nwmiws",
    )
    parser.add_argument(
        "--existing-blob",
        default="locations.csv",
        help="Known existing blob in the public container",
    )
    parser.add_argument(
        "--missing-blob",
        default="missing-validation-blob.csv",
        help="Blob name expected to return HTTP 404",
    )
    parser.add_argument("--timeout", type=int, default=20, help="Request timeout in seconds")
    args = parser.parse_args()

    existing_url = build_blob_url(args.blob_base_url, args.existing_blob)
    status, headers, _ = request(existing_url, timeout=args.timeout)
    require(status, 200, "Existing blob check failed")

    content_type = (headers.get("Content-Type") or headers.get("content-type") or "").lower()
    if "text/csv" not in content_type:
        raise SystemExit(
            f"Existing blob check failed: expected text/csv content type, got '{content_type}'"
        )

    etag = headers.get("ETag") or headers.get("Etag") or headers.get("etag")
    if not etag:
        raise SystemExit("Existing blob check failed: missing ETag header")

    status, _, _ = request(existing_url, headers={"If-None-Match": etag}, timeout=args.timeout)
    require(status, 304, "Conditional request check failed")

    missing_url = build_blob_url(args.blob_base_url, args.missing_blob)
    status, _, _ = request(missing_url, timeout=args.timeout)
    require(status, 404, "Missing blob check failed")

    print("public blob validation passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
