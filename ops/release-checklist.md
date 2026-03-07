# Security Release Checklist

Use this checklist before promoting dev changes to production.

## 1. Source-Control and Secret Hygiene

- Confirm `git log --all -- client/nginx/ssl/server.key client/nginx/ssl/server.crt` is empty in the canonical remote after the history rewrite.
- Confirm `git ls-files 'client/build/**' 'client/nginx/**' 'client/Dockerfile' 'api/local.settings.json'` returns nothing.
- Review the latest advisory PR secret-scan output and resolve any new findings before release.

## 2. Azure Static Web Apps Configuration

- Verify the production settings match [config-matrix.md](config-matrix.md).
- Confirm `CHAT_ENABLED=0`, `CHAT_ALLOW_ANONYMOUS=0`, `READINESS_ALLOW_ANONYMOUS=0`, and `ALLOW_ARBITRARY_BLOB_READS=0` in prod.
- Confirm the deployed build includes `staticwebapp.config.json` and that `/api/ready`, `/api/log-event`, and `/api/chat-rudy` require `authenticated` at the SWA edge.
- Confirm non-local Postman/shared docs use the SWA hostname only.

## 3. Direct Function Host Restrictions

- If a standalone Function App hostname exists for dev or prod, verify one of the following is true:
- Public network access is disabled.
- Azure access restrictions allow only approved administrative access and block general public traffic.
- No integration or test documentation points clients at `*.azurewebsites.net` outside local development.

## 4. Alerts and Telemetry

- Create or confirm Azure Monitor / Application Insights alerts for:
- `GET /api/ready` returning `503`.
- Spikes in `401`, `429`, or `5xx` on `/api/ready`, `/api/log-event`, and `/api/chat-rudy`.
- SQL write failures from `log-event`.
- Any production traffic to `/api/chat-rudy` while `CHAT_ENABLED=0`.
- Confirm structured logs include `request_id`, `route`, `duration_ms`, `authenticated`, and `feature_enabled` where applicable.
- Record the alert rule IDs or portal links in the release notes.

## 5. Verification Commands

- `mkdir -p artifacts`
- `python3 -m py_compile api/*.py`
- `python3 -m pytest api/tests -q --maxfail=1 --cov=api --cov-report=term-missing --cov-report=xml:artifacts/api-coverage.xml`
- `python3 -m json.tool client/public/staticwebapp.config.json > /dev/null`
- `cd client && npm run lint`
- `cd client && npm run test:ci`
- `cd client && npm run build`
- `curl -i http://localhost:7071/api/health`
- `curl -i -H "x-ms-client-principal: <base64 principal>" http://localhost:7071/api/ready`
- `curl -i -X POST -H "Content-Type: application/json" http://localhost:7071/api/chat-rudy -d '{"message":"hello"}'`

Expected signals:

- `health` returns `200`.
- `ready` returns `401` without a principal and `200` or `503` with an authenticated principal.
- `chat-rudy` returns `404` when `CHAT_ENABLED=0`.
- CI publishes `artifacts/api-coverage.xml` and `client/coverage/coverage-summary.json` for the release candidate.

## 6. Rollback

- Redeploy the previous SWA artifact if the current release regresses public routing.
- Restore the previous Azure application settings if a configuration-only change caused the issue.
- Leave `CHAT_ENABLED=0` in prod during rollback unless an incident commander explicitly approves temporary re-enablement.
