# NW Michigan Water Quality Database

React single-page application for browsing, charting, and downloading northern Michigan water quality data. The deployed app ships its CSV datasets as static assets under `client/public/data/` and runs entirely on Azure Static Web Apps.

## Repository layout

- `client/` React application, static datasets, telemetry bootstrap, and Static Web Apps config
- `data/` non-runtime source reference material
- `docs/runbooks/` release validation instructions
- `scripts/` deployment verification helpers

## Runtime configuration

The React build reads these variables:

- `REACT_APP_APPLICATIONINSIGHTS_CONNECTION_STRING`
- `REACT_APP_PUBLIC_DATA_REVALIDATE_AFTER_MS` optional, defaults to `86400000`

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
npm run build
```

## CI/CD

Two GitHub Actions workflows deploy the app:

- `.github/workflows/build-deploy-nwmiws-swa-dev.yml`
- `.github/workflows/build-deploy-nwmiws-swa-prod.yml`

Each workflow now runs:

- client dependency install
- client lint
- client unit tests
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
