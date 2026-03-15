#!/usr/bin/env python3
"""Safe validation checks for the deployed read-csv endpoint."""

from __future__ import annotations

import argparse
import sys
import urllib.error
import urllib.parse
import urllib.request
from typing import Dict, Optional, Tuple


def build_url(base_url: str, blob_name: str, output_format: str = "json") -> str:
    query = urllib.parse.urlencode({"blob": blob_name, "format": output_format})
    return f"{base_url.rstrip('/')}/api/read-csv?{query}"


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
    parser = argparse.ArgumentParser(description="Validate the deployed /api/read-csv endpoint.")
    parser.add_argument("--base-url", required=True, help="Application base URL, e.g. https://example.azurestaticapps.net")
    parser.add_argument("--existing-blob", default="locations.csv", help="Known allowlisted blob that should exist")
    parser.add_argument("--forbidden-blob", default="forbidden.csv", help="Blob name that should be rejected by the allowlist")
    parser.add_argument("--timeout", type=int, default=20, help="Request timeout in seconds")
    args = parser.parse_args()

    success_url = build_url(args.base_url, args.existing_blob)
    status, headers, _ = request(success_url, timeout=args.timeout)
    require(status, 200, "Existing blob check failed")

    etag = headers.get("ETag") or headers.get("Etag") or headers.get("etag")
    if not etag:
        raise SystemExit("Existing blob check failed: missing ETag header")

    status, _, _ = request(success_url, headers={"If-None-Match": etag}, timeout=args.timeout)
    require(status, 304, "Conditional request check failed")

    forbidden_url = build_url(args.base_url, args.forbidden_blob)
    status, _, body = request(forbidden_url, timeout=args.timeout)
    require(status, 403, "Forbidden blob check failed")

    if b"Blob not allowed" not in body:
        raise SystemExit("Forbidden blob check failed: expected allowlist error message")

    print("read-csv validation passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
