#!/usr/bin/env python3
"""List stale GitHub Actions workflows and optionally disable them."""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

API_BASE = "https://api.github.com"
API_VERSION = "2022-11-28"
USER_AGENT = "nwmiws-workflow-cleanup"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Compare registered GitHub Actions workflows against the workflow files "
            "currently present on the default branch."
        )
    )
    parser.add_argument(
        "--repo",
        help="GitHub repository in owner/name form. Defaults to the origin remote.",
    )
    parser.add_argument(
        "--disable-stale",
        action="store_true",
        help="Disable active stale workflow records using the GitHub REST API.",
    )
    parser.add_argument(
        "--token-env",
        default="GITHUB_TOKEN",
        help="Environment variable that contains a GitHub token for write operations.",
    )
    return parser.parse_args()


def derive_repo_from_origin() -> str:
    result = subprocess.run(
        ["git", "remote", "get-url", "origin"],
        check=True,
        capture_output=True,
        text=True,
    )
    remote = result.stdout.strip()
    match = re.search(r"github\.com[:/](?P<repo>[^/]+/[^/.]+?)(?:\.git)?$", remote)
    if not match:
        raise SystemExit(
            "Unable to derive owner/name from the origin remote. Pass --repo explicitly."
        )
    return match.group("repo")


def github_request(
    method: str,
    url: str,
    *,
    token: str | None = None,
) -> Any:
    request = urllib.request.Request(
        url,
        method=method,
        headers={
            "Accept": "application/vnd.github+json",
            "User-Agent": USER_AGENT,
            "X-GitHub-Api-Version": API_VERSION,
        },
    )
    if token:
        request.add_header("Authorization", f"Bearer {token}")

    try:
        with urllib.request.urlopen(request) as response:
            if response.status == 204:
                return None
            return json.load(response)
    except urllib.error.HTTPError as exc:
        message = exc.read().decode("utf-8", errors="replace")
        raise SystemExit(f"{method} {url} failed: HTTP {exc.code} {message}") from exc


def get_default_branch(repo: str) -> str:
    data = github_request("GET", f"{API_BASE}/repos/{repo}")
    default_branch = data.get("default_branch")
    if not default_branch:
        raise SystemExit(f"Repository {repo} does not report a default branch.")
    return default_branch


def get_current_workflow_paths(repo: str, ref: str) -> set[str]:
    data = github_request(
        "GET",
        f"{API_BASE}/repos/{repo}/contents/.github/workflows?ref={urllib.parse.quote(ref)}",
    )
    return {item["path"] for item in data if item.get("type") == "file"}


def get_registered_workflows(repo: str) -> list[dict[str, Any]]:
    data = github_request("GET", f"{API_BASE}/repos/{repo}/actions/workflows")
    workflows = data.get("workflows", [])
    if not isinstance(workflows, list):
        raise SystemExit("GitHub returned an unexpected workflow payload.")
    return workflows


def format_row(cells: list[str], widths: list[int]) -> str:
    return "  ".join(cell.ljust(width) for cell, width in zip(cells, widths))


def print_table(rows: list[list[str]]) -> None:
    widths = [max(len(row[idx]) for row in rows) for idx in range(len(rows[0]))]
    for index, row in enumerate(rows):
        print(format_row(row, widths))
        if index == 0:
            print(format_row(["-" * width for width in widths], widths))


def main() -> int:
    args = parse_args()
    repo = args.repo or derive_repo_from_origin()
    default_branch = get_default_branch(repo)
    current_paths = get_current_workflow_paths(repo, default_branch)
    workflows = get_registered_workflows(repo)

    stale_workflows = [wf for wf in workflows if wf["path"] not in current_paths]
    current_workflows = [wf for wf in workflows if wf["path"] in current_paths]

    print(f"Repository: {repo}")
    print(f"Default branch: {default_branch}")
    print(f"Workflow files on {default_branch}: {len(current_paths)}")
    print(f"Registered workflow records: {len(workflows)}")
    print(f"Current workflow records: {len(current_workflows)}")
    print(f"Stale workflow records: {len(stale_workflows)}")
    print()

    rows = [["State", "Class", "Id", "Name", "Path"]]
    for workflow in workflows:
        rows.append(
            [
                workflow["state"],
                "CURRENT" if workflow["path"] in current_paths else "STALE",
                str(workflow["id"]),
                workflow["name"],
                workflow["path"],
            ]
        )
    print_table(rows)

    if not args.disable_stale:
        return 0

    token = os.getenv(args.token_env) or os.getenv("GH_TOKEN")
    if not token:
        raise SystemExit(
            f"--disable-stale requires a token in {args.token_env} or GH_TOKEN."
        )

    active_stale = [wf for wf in stale_workflows if wf["state"] == "active"]
    if not active_stale:
        print()
        print("No active stale workflows to disable.")
        return 0

    print()
    print(f"Disabling {len(active_stale)} active stale workflows...")
    for workflow in active_stale:
        github_request(
            "PUT",
            f"{API_BASE}/repos/{repo}/actions/workflows/{workflow['id']}/disable",
            token=token,
        )
        print(f"Disabled workflow {workflow['id']} {workflow['path']}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
