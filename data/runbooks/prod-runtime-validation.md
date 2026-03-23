# Production Runtime Validation Runbook

Use this runbook after a `dev` or `prod` deployment to verify the current API-backed runtime is healthy.

## Goal

Confirm that the deployed Static Web App, managed API, file-backed runtime state, published release artifacts, and Azure Maps token broker are aligned.

## Prerequisites

- A deployed base URL such as `https://<app>.azurestaticapps.net`
- PowerShell 7+ or Windows PowerShell
- An allowed origin for Azure Maps validation

Set the deployment URL once:

```powershell
$baseUrl = "https://<app>.azurestaticapps.net"
```

## Step 1: Health check

```powershell
$health = Invoke-RestMethod "$baseUrl/api/health"
$health | Format-List
```

Expected result:

- `status` is `ok`
- `service` is `platform-api`
- `customerId` is populated
- `activeReleaseId` is populated
- `publishedReleases` is `1` or greater

If you receive `503` with `state_unavailable`, the deployed `platform-state.json` is empty or malformed.

## Step 2: Bootstrap payload

```powershell
$bootstrap = Invoke-RestMethod "$baseUrl/api/portal/bootstrap"
$bootstrap | Format-List
```

Expected result:

- `customerManifest`, `customerProfile`, `datasetManifest`, `publishedRelease`, and `mapProvider` are present
- `publishedRelease.releaseId` is populated
- `mapProvider.tokenRoute` is `/api/maps/token`

The public portal shell will fall back to built-in title/contact defaults if bootstrap fails, but the deployment should still expose this endpoint in a healthy release.

## Step 3: Published data reads

```powershell
$sites = Invoke-RestMethod "$baseUrl/api/sites"
$parameters = Invoke-RestMethod "$baseUrl/api/parameters"
$measurements = Invoke-RestMethod "$baseUrl/api/measurements?parameter=Chloro&year=2000"

@{
  siteCount = $sites.count
  parameterCount = $parameters.count
  measurementCount = $measurements.count
  appliedFilters = $measurements.appliedFilters
} | Format-List
```

Expected result:

- each endpoint returns `200`
- each response contains `items` and `count`
- `siteCount` and `parameterCount` are greater than `0`
- `measurementCount` matches the filtered dataset for the selected query

## Step 4: Release artifact exports

```powershell
$releaseId = $bootstrap.publishedRelease.releaseId
Invoke-RestMethod "$baseUrl/api/exports/$releaseId/manifest.json" | Format-List
Invoke-WebRequest "$baseUrl/api/exports/$releaseId/measurements.csv" | Select-Object StatusCode, Headers
```

Expected result:

- `manifest.json` returns `200` with release, manifest, and customer metadata
- `measurements.csv` returns `200`
- the CSV response includes a `Content-Disposition` attachment header

## Step 5: Azure Maps token broker

Use the deployed origin as the request origin:

```powershell
$uri = [Uri]$baseUrl
$origin = if ($uri.IsDefaultPort) { "$($uri.Scheme)://$($uri.Host)" } else { "$($uri.Scheme)://$($uri.Host):$($uri.Port)" }
$mapsToken = Invoke-RestMethod "$baseUrl/api/maps/token" -Headers @{ Origin = $origin }
$mapsToken | Format-List
```

Expected result:

- response returns `200`
- `token`, `clientId`, and `expiresOnUtc` are populated

Common failure meanings:

- `403`: the origin is not in `AZURE_MAPS_ALLOWED_ORIGINS`
- `503`: required Azure Maps settings are missing or invalid
- `500`: token issuance failed after configuration passed validation

## Failure Signals

- `GET /api/health` returns `503`: deployed runtime state is unavailable
- `GET /api/portal/bootstrap` fails: portal runtime bootstrap is broken
- `GET /api/sites`, `/api/parameters`, or `/api/measurements` returns empty data unexpectedly: source CSVs or API parsing path regressed
- export route returns `404`: active release metadata and exported artifact path are out of sync
- Azure Maps token route returns `403`, `503`, or `500`: origin allowlist or Azure Maps broker configuration regressed

## Recommended Telemetry

- Application Insights request failures for `/api/health`, `/api/portal/bootstrap`, `/api/sites`, `/api/parameters`, `/api/measurements`, and `/api/maps/token`
- Azure Functions logs mentioning `state_unavailable`
- Azure Functions logs mentioning `Azure Maps token broker is misconfigured`
- Browser failures loading the portal bootstrap or map tiles after deployment

## Rollback Trigger

Rollback if any of the following remains broken after one confirmatory retry:

- health endpoint returns `503`
- bootstrap cannot load
- published data reads fail or return clearly incomplete data
- active release exports fail
- Azure Maps token broker rejects the deployed origin for a healthy environment

## Evidence

- `apps/platform-api/src/index.ts`
- `apps/platform-api/src/runtime/handlers.ts`
- `apps/platform-api/src/runtime/stateStore.ts`
- `apps/platform-api/src/runtime/csvStore.ts`
- `apps/platform-api/tests/platformRoutes.test.ts`
