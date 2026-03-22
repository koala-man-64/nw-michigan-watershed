import { app } from "@azure/functions";
import {
  createAdminBootstrapHandler,
  createAdminAuditEventsHandler,
  createAdminCustomerProfileGetHandler,
  createAdminCustomerProfilePutHandler,
  createExportFileHandler,
  createFeatureFlagPutHandler,
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

app.http("health", {
  route: "health",
  methods: ["GET"],
  authLevel: "anonymous",
  handler: createHealthHandler(),
});

app.http("portalBootstrap", {
  route: "portal/bootstrap",
  methods: ["GET"],
  authLevel: "anonymous",
  handler: createPortalBootstrapHandler(),
});

app.http("sites", {
  route: "sites",
  methods: ["GET"],
  authLevel: "anonymous",
  handler: createSitesReadHandler(),
});

app.http("parameters", {
  route: "parameters",
  methods: ["GET"],
  authLevel: "anonymous",
  handler: createParametersReadHandler(),
});

app.http("measurements", {
  route: "measurements",
  methods: ["GET"],
  authLevel: "anonymous",
  handler: createMeasurementsReadHandler(),
});

app.http("exports", {
  route: "exports/{releaseId}/{artifact}",
  methods: ["GET"],
  authLevel: "anonymous",
  handler: createExportFileHandler(),
});

app.http("mapsToken", {
  route: "maps/token",
  methods: ["GET"],
  authLevel: "anonymous",
  handler: createMapsTokenHandler(),
});

app.http("adminCustomerProfileGet", {
  route: "admin/customer-profile",
  methods: ["GET"],
  authLevel: "anonymous",
  handler: createAdminCustomerProfileGetHandler(),
});

app.http("adminBootstrap", {
  route: "admin/bootstrap",
  methods: ["GET"],
  authLevel: "anonymous",
  handler: createAdminBootstrapHandler(),
});

app.http("adminCustomerProfilePut", {
  route: "admin/customer-profile",
  methods: ["PUT"],
  authLevel: "anonymous",
  handler: createAdminCustomerProfilePutHandler(),
});

app.http("adminAuditEvents", {
  route: "admin/audit-events",
  methods: ["GET"],
  authLevel: "anonymous",
  handler: createAdminAuditEventsHandler(),
});

app.http("adminFeatureFlagsPut", {
  route: "admin/feature-flags/{flagKey}",
  methods: ["PUT"],
  authLevel: "anonymous",
  handler: createFeatureFlagPutHandler(),
});

app.http("adminDatasetImport", {
  route: "admin/datasets/import",
  methods: ["POST"],
  authLevel: "anonymous",
  handler: createImportDatasetHandler(),
});

app.http("adminDatasetValidate", {
  route: "admin/datasets/{versionId}/validate",
  methods: ["POST"],
  authLevel: "anonymous",
  handler: createValidateDatasetHandler(),
});

app.http("adminDatasetPublish", {
  route: "admin/datasets/{versionId}/publish",
  methods: ["POST"],
  authLevel: "anonymous",
  handler: createPublishDatasetHandler(),
});

app.http("adminReleaseRollback", {
  route: "admin/releases/{releaseId}/rollback",
  methods: ["POST"],
  authLevel: "anonymous",
  handler: createRollbackReleaseHandler(),
});
