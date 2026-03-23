import { app } from "@azure/functions";
import {
  createAdminBootstrapHandler,
  createAdminAuditEventsHandler,
  createAdminCustomerProfileGetHandler,
  createAdminCustomerProfilePutHandler,
  createExportFileHandler,
  createFeatureFlagPutHandler,
  createFaviconHandler,
  createHealthHandler,
  createImportDatasetHandler,
  createMapsTokenHandler,
  createMeasurementsReadHandler,
  createParametersReadHandler,
  createPortalBootstrapHandler,
  createPublishDatasetHandler,
  createRollbackReleaseHandler,
  createSitesReadHandler,
  createValidateDatasetHandler,
} from "./runtime/handlers";

app.http("favicon", {
  route: "favicon.ico",
  methods: ["GET"],
  authLevel: "anonymous",
  handler: createFaviconHandler(),
});

app.http("health", {
  route: "api/health",
  methods: ["GET"],
  authLevel: "anonymous",
  handler: createHealthHandler(),
});

app.http("portalBootstrap", {
  route: "api/portal/bootstrap",
  methods: ["GET"],
  authLevel: "anonymous",
  handler: createPortalBootstrapHandler(),
});

app.http("sites", {
  route: "api/sites",
  methods: ["GET"],
  authLevel: "anonymous",
  handler: createSitesReadHandler(),
});

app.http("parameters", {
  route: "api/parameters",
  methods: ["GET"],
  authLevel: "anonymous",
  handler: createParametersReadHandler(),
});

app.http("measurements", {
  route: "api/measurements",
  methods: ["GET"],
  authLevel: "anonymous",
  handler: createMeasurementsReadHandler(),
});

app.http("exports", {
  route: "api/exports/{releaseId}/{artifact}",
  methods: ["GET"],
  authLevel: "anonymous",
  handler: createExportFileHandler(),
});

app.http("mapsToken", {
  route: "api/maps/token",
  methods: ["GET"],
  authLevel: "anonymous",
  handler: createMapsTokenHandler(),
});

app.http("adminCustomerProfileGet", {
  route: "api/admin/customer-profile",
  methods: ["GET"],
  authLevel: "anonymous",
  handler: createAdminCustomerProfileGetHandler(),
});

app.http("adminBootstrap", {
  route: "api/admin/bootstrap",
  methods: ["GET"],
  authLevel: "anonymous",
  handler: createAdminBootstrapHandler(),
});

app.http("adminCustomerProfilePut", {
  route: "api/admin/customer-profile",
  methods: ["PUT"],
  authLevel: "anonymous",
  handler: createAdminCustomerProfilePutHandler(),
});

app.http("adminAuditEvents", {
  route: "api/admin/audit-events",
  methods: ["GET"],
  authLevel: "anonymous",
  handler: createAdminAuditEventsHandler(),
});

app.http("adminFeatureFlagsPut", {
  route: "api/admin/feature-flags/{flagKey}",
  methods: ["PUT"],
  authLevel: "anonymous",
  handler: createFeatureFlagPutHandler(),
});

app.http("adminDatasetImport", {
  route: "api/admin/datasets/import",
  methods: ["POST"],
  authLevel: "anonymous",
  handler: createImportDatasetHandler(),
});

app.http("adminDatasetValidate", {
  route: "api/admin/datasets/{versionId}/validate",
  methods: ["POST"],
  authLevel: "anonymous",
  handler: createValidateDatasetHandler(),
});

app.http("adminDatasetPublish", {
  route: "api/admin/datasets/{versionId}/publish",
  methods: ["POST"],
  authLevel: "anonymous",
  handler: createPublishDatasetHandler(),
});

app.http("adminReleaseRollback", {
  route: "api/admin/releases/{releaseId}/rollback",
  methods: ["POST"],
  authLevel: "anonymous",
  handler: createRollbackReleaseHandler(),
});
