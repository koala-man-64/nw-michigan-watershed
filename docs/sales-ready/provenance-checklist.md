# Dataset and Customer Pack Provenance Checklist

## Recommendation

Use this checklist to separate what is actually in the current repository from what must be recreated or transferred in Azure and GitHub. The current repo stores seed customer/runtime state in `apps/platform-api/data`, so provenance review should start there.

## Dataset Pack

Confirm and record:

- dataset manifest ID, dataset ID, version, schema version, and owner from `apps/platform-api/data/platform-state.json`
- source file list under `apps/platform-api/data/source-data/`
- checksum or replacement checksum procedure for the shipped source files
- allowed-use statement and provenance notes from the dataset manifest
- publishable status and active release linkage

## Customer Pack

Confirm and record:

- customer ID, slug, display name, and description from the customer manifest
- branding fields, support contact, and legal links
- feature flag values and default release linkage
- customer profile fields such as website and support hours

## Deployment Pack

Confirm and record:

- environment definitions under `scripts/environments/sbx.psd1`, `dev.psd1`, and `prod.psd1`
- Static Web App names, Application Insights names, Azure Maps account names, and allowed origins
- GitHub repository secret names and variable names managed by `scripts/bootstrap/Sync-GitHubActionsConfig.ps1`
- Azure resources and identities that must be reprovisioned or explicitly handed over

Do not transfer or commit:

- client secrets
- deployment tokens
- local settings files with secrets

## Pre-Sale Gate

Before treating a package as transferable, confirm:

- platform code is separated conceptually from the seed NWMIWS runtime data
- dataset rights and allowed use are documented
- customer branding and support metadata are approved for transfer
- environment secrets are excluded from the transfer package
- Azure and GitHub dependencies are listed as operational handoff items
- the active release and export artifact inventory are captured

## Evidence

- `apps/platform-api/data/platform-state.json`
- `apps/platform-api/data/source-data/`
- `scripts/environments/sbx.psd1`
- `scripts/environments/dev.psd1`
- `scripts/environments/prod.psd1`
- `scripts/bootstrap/Sync-GitHubActionsConfig.ps1`
