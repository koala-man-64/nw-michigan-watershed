# Northwest Michigan Watershed Coalition

This repository contains the Northwest Michigan Watershed Coalition client application and its Azure Functions API. The app loads water-quality CSV data from Azure Blob Storage, renders map and chart views for site comparison/trend analysis, and includes an internal-only `Chat with Rudy` API backed by OpenAI and blob-hosted reference content.

## Repository layout

- `client/`: React application for the public map, filters, plots, and Static Web Apps edge configuration.
- `api/`: Azure Functions Python app for CSV access, event logging, chat, and health checks.
- `data/`: prompt/RAG source files and supporting project assets.
- `database/`: reference SQL for the logging and user tables.
- `.github/workflows/`: Azure Static Web Apps build/deploy workflows for dev and prod.
- `ops/`: security runbooks, environment matrix, release checklist, and tracked follow-ups.

## Prerequisites

- Node.js 18.x with npm
- Python 3.10
- Azure Functions Core Tools for local API execution
- Access to the Azure Blob/OpenAI/SQL resources used by the deployed app

## Local development

1. Install client dependencies:
   ```bash
   cd client
   npm install
   ```
2. Configure API settings in `api/local.settings.json` or by copying `api/.env.example` to `api/.env`.
3. Start the Azure Functions host from `api/`.
4. Start the React client from `client/` with `npm start`.

The React app proxies API requests to `http://localhost:7071`.

## API environment variables

Configure these in Azure Static Web Apps application settings for the Functions app:

- `STORAGE_ACCOUNT_URL` plus managed identity, or `BLOB_CONN`
- `PUBLIC_BLOB_CONTAINER`
- `PUBLIC_BLOBS`
- `ALLOW_ARBITRARY_BLOB_READS`
- `CHAT_WITH_RUDY_CONTAINER`
- `CHAT_WITH_RUDY_PROMPT_BLOB`
- `CHAT_WITH_RUDY_RAG_BLOB`
- `CHAT_ENABLED`
- `CHAT_ALLOW_ANONYMOUS`
- `CHAT_REQUIRED_ROLE`
- `CHAT_RATE_LIMIT_MAX`
- `CHAT_RATE_LIMIT_WINDOW_SEC`
- `CHAT_MAX_MESSAGE_CHARS`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `OPENAI_EMBEDDING_MODEL`
- `READINESS_ALLOW_ANONYMOUS`
- `READINESS_REQUIRED_ROLE`
- `SQL_CONNECTION_STRING`
- `SQL_DRIVER`
- `LOG_EVENT_ENABLED`
- `LOG_EVENT_REQUIRED_ROLE`
- `LOG_EVENT_SAMPLE_RATE`
- `LOG_EVENT_RATE_LIMIT_MAX`
- `LOG_EVENT_RATE_LIMIT_WINDOW_SEC`
- `LOG_EVENT_IP_MODE`
- `LOG_EVENT_CAPTURE_TEXT`

Current API endpoints:

- `GET /api/health`
- `GET /api/ready`
- `POST /api/chat-rudy` (internal-only; returns `404` unless `CHAT_ENABLED=1`)
- `GET|POST /api/read-csv`
- `POST /api/log-event`

## Validation and release gates

Run these checks before merging:

```bash
mkdir -p artifacts
python3 -m py_compile api/*.py
python3 -m pytest api/tests -q --maxfail=1 --cov=api --cov-report=term-missing --cov-report=xml:artifacts/api-coverage.xml
python3 -m json.tool client/public/staticwebapp.config.json > /dev/null
cd client && npm run lint
cd client && npm run test:ci
cd client && npm run build
python3 .codex/skills/code-drift-sentinel/scripts/codedrift_sentinel.py --mode audit --repo .
```

The drift gate is configured in `.codedrift.yml`. The GitHub workflows pin action SHAs, run backend pytest and frontend coverage before build/deploy, run an advisory client dependency audit, run an advisory PR secret scan, and upload `artifacts/api-coverage.xml` plus `client/coverage/coverage-summary.json` for review. Generated build artifacts, legacy container assets under `client/nginx/`, `client/Dockerfile`, and `api/local.settings.json` must not be versioned.

## Operational notes

- `GET /api/health` is the lightweight readiness probe for the Functions app.
- `GET /api/ready` is the authenticated diagnostics endpoint; add `?deep=1` to validate storage/chat assets/SQL connectivity with bounded checks.
- `client/public/staticwebapp.config.json` is the primary edge-auth contract for Azure Static Web Apps. Non-local testing must use the SWA hostname, not a direct `*.azurewebsites.net` Function App hostname.
- `chat-rudy` is disabled by default and returns `404` unless `CHAT_ENABLED=1`. When enabled, it requires SWA authentication unless `CHAT_ALLOW_ANONYMOUS=1` is explicitly configured.
- `read-csv` only serves approved blobs unless `ALLOW_ARBITRARY_BLOB_READS=1` is explicitly enabled.
- `log-event` now returns an `X-Request-Id` header on every response and hashes client IPs by default unless `LOG_EVENT_IP_MODE=raw`.
- `api/.env` and `api/local.settings.json` are for local use only and must not be committed or deployed.
- `debugpy` is no longer installed by default. Install it only in a local developer environment if you need remote debugging.
- Review [ops/config-matrix.md](ops/config-matrix.md), [ops/release-checklist.md](ops/release-checklist.md), [ops/history-remediation.md](ops/history-remediation.md), and [ops/follow-ups.md](ops/follow-ups.md) before promoting changes.
- If local debugging reports `AzureWebJobsStorage` validation failures, either run Azurite with `UseDevelopmentStorage=true` or point `api/local.settings.json` at a real storage account.
