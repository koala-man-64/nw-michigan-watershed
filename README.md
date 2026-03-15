# NW Michigan Water Quality Database

React single-page application for browsing, charting, and downloading northern Michigan water quality data. The deployed app ships its CSV datasets as static assets under `client/public/data/`, runs on Azure Static Web Apps, and now uses an Azure Maps-backed basemap via a managed Static Web Apps API broker.

## Repository layout

- `client/` React application, static datasets, telemetry bootstrap, and Static Web Apps config
- `api/` managed Static Web Apps API that issues short-lived Azure Maps SAS tokens
- `data/` non-runtime source reference material
- `docs/runbooks/` release validation instructions
- `infra/azuremaps/` Bicep templates for Azure Maps, identity, and RBAC
- `scripts/infra/` PowerShell provisioning, validation, local-settings export, and teardown helpers

## Runtime configuration

The React build reads these variables:

- `REACT_APP_APPLICATIONINSIGHTS_CONNECTION_STRING`
- `REACT_APP_PUBLIC_DATA_REVALIDATE_AFTER_MS` optional, defaults to `86400000`

The managed API reads these settings from Static Web Apps application settings:

- `AZURE_TENANT_ID`
- `AZURE_CLIENT_ID`
- `AZURE_CLIENT_SECRET`
- `AZURE_MAPS_SUBSCRIPTION_ID`
- `AZURE_MAPS_RESOURCE_GROUP`
- `AZURE_MAPS_ACCOUNT_NAME`
- `AZURE_MAPS_ACCOUNT_CLIENT_ID`
- `AZURE_MAPS_UAMI_PRINCIPAL_ID`
- `AZURE_MAPS_ALLOWED_ORIGINS`
- `AZURE_MAPS_SAS_TTL_MINUTES`
- `AZURE_MAPS_SAS_MAX_RPS`
- `AZURE_MAPS_SAS_SIGNING_KEY`

The included GitHub Actions workflows map the Application Insights value from repository secrets:

- `REACT_APP_APPLICATIONINSIGHTS_CONNECTION_STRING_DEV`
- `REACT_APP_APPLICATIONINSIGHTS_CONNECTION_STRING_PROD`

## Static data

The deployed application reads these tracked files directly:

- `client/public/data/NWMIWS_Site_Data_testing_varied.csv`
- `client/public/data/info.csv`
- `client/public/data/locations.csv`

To refresh data, replace those files and redeploy the client. The workbook in `data/` is reference material only and is not used at runtime.

## Local development

Install both workspaces first:

```powershell
cd client
npm ci
cd ..\api
npm ci
```

For client-only work:

```powershell
cd client
npm start
```

For full local validation with the managed API, export local settings and run through the Static Web Apps CLI:

```powershell
.\scripts\infra\Export-AzureMapsLocalSettings.ps1 -Environment dev
cd client
npm run build
cd ..
npx swa start client/build --api-location api
```

The exported `api/local.settings.json` is untracked and contains the current Azure Maps broker settings from the target Static Web App.

## Azure Maps provisioning

Fill in `scripts/infra/environments/dev.psd1` and `scripts/infra/environments/prod.psd1` with real subscription, resource, Static Web App, and Application Insights names first.

Provision or update the Azure Maps stack with:

```powershell
.\scripts\infra\Deploy-AzureMapsStack.ps1 -Environment dev
```

Preview changes without applying them:

```powershell
.\scripts\infra\Deploy-AzureMapsStack.ps1 -Environment dev -WhatIf
```

Validate the deployed stack:

```powershell
.\scripts\infra\Test-AzureMapsStack.ps1 -Environment dev
```

Rotate the Entra client secret and republish SWA settings:

```powershell
.\scripts\infra\Deploy-AzureMapsStack.ps1 -Environment dev -RotateClientSecret
```

Remove only the Azure Maps-related resources and settings:

```powershell
.\scripts\infra\Remove-AzureMapsStack.ps1 -Environment dev
```

VS Code users can run the `start full application` task from `.vscode/tasks.json`.

## Quality gates

Run these locally before pushing changes:

```powershell
cd client
npm run lint
npm test -- --watchAll=false
npm run build
cd ..\api
npm run lint
npm test
```

## CI/CD

Two GitHub Actions workflows deploy the app:

- `.github/workflows/build-deploy-nwmiws-swa-dev.yml`
- `.github/workflows/build-deploy-nwmiws-swa-prod.yml`

Each workflow now runs:

- client dependency install
- api dependency install
- client lint
- api lint
- client unit tests
- api unit tests
- client production build
- Azure Static Web Apps deploy

## Production validation

Use the static-data runbook after each deployment:

- `docs/runbooks/prod-static-data-validation.md`

Or run the helper directly:

```bash
python scripts/validate_static_data.py
```

The script reads `STATIC_DATA_VALIDATION_BASE_URLS` from `.env` or `.env.local` by default. To validate a single site explicitly:

```bash
python scripts/validate_static_data.py --base-url https://<app>.azurestaticapps.net
```
