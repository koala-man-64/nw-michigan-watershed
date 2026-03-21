# Scripts

Operational scripts live here. `docs/` is documentation only.

For the operator-facing architecture and workflow map, see [ARCHITECTURE.md](./ARCHITECTURE.md).

All entrypoint scripts emit high-level progress by default. Add `-Verbose` to see the underlying `az` and `gh` command flow.

## Entry points

| Path | Purpose | Notes |
| --- | --- | --- |
| `scripts/azuremaps/Deploy-AzureMapsStack.ps1` | Provision or update Azure Maps resources and SWA settings | Supports `-WhatIf` |
| `scripts/azuremaps/Test-AzureMapsStack.ps1` | Validate Azure Maps deployment and settings | Read-only validation |
| `scripts/azuremaps/Remove-AzureMapsStack.ps1` | Tear down Azure Maps resources and related SWA settings | Destructive |
| `scripts/azuremaps/Export-AzureMapsLocalSettings.ps1` | Export `api/local.settings.json` for local basemap development | Writes local secrets |
| `scripts/bootstrap/Provision-AzurePlatform.ps1` | Bootstrap Azure platform prerequisites across environments | Supports `-WhatIf` |
| `scripts/bootstrap/Sync-GitHubActionsConfig.ps1` | Sync GitHub Actions secrets from `api/.env` and repository variables from local config or `api/.env` overrides | Supports `-WhatIf` |

## Shared modules

| Path | Purpose |
| --- | --- |
| `scripts/common/Az.Common.psm1` | Azure CLI helpers, JSON helpers, tag helpers, and resource naming utilities |
| `scripts/common/Repo.Common.psm1` | Workspace resolution, loose `.env` parsing, and GitHub CLI helpers |

## Environment config

Shared environment definitions live under `scripts/environments/`.
