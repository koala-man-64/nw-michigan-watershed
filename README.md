# NW Michigan Water Quality Database

React SPA and Azure Functions application for browsing, charting, and downloading northern Michigan water quality data stored in Azure Blob Storage.

## Repository layout

- `client/` React application, telemetry bootstrap, and static hosting container config
- `api/` Azure Functions API that serves allowlisted CSV blobs as CSV or JSON
- `data/` source data and calculation notes
- `docs/runbooks/` operational validation runbooks
- `scripts/` local and deployment verification helpers

## Runtime configuration

Configure these Azure Static Web Apps application settings for the Functions app:

- `STORAGE_ACCOUNT_URL` plus Managed Identity, or `BLOB_CONN`
- `PUBLIC_BLOB_CONTAINER` and `PUBLIC_BLOBS`
- `READ_CSV_MEMORY_CACHE_TTL_SEC` (recommended `900`)
- `READ_CSV_BROWSER_CACHE_MAX_AGE_SEC`
- `READ_CSV_BROWSER_CACHE_SWR_SEC`
- `APPLICATIONINSIGHTS_CONNECTION_STRING`

The React build reads these build-time variables:

- `REACT_APP_APPLICATIONINSIGHTS_CONNECTION_STRING`
- `REACT_APP_PUBLIC_DATA_BASE_URL`
- `REACT_APP_PUBLIC_DATA_REVALIDATE_AFTER_MS` (optional, defaults to `3600000`)

The included GitHub Actions workflows map these from repository secrets:

- `REACT_APP_APPLICATIONINSIGHTS_CONNECTION_STRING_DEV`
- `REACT_APP_APPLICATIONINSIGHTS_CONNECTION_STRING_PROD`
- `REACT_APP_PUBLIC_DATA_BASE_URL_DEV`
- `REACT_APP_PUBLIC_DATA_BASE_URL_PROD`

## Local development

This repo currently targets the stable Azure Functions `python-3.9` runtime in `api/runtime.txt`.

### API

```powershell
cd api
py -3.9 -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item local.settings.example.json local.settings.json
start-local.cmd
```

`start-local.cmd` now pins the Functions host to port `9091` and enables `PYTHON_ISOLATE_WORKER_DEPENDENCIES=1`, which matches the React dev proxy and keeps the worker on the repo-local environment.

Update `api\local.settings.json` with either:

- `BLOB_CONN`, or
- `STORAGE_ACCOUNT_URL` plus managed identity access in Azure, or
- `AzureWebJobsStorage=UseDevelopmentStorage=true` when running Azurite locally

### Client

```powershell
cd client
npm ci
npm start
```

VS Code users can run the `start full application` task from `.vscode/tasks.json`.

## Quality gates

Run these locally before pushing changes:

```powershell
cd client
npm run lint
npm test -- --watchAll=false

cd ..\api
.venv\Scripts\python.exe -m pip install -r requirements.txt
.venv\Scripts\python.exe -m unittest discover -s tests -v
```

## CI/CD

Two GitHub Actions workflows deploy the app:

- `.github/workflows/build-deploy-nwmiws-swa-dev.yml`
- `.github/workflows/build-deploy-nwmiws-swa-prod.yml`

Each workflow now runs:

- client dependency install
- client lint
- client unit tests
- API dependency install
- API unit tests
- client production build
- Azure Static Web Apps deploy

## Infrastructure provisioning

Blob CORS/public-access settings and cache-control rollout are scriptable from this repo:

```powershell
# Deploy storage CORS + container public access via Bicep params
.\scripts\apply_storage_data_path.ps1 -ResourceGroupName <rg> -Environment dev
.\scripts\apply_storage_data_path.ps1 -ResourceGroupName <rg> -Environment prod

# Apply blob content/cache headers to active CSV files
.\scripts\set_blob_cache_headers.ps1 -StorageAccountName <storage-account>

# Apply SWA Functions runtime app settings
.\scripts\set_swa_function_settings.ps1 -ResourceGroupName <rg> -StaticWebAppName <swa-name>
```

Parameter file templates are in:

- `infra/dev.bicepparam`
- `infra/prod.bicepparam`

## Production validation

Use both runbooks during the bridge release:

- `docs/runbooks/prod-read-csv-validation.md`
- `docs/runbooks/prod-public-data-validation.md`

Or run helpers directly:

```bash
python scripts/validate_read_csv.py --base-url https://<app>.azurestaticapps.net
python scripts/validate_public_blob.py --blob-base-url https://<storage-account>.blob.core.windows.net/nwmiws
```
