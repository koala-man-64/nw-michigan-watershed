# Production `read-csv` Validation Runbook

Use this runbook after a dev or prod deployment to verify the blob-backed API is healthy without writing data.

## Prerequisites

- A deployed application base URL such as `https://<app>.azurestaticapps.net`
- A known allowlisted blob that exists in storage. The default runbook uses `locations.csv`.
- Python 3.9+ available locally

## Safe validation command

```bash
python scripts/validate_read_csv.py --base-url https://<app>.azurestaticapps.net
```

Expected result:

```text
read-csv validation passed
```

## What the script verifies

1. `GET /api/read-csv?blob=locations.csv&format=json` returns `200`.
2. The successful response includes an `ETag` header.
3. A conditional GET with `If-None-Match` returns `304`.
4. A request for a non-allowlisted blob returns `403` with `Blob not allowed`.

## Failure signals

- `HTTP 5xx`: application or storage dependency failure
- Missing `ETag`: cache and conditional request regression
- `200` on the forbidden blob check: allowlist regression
- `404` on `locations.csv`: storage content/config drift

## Recommended telemetry to inspect

- Application Insights traces for `read_csv: loading`, `read_csv: ok`, and `read_csv: failed`
- `read_csv_cache: hit` and `read_csv_cache: miss` log ratios
- Azure Static Web Apps request failures for `/api/read-csv`

## Rollback trigger

Rollback the release if the script fails twice against the same deployment after config has been rechecked, or if `read-csv` begins returning `5xx` for the allowlisted blob.
