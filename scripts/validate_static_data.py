#!/usr/bin/env python3
"""Safe validation checks for deployed static CSV assets."""

from __future__ import annotations

import argparse
import sys
import urllib.error
import urllib.parse
import urllib.request
from typing import Dict, Optional, Tuple


EXPECTED_FILES = (
    "NWMIWS_Site_Data_testing_varied.csv",
    "info.csv",
    "locations.csv",
)
EXPECTED_CACHE_CONTROL = "public, max-age=86400, stale-while-revalidate=604800"


def build_url(base_url: str, relative_path: str) -> str:
    quoted_parts = [urllib.parse.quote(part, safe="") for part in relative_path.split("/")]
    return f"{base_url.rstrip('/')}/{'/'.join(quoted_parts)}"


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


def validate_csv(base_url: str, relative_path: str, timeout: int) -> None:
    url = build_url(base_url, relative_path)
    status, headers, _ = request(url, timeout=timeout)
    require(status, 200, f"{relative_path} check failed")

    content_type = (headers.get("Content-Type") or headers.get("content-type") or "").lower()
    if "text/csv" not in content_type:
        raise SystemExit(
            f"{relative_path} check failed: expected text/csv content type, got '{content_type}'"
        )

    cache_control = headers.get("Cache-Control") or headers.get("cache-control") or ""
    if cache_control != EXPECTED_CACHE_CONTROL:
        raise SystemExit(
            f"{relative_path} check failed: expected Cache-Control '{EXPECTED_CACHE_CONTROL}', got '{cache_control}'"
        )


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Validate the deployed static CSV assets used by the client."
    )
    parser.add_argument(
        "--base-url",
        required=True,
        help="Application base URL, e.g. https://example.azurestaticapps.net",
    )
    parser.add_argument(
        "--timeout", type=int, default=20, help="Request timeout in seconds"
    )
    args = parser.parse_args()

    for name in EXPECTED_FILES:
        validate_csv(args.base_url, f"data/{name}", args.timeout)

    status, _, _ = request(
        build_url(args.base_url, "data/missing-validation-file.csv"),
        timeout=args.timeout,
    )
    require(status, 404, "Missing file check failed")

    print("static data validation passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
