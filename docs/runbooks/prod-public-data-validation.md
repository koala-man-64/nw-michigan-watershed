# Production Public-Blob Validation Runbook

Use this runbook during the bridge release when the SPA can read CSV assets directly from Blob Storage.

## Prerequisites

- A deployed public blob container base URL, for example `https://<storage>.blob.core.windows.net/nwmiws`
- A known existing blob in the public container (`locations.csv` by default)
- Python 3.9+ available locally

## Safe validation command

```bash
python scripts/validate_public_blob.py --blob-base-url https://<storage>.blob.core.windows.net/nwmiws
```

Expected result:

```text
public blob validation passed
```

## What the script verifies

1. Existing blob returns `HTTP 200`.
2. Existing blob response includes `Content-Type: text/csv`.
3. Existing blob response includes an `ETag` header.
4. Conditional GET (`If-None-Match`) returns `HTTP 304`.
5. Missing blob returns `HTTP 404`.

## Failure signals

- `HTTP 403` or browser CORS failures: storage CORS origin drift.
- `HTTP 404` on known blob: missing data or wrong container/base URL.
- Missing `ETag`: regression in blob metadata/headers.
- `HTTP 5xx`: storage platform or network dependency issue.

## Recommended telemetry to inspect

- Browser failures tagged with `dataSource=blob`.
- Blob fetch and CORS failures in browser/Application Insights telemetry.
- `/api/read-csv` request volume to confirm expected traffic shift.

## Rollback trigger

Rollback blob-mode release if validation fails twice against the same deployment after rechecking storage CORS/container settings, or if user traffic shows persistent blob fetch or CORS failures.
