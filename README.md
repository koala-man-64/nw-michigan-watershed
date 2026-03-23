# NW Michigan Water Quality Platform

## Recommendation

Treat this repository as a reusable platform slice plus the current NWMIWS seed deployment, not as a one-off site. The code already reflects that split:

- `apps/portal-web` is the public read-only portal.
- `apps/admin-web` is an operator shell used for local and CI validation.
- `apps/platform-api` is the managed API for bootstrap, published data reads, protected admin mutations, exports, health, and Azure Maps token brokering.
- `packages/contracts` and `packages/map-adapter` define shared platform boundaries.

The current milestone is a transitional platform foundation. The repo now externalizes runtime state into the API data folder, serves the portal from API-backed runtime data, adds an admin surface, and brokers Azure Maps tokens. It does not yet complete the planned PostgreSQL + Blob Storage data plane.

## What This Repo Is

- A packaged, single-tenant watershed data portal for exploring published water-quality data.
- A reusable platform core that can be licensed repeatedly with customer-specific branding, release state, and dataset packs layered on top.
- A file-backed transitional implementation that preserves contracts the future PostgreSQL + Blob Storage version should keep.

## What This Repo Is Not

- Not a multi-tenant SaaS.
- Not a live field-entry system.
- Not yet backed by PostgreSQL or Blob Storage in the checked-in implementation.
- Not yet a finished production-grade admin authentication experience.

## Docs Map

- [scripts/ARCHITECTURE.md](scripts/ARCHITECTURE.md): operator tooling and Azure Maps workflow map
- [data/runbooks/prod-runtime-validation.md](data/runbooks/prod-runtime-validation.md): deployment smoke-check runbook for the current API-backed runtime
- [docs/sales-ready/asset-inventory.md](docs/sales-ready/asset-inventory.md): current transferable asset boundaries
- [docs/sales-ready/provenance-checklist.md](docs/sales-ready/provenance-checklist.md): dataset, customer-pack, and deployment-pack provenance checklist

## Workspace Layout

| Path | Purpose |
| --- | --- |
| `apps/portal-web` | Vite + React public portal |
| `apps/admin-web` | Vite + React + TypeScript operator shell |
| `apps/platform-api` | Azure Functions API for bootstrap, reads, admin mutations, exports, health, and Azure Maps token brokering |
| `packages/contracts` | Shared manifest, release, audit, and DTO contracts |
| `packages/map-adapter` | Shared map viewport normalization utilities |
| `docs/sales-ready` | Business transferability and provenance notes |
| `scripts` | Provisioning, bootstrap, GitHub config sync, and local ops tooling |
| `infra` | Azure Maps infrastructure definitions |
| `data` | Runbooks, calculation notes, and reference transcripts |

## Current Runtime Model

### Public portal

1. `portal-web` attempts to load runtime bootstrap from `GET /api/portal/bootstrap`.
2. If bootstrap is unavailable, the portal falls back to baked-in title/contact defaults for the shell.
3. Portal data reads come from:
   - `GET /api/sites`
   - `GET /api/parameters`
   - `GET /api/measurements`
4. The map requests Azure Maps auth from `GET /api/maps/token`.
5. Published release artifacts are exposed under `GET /api/exports/{releaseId}/{artifact}`.
6. Health checks are exposed under `GET /api/health`.

Supported export artifacts are currently:

- `bootstrap.json`
- `customer-profile.json`
- `manifest.json`
- `sites.csv`
- `parameters.csv`
- `measurements.csv`

### Admin console

`apps/admin-web` is not deployed by the current Static Web Apps workflows. Treat it as a local and CI validation surface for the admin API, not as a finished production operator experience.

Two auth layers matter here:

- The web shell currently uses a client-side placeholder auth provider for sign-in UX. It is not wired to real MSAL/Entra yet.
- The API enforces admin access server-side. In deployed environments, `/api/admin/*` expects Static Web Apps authentication plus one of the configured admin roles. In local development, `local.settings.sample.json` and `scripts/azuremaps/Export-AzureMapsLocalSettings.ps1` set `NWMIWS_ADMIN_AUTH_MODE=mock` so the admin shell can exercise the API without Entra.

The admin console currently targets these API routes:

- `GET /api/admin/bootstrap`
- `GET/PUT /api/admin/customer-profile`
- `GET /api/admin/audit-events`
- `PUT /api/admin/feature-flags/{flagKey}`
- `POST /api/admin/datasets/import`
- `POST /api/admin/datasets/{versionId}/validate`
- `POST /api/admin/datasets/{versionId}/publish`
- `POST /api/admin/releases/{releaseId}/rollback`

### Transitional data plane

The checked-in implementation is file-backed by design for this phase.

- Runtime state defaults to `apps/platform-api/data/platform-state.json` when the Functions host runs from `apps/platform-api`.
- Source CSV inputs default to `apps/platform-api/data/source-data/`.
- You can override those defaults with `NWMIWS_PLATFORM_DATA_DIR`, `NWMIWS_PLATFORM_SOURCE_DATA_DIR`, and `NWMIWS_PLATFORM_STATE_FILE`.

Behavior is intentionally fail-fast:

- Missing `platform-state.json` is auto-seeded with a default state envelope.
- Empty or malformed `platform-state.json` returns `503` responses from health/bootstrap/admin routes instead of silently falling back.

## Business Packaging Model

The intended commercial unit is:

- Platform license
- Customer pack
  Branding, support contact, legal links, feature flags, auth mode, default release
- Data pack
  Dataset manifest, source files, checksum, provenance, publishability
- Deployment pack
  Environment config, app settings, secrets wiring, and operator runbooks
- Optional support and transition services

See:

- [docs/sales-ready/asset-inventory.md](docs/sales-ready/asset-inventory.md)
- [docs/sales-ready/provenance-checklist.md](docs/sales-ready/provenance-checklist.md)

## Local Development

### Required for the basic local loop

- Node.js 20.x
- npm
- PowerShell
- Azure Functions Core Tools
- Azurite, or a real Azure Storage connection string for `AzureWebJobsStorage`

### Required only for Azure and GitHub operator scripts

- Azure CLI
- GitHub CLI for `scripts/bootstrap/Sync-GitHubActionsConfig.ps1`

### Install workspace dependencies

```powershell
npm ci
```

### Run the platform API

```powershell
cd apps/platform-api
npm start
```

The Functions host runs on `http://localhost:9091`.

The local Functions host is configured with `AzureWebJobsStorage=UseDevelopmentStorage=true`. Start Azurite before `npm start`, or replace `AzureWebJobsStorage` in `apps/platform-api/local.settings.json` with a real Azure Storage connection string. If storage is unavailable, the Functions host reports `azure.functions.webjobs.storage` as unhealthy even when some HTTP endpoints still appear to respond.

Run Azurite manually with:

```powershell
pwsh -NoProfile -File .\scripts\local\Ensure-Azurite.ps1
```

If you use the checked-in VS Code launch/tasks flow, Azurite is started automatically before the Functions host.

### Run the public portal

```powershell
cd apps/portal-web
npm run dev
```

The portal runs on `http://localhost:3000` and proxies `/api` to the platform API on `http://localhost:9091`.

### Run the admin console

```powershell
cd apps/admin-web
npm run dev
```

The admin console runs on `http://localhost:4173` and also proxies `/api` to `http://localhost:9091`.

### Export Azure Maps local settings

```powershell
.\scripts\azuremaps\Export-AzureMapsLocalSettings.ps1 -Environment sbx
```

By default this writes `apps/platform-api/local.settings.json`, copies the required Azure Maps app settings from the target Static Web App, and merges local broker origins for:

- `http://localhost:3000`
- `http://localhost:4173`
- `http://localhost:4280`
- `http://127.0.0.1:3000`
- `http://127.0.0.1:4173`
- `http://127.0.0.1:4280`

If the basemap still shows as unavailable after exporting local settings, rerun `.\scripts\azuremaps\Deploy-AzureMapsStack.ps1 -Environment sbx` for the same environment. The Azure Maps account CORS rules must include the same local origins, and `local.settings.json` alone does not update that cloud-side allowlist.

It also writes:

- `FUNCTIONS_WORKER_RUNTIME=node`
- `AzureWebJobsStorage=UseDevelopmentStorage=true`
- `NWMIWS_ADMIN_AUTH_MODE=mock`
- `NWMIWS_ADMIN_REQUIRED_ROLES=admin`

If you do not need real Azure Maps tokens, start from `apps/platform-api/local.settings.sample.json` instead.

## Verification

Run the workspace gates from the repo root:

```powershell
npm run lint
npm run test
npm run build
```

Or validate surfaces individually:

```powershell
npm run lint --workspace @nwmiws/portal-web
npm run test --workspace @nwmiws/portal-web
npm run build --workspace @nwmiws/portal-web

npm run lint --workspace @nwmiws/admin-web
npm run test --workspace @nwmiws/admin-web
npm run build --workspace @nwmiws/admin-web

npm run lint --workspace nwmiws-platform-api
npm run test --workspace nwmiws-platform-api
npm run build --workspace nwmiws-platform-api
```

## Deployment Notes

Current GitHub Actions workflows:

- deploy the public portal static output from `apps/portal-web/dist`
- deploy the managed API from `apps/platform-api`
- validate `apps/admin-web` in its own workflow without deploying it

Branch-to-environment mapping is currently:

- `sbx` -> sandbox / pre-dev
- `dev` -> development
- `main` -> production

The deployed admin API remains behind Static Web Apps authentication and server-side role enforcement. The admin web shell is not deployed by the existing workflows as a separate production surface.

## Important Follow-On Work

1. Replace file-backed API state with PostgreSQL + Blob Storage while preserving the current contracts.
2. Replace the admin shell's placeholder sign-in flow with real Entra/MSAL integration.
3. Move customer-specific environment ownership fully into IaC and Key Vault-backed deployment inputs.
4. Split customer/data-pack bootstrap into a reproducible workflow per customer.
5. Add stronger contract and integration coverage around publish and rollback flows.
