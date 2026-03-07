# Northwest Michigan Watershed Coalition

This repository contains the Northwest Michigan Watershed Coalition client application and its Azure Functions API. The app loads water-quality CSV data from Azure Blob Storage, renders map and chart views for site comparison/trend analysis, and exposes a `Chat with Rudy` assistant backed by OpenAI and blob-hosted reference content.

## Repository layout

- `client/`: React application for the map, filters, plots, and chat interface.
- `api/`: Azure Functions Python app for CSV access, event logging, chat, and health checks.
- `data/`: prompt/RAG source files and supporting project assets.
- `database/`: reference SQL for the logging and user tables.
- `.github/workflows/`: Azure Static Web Apps build/deploy workflows for dev and prod.

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
2. Configure API settings in `api/local.settings.json` or `api/.env`.
3. Start the Azure Functions host from `api/`.
4. Start the React client from `client/` with `npm start`.

The React app proxies API requests to `http://localhost:7071`.

## API environment variables

Configure these in Azure Static Web Apps application settings for the Functions app:

- `STORAGE_ACCOUNT_URL` plus managed identity, or `BLOB_CONN`
- `PUBLIC_BLOB_CONTAINER`
- `PUBLIC_BLOBS`
- `CHAT_WITH_RUDY_CONTAINER`
- `CHAT_WITH_RUDY_PROMPT_BLOB`
- `CHAT_WITH_RUDY_RAG_BLOB`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `OPENAI_EMBEDDING_MODEL`
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
- `POST /api/chat-rudy`
- `GET|POST /api/read-csv`
- `POST /api/log-event`
- `GET|POST /api/hello`

## Validation and release gates

Run these checks before merging:

```bash
python3 -m py_compile api/*.py
cd client && npm run lint
cd client && npm test -- --watchAll=false
cd client && npm run build
python3 .codex/skills/code-drift-sentinel/scripts/codedrift_sentinel.py --mode audit --repo .
```

The drift gate is configured in `.codedrift.yml`. Generated build artifacts and TLS materials under `client/build/` and `client/nginx/ssl/` must not be committed.

## Operational notes

- `GET /api/health` is the lightweight readiness probe for the Functions app.
- `read-csv` only serves approved blobs unless `ALLOW_ARBITRARY_BLOB_READS=1` is explicitly enabled.
- `log-event` now returns an `X-Request-Id` header on every response and hashes client IPs by default unless `LOG_EVENT_IP_MODE=raw`.
- If local debugging reports `AzureWebJobsStorage` validation failures, either run Azurite with `UseDevelopmentStorage=true` or point `api/local.settings.json` at a real storage account.
