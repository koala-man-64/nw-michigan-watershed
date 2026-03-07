# Security Configuration Matrix

This matrix defines the expected security-sensitive Azure Static Web Apps application settings for each environment.

| Setting | Local Default | Dev SWA | Prod SWA | Notes |
| --- | --- | --- | --- | --- |
| `ALLOW_ARBITRARY_BLOB_READS` | `0` | `0` | `0` | Keep blob access pinned to the allowlist. |
| `CHAT_ENABLED` | `0` | `1` | `0` | Enable only for internal dev testing. |
| `CHAT_ALLOW_ANONYMOUS` | `0` | `0` | `0` | Protected by SWA auth when enabled. |
| `CHAT_REQUIRED_ROLE` | `authenticated` | `authenticated` | `authenticated` | Keep aligned with `staticwebapp.config.json`. |
| `CHAT_RATE_LIMIT_MAX` | `12` | `12` | `12` | Applies only when chat is enabled. |
| `CHAT_RATE_LIMIT_WINDOW_SEC` | `60` | `60` | `60` | Per-instance best-effort limit. |
| `CHAT_MAX_MESSAGE_CHARS` | `2000` | `2000` | `2000` | Prevent oversized requests. |
| `READINESS_ALLOW_ANONYMOUS` | `0` | `0` | `0` | Always require authenticated diagnostics access. |
| `READINESS_REQUIRED_ROLE` | `authenticated` | `authenticated` | `authenticated` | Keep aligned with `staticwebapp.config.json`. |
| `LOG_EVENT_ENABLED` | `1` | `1` | `1` | Disable only for incident response or testing. |
| `LOG_EVENT_REQUIRED_ROLE` | `authenticated` | `authenticated` | `authenticated` | Protect write access at SWA and handler layers. |
| `LOG_EVENT_SAMPLE_RATE` | `1.0` | `1.0` | `1.0` | Reduce only if telemetry volume becomes excessive. |
| `LOG_EVENT_RATE_LIMIT_MAX` | `60` | `60` | `60` | Per-instance best-effort limit. |
| `LOG_EVENT_RATE_LIMIT_WINDOW_SEC` | `60` | `60` | `60` | Matches current code defaults. |
| `LOG_EVENT_IP_MODE` | `hash` | `hash` | `hash` | Preserve hashed IP storage by default. |
| `LOG_EVENT_CAPTURE_TEXT` | `0` | `0` | `0` | Avoid capturing user-entered text unless explicitly approved. |

Additional environment rules:

- Use the Azure Static Web Apps hostname as the only supported non-local ingress.
- If a standalone Function App still exists, keep public network access disabled or locked down with access restrictions before enabling protected routes.
- Keep `OPENAI_API_KEY`, storage credentials, and SQL connection settings in Azure configuration only; do not commit them to source control.
