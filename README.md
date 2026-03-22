# NW Michigan Water Quality Platform

## Recommendation
Treat this repo as a reusable platform core plus a current customer deployment, not as a one-off site. The code now reflects that direction:

- `apps/portal-web` is the public read-only portal.
- `apps/admin-web` is the local and validation-only operator console.
- `apps/platform-api` is the manifest/state/data API, protected admin API, and Azure Maps token broker.
- `packages/contracts` and `packages/map-adapter` hold shared platform boundaries.

The current milestone is a business-oriented foundation slice. It externalizes customer/runtime state, removes `react-leaflet`, adds an admin surface, and moves the public portal to API-backed runtime data. It does **not** yet complete the long-term PostgreSQL + Blob Storage migration; the API currently uses file-backed state and seeded CSV source data as the transitional data plane.

## What This Product Is

- A packaged, single-tenant watershed data portal for exploring published water-quality data.
- A reusable platform core that can be licensed repeatedly with customer-specific branding, release state, and dataset packs layered on top.
- A read-only public portal with a local/validation admin console for release control, customer profile changes, and audit visibility.

## What This Product Is Not

- Not a multi-tenant SaaS.
- Not a live field-entry system.
- Not yet backed by PostgreSQL/Blob in this repo state.
- Not designed for customers to manage infrastructure inside your personal Azure estate.

## Workspace Layout

| Path | Purpose |
| --- | --- |
| `apps/portal-web` | Vite + React public portal |
| `apps/admin-web` | Vite + React + TypeScript admin console |
| `apps/platform-api` | Azure Functions API for bootstrap, reads, admin mutations, exports, health, and Azure Maps token brokering |
| `packages/contracts` | Shared manifest, release, audit, and DTO contracts |
| `packages/map-adapter` | Shared map viewport normalization utilities |
| `docs/sales-ready` | Business transferability and provenance notes |
| `scripts` | Provisioning, bootstrap, GitHub config sync, and local ops tooling |
| `infra` | Infrastructure-related assets and environment support material |
| `data` | Non-runtime reference material and runbooks |

## Current Runtime Model

### Public portal

1. `portal-web` loads runtime bootstrap from `GET /api/portal/bootstrap`.
2. The portal then reads sites, parameters, and measurements from:
   - `GET /api/sites`
   - `GET /api/parameters`
   - `GET /api/measurements`
3. The map requests Azure Maps auth from `GET /api/maps/token`.
4. Published release artifacts are exposed under `GET /api/exports/{releaseId}/{artifact}`.

### Admin console

`apps/admin-web` is not yet deployed as a separate production surface. It remains the local and CI validation shell for the protected admin API.

In deployed environments, `/api/admin/*` requires Static Web Apps authentication plus the `admin` role. In local development, the sample settings and Azure Maps export script set `NWMIWS_ADMIN_AUTH_MODE=mock` so the console can run without Entra.

The admin console currently uses the platform API for:

- `GET /api/admin/bootstrap`
- `GET/PUT /api/admin/customer-profile`
- `PUT /api/admin/feature-flags/{flagKey}`
- `GET /api/admin/audit-events`
- `POST /api/admin/datasets/import`
- `POST /api/admin/datasets/{versionId}/validate`
- `POST /api/admin/datasets/{versionId}/publish`
- `POST /api/admin/releases/{releaseId}/rollback`

### Transitional data plane

This repo currently stores platform runtime state and source CSVs under:

- `apps/platform-api/data/platform-state.json`
- `apps/platform-api/data/source-data/`

That is deliberate for the current milestone. The next delivery phase should replace this file-backed state with PostgreSQL + Blob Storage without changing the public/admin contracts.

## Business Packaging Model

The intended commercial unit is:

- Platform license
- Customer pack
  Branding, support contact, legal links, feature flags, auth mode, default release
- Data pack
  Dataset manifest, source files, checksum, provenance, publishability
- Deployment package
  Customer environment, config, secrets wiring, runbooks
- Optional support / transition services

See:

- [docs/sales-ready/asset-inventory.md](docs/sales-ready/asset-inventory.md)
- [docs/sales-ready/provenance-checklist.md](docs/sales-ready/provenance-checklist.md)

## Local Development

### Prerequisites

- Node.js 20
- npm
- PowerShell
- Azure Functions Core Tools
- Azure CLI
- GitHub CLI for repo secret/variable sync scripts

### Install workspace dependencies

```powershell
npm ci
```

### Run the platform API

```powershell
cd apps/platform-api
npm start
```

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

By default this writes:

- `apps/platform-api/local.settings.json`

and adds local origins for:

- `http://localhost:3000`
- `http://localhost:4173`
- `http://localhost:4280`

It also sets:

- `NWMIWS_ADMIN_AUTH_MODE=mock`
- `NWMIWS_ADMIN_REQUIRED_ROLES=admin`

## Verification

Run the main gates from the workspace root:

```powershell
npm run lint
npm run test
npm run build
```

Or per surface:

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

Current GitHub Actions workflows deploy the public portal static output from:

- `apps/portal-web/dist`

and deploy the managed API from:

- `apps/platform-api`

`apps/admin-web` is validated in its own CI workflow and is not part of the portal deployment lane.

The deployed admin API stays behind Static Web Apps auth and server-side role enforcement. Existing empty or malformed `platform-state.json` files now fail fast with `503` responses instead of silently falling back to seed data.

Branch-to-environment mapping currently assumes:

- `sbx` -> sandbox / pre-dev
- `dev` -> development
- `main` -> production

The admin console is not deployed by the existing Static Web Apps workflows as a separate production surface.

## Important Follow-On Work

1. Replace file-backed API state with PostgreSQL + Blob Storage while preserving current contracts.
2. Wire the admin console to real Entra/MSAL auth and role checks.
3. Move customer-specific environment ownership fully into IaC + Key Vault-backed deployment inputs.
4. Split customer/data pack bootstrap into a reproducible deployment workflow per customer.
5. Add stronger contract/integration coverage around publish and rollback flows.
