# Asset Inventory

## Recommendation

Package this repository as platform code plus a customer-specific seed deployment. Do not represent the current repo as already having a fully externalized customer/data-pack system or a completed PostgreSQL + Blob Storage backend.

## Platform Core

The reusable platform code currently includes:

- `apps/portal-web`: public read-only portal
- `apps/admin-web`: local and CI validation operator shell
- `apps/platform-api`: managed API for bootstrap, reads, admin mutations, exports, health, and Azure Maps token brokering
- `packages/contracts`: shared manifest, release, audit, and DTO contracts
- `packages/map-adapter`: shared map viewport utilities
- `scripts/` and `infra/`: operator automation and Azure Maps infrastructure definitions

## Customer and Runtime Assets Currently Checked Into This Repo

The checked-in seed deployment currently lives in the platform API data folder:

- `apps/platform-api/data/platform-state.json`
  Current customer manifest, customer profile, dataset manifest, release history, and audit trail seed state
- `apps/platform-api/data/source-data/info.csv`
  Parameter metadata seed input
- `apps/platform-api/data/source-data/locations.csv`
  Monitoring site metadata seed input
- `apps/platform-api/data/source-data/NWMIWS_Site_Data_testing_varied.csv`
  Measurement seed input

This is a transitional file-backed data plane. It is part of the current deliverable, but it is not the intended long-term storage model.

## Deployment-Owned Assets Outside the Repo

These assets are operationally required but are not fully represented by checked-in runtime data:

- Azure Static Web Apps instances for `sbx`, `dev`, and `prod`
- Azure Functions hosting for `apps/platform-api`
- Azure Maps account, managed identity, and Static Web App app settings
- Application Insights and Log Analytics workspaces
- Entra application registration and service principal used by the Azure Maps broker scripts
- GitHub repository secrets and variables synchronized by `scripts/bootstrap/Sync-GitHubActionsConfig.ps1`
- Customer DNS, certificates, and domain ownership records when applicable

## Transferability Notes

- Platform code is reusable and licensable across customers.
- The current NWMIWS seed customer/runtime state is separable, but today it is still stored as a checked-in file-backed seed rather than as an isolated deployment package.
- Deployment secrets are not part of the repository transfer and must be reprovisioned or explicitly transferred.
- Any sale or transition should distinguish between:
  - reusable platform code
  - seed customer/runtime data currently checked in
  - environment-owned Azure and GitHub configuration

## Evidence

- `README.md`
- `apps/platform-api/src/config.ts`
- `apps/platform-api/src/runtime/stateStore.ts`
- `apps/platform-api/data/platform-state.json`
- `apps/platform-api/data/source-data/`
- `scripts/bootstrap/Provision-AzurePlatform.ps1`
- `scripts/bootstrap/Sync-GitHubActionsConfig.ps1`
