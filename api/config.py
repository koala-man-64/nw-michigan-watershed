from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Optional


def load_local_env_file(base_dir: Optional[str] = None) -> None:
    env_path = Path(base_dir or Path(__file__).resolve().parent) / ".env"
    try:
        raw = env_path.read_text(encoding="utf-8")
    except Exception:
        return

    pattern = re.compile(r"^\s*([A-Za-z_][A-Za-z0-9_]*)\s*(=|:)\s*(.*?)\s*$")

    for line in raw.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue

        match = pattern.match(stripped)
        if not match:
            continue

        key, _, value = match.groups()
        if not key or key in os.environ:
            continue

        if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
            value = value[1:-1]

        os.environ[key] = value


def env(name: str, default: Optional[str] = None) -> Optional[str]:
    value = os.getenv(name)
    if value is None:
        return default

    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
        value = value[1:-1].strip()

    return value if value else default


def env_int(name: str, default: int) -> int:
    raw = env(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except Exception:
        return default


def required_env(name: str) -> str:
    value = env(name)
    if not value:
        raise RuntimeError(f"Missing required env var: {name}")
    return value
