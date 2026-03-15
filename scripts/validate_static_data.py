#!/usr/bin/env python3
"""Safe validation checks for deployed static CSV assets."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from typing import Dict, Iterable, Optional, Tuple


EXPECTED_FILES = (
    "NWMIWS_Site_Data_testing_varied.csv",
    "info.csv",
    "locations.csv",
)
EXPECTED_CACHE_CONTROL = "public, max-age=86400, stale-while-revalidate=604800"
VALIDATION_BASE_URLS_SETTING = "STATIC_CUTOVER_VALIDATION_BASE_URLS"


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


def split_config_values(values: Iterable[str]) -> Tuple[str, ...]:
    resolved = []
    seen = set()

    for value in values:
        if value is None:
            continue

        trimmed = value.strip()
        if not trimmed:
            continue

        parsed_values = [trimmed]
        if trimmed.startswith("[") and trimmed.endswith("]"):
            try:
                decoded = json.loads(trimmed)
            except json.JSONDecodeError:
                decoded = None
            else:
                if isinstance(decoded, list):
                    parsed_values = [str(item) for item in decoded]

        for parsed_value in parsed_values:
            for item in re.split(r"[\r\n,]+", parsed_value):
                candidate = item.strip()
                if candidate and candidate not in seen:
                    seen.add(candidate)
                    resolved.append(candidate)

    return tuple(resolved)


def resolve_env_file(env_file: Optional[str]) -> Optional[Path]:
    repo_root = Path(__file__).resolve().parents[1]
    candidates = (
        [Path(env_file).expanduser()]
        if env_file
        else [
            repo_root / ".env",
            repo_root / ".env.local",
            repo_root / "api" / ".env",
        ]
    )

    for candidate in candidates:
        if candidate.exists():
            return candidate.resolve()

    if env_file:
        raise SystemExit(f"Env file '{env_file}' was not found")

    return None


def read_environment_file(path: Path) -> Dict[str, str]:
    values: Dict[str, str] = {}

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue

        if line.startswith("export "):
            line = line[7:].strip()

        match = re.match(r"^(?P<key>[A-Za-z_][A-Za-z0-9_]*)\s*(?:=|:)\s*(?P<value>.*)$", line)
        if not match:
            continue

        key = match.group("key").strip()
        value = match.group("value").strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
            value = value[1:-1]

        values[key] = value

    return values


def resolve_base_urls(
    explicit_base_urls: Optional[list[str]],
    env_file: Optional[str],
) -> Tuple[str, ...]:
    if explicit_base_urls:
        base_urls = split_config_values(explicit_base_urls)
        if base_urls:
            return base_urls
        raise SystemExit("At least one non-empty --base-url value is required")

    configured_base_urls: Tuple[str, ...] = ()

    resolved_env_file = resolve_env_file(env_file)
    if resolved_env_file is not None:
        config = read_environment_file(resolved_env_file)
        configured_base_urls = split_config_values(
            [config.get(VALIDATION_BASE_URLS_SETTING, "")]
        )

    if not configured_base_urls:
        configured_base_urls = split_config_values(
            [os.environ.get(VALIDATION_BASE_URLS_SETTING, "")]
        )

    if configured_base_urls:
        return configured_base_urls

    raise SystemExit(
        "No validation base URLs were provided. Pass --base-url or set "
        f"{VALIDATION_BASE_URLS_SETTING} in .env, .env.local, api/.env, or the process environment."
    )


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


def validate_site(base_url: str, timeout: int) -> None:
    for name in EXPECTED_FILES:
        validate_csv(base_url, f"data/{name}", timeout)

    status, _, _ = request(
        build_url(base_url, "data/missing-validation-file.csv"),
        timeout=timeout,
    )
    require(status, 404, "Missing file check failed")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Validate the deployed static CSV assets used by the client."
    )
    parser.add_argument(
        "--base-url",
        action="append",
        help=(
            "Application base URL, e.g. https://example.azurestaticapps.net. "
            "May be provided multiple times or as a comma-delimited list. "
            f"If omitted, the script loads {VALIDATION_BASE_URLS_SETTING} from "
            ".env, .env.local, or api/.env."
        ),
    )
    parser.add_argument(
        "--env-file",
        help=(
            "Optional env file path to load when --base-url is omitted. "
            f"Expected setting: {VALIDATION_BASE_URLS_SETTING}."
        ),
    )
    parser.add_argument(
        "--timeout", type=int, default=20, help="Request timeout in seconds"
    )
    args = parser.parse_args()

    base_urls = resolve_base_urls(args.base_url, args.env_file)
    failures = []

    for base_url in base_urls:
        print(f"validating static data at {base_url}")
        try:
            validate_site(base_url, args.timeout)
        except SystemExit as exc:
            failures.append(f"{base_url}: {exc}")

    if failures:
        for failure in failures:
            print(failure, file=sys.stderr)
        raise SystemExit(f"static data validation failed for {len(failures)} site(s)")

    print(f"static data validation passed for {len(base_urls)} site(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
