# Asset Inventory

## Platform Core
- Portal web application under `apps/portal-web`
- Platform API under `apps/platform-api`
- Shared contracts and manifest schemas under `packages/contracts`
- Shared map adapter code under `packages/map-adapter`
- Shared scripts and infrastructure automation under `scripts/` and `infra/`

## Customer-Specific Assets
- Customer manifest values for branding, support contacts, legal links, feature flags, and default dataset
- Published dataset manifests, raw uploads, and release metadata
- Customer domains, DNS records, and environment-specific application settings

## Third-Party Services and Dependencies
- Azure Static Web Apps / web hosting configuration
- Azure Functions API hosting
- Azure Maps account and token broker integration
- Application Insights telemetry
- Microsoft Entra ID configuration for admin access

## Transferability Notes
- Platform core is intended to remain licensable and reusable across customers.
- Customer manifests and published datasets are intended to be separable from the platform core.
- Third-party services, identities, and secrets require explicit transfer or reprovisioning decisions before any sale.
