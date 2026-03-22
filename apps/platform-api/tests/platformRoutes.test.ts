import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { afterEach, beforeEach } from "node:test";
import type { HttpRequestUser } from "@azure/functions";
import {
  createAdminBootstrapHandler,
  createAdminAuditEventsHandler,
  createAdminCustomerProfileGetHandler,
  createAdminCustomerProfilePutHandler,
  createFeatureFlagPutHandler,
  createExportFileHandler,
  createHealthHandler,
  createImportDatasetHandler,
  createMeasurementsReadHandler,
  createParametersReadHandler,
  createPortalBootstrapHandler,
  createPublishDatasetHandler,
  createRollbackReleaseHandler,
  createSitesReadHandler,
  createValidateDatasetHandler,
} from "../src/runtime/handlers";
import { getPlatformRuntimeConfig } from "../src/config";
import { loadState } from "../src/runtime/stateStore";

interface TestFixture {
  rootDir: string;
  runtimeConfig: ReturnType<typeof getPlatformRuntimeConfig>;
}

let fixture: TestFixture;

beforeEach(() => {
  const rootDir = mkdtempSync(path.join(os.tmpdir(), "nwmiws-platform-api-"));
  const baseConfig = getPlatformRuntimeConfig();
  fixture = {
    rootDir,
    runtimeConfig: {
      ...baseConfig,
      dataDir: rootDir,
      sourceDataDir: path.join(process.cwd(), "data", "source-data"),
      stateFilePath: path.join(rootDir, "platform-state.json"),
      adminAuthMode: "mock",
    },
  };
});

afterEach(() => {
  rmSync(fixture.rootDir, { recursive: true, force: true });
});

function createContext() {
  return {
    log() {},
    warn() {},
    error() {},
  } as any;
}

function createJsonRequest(
  body: unknown,
  options: {
    url?: string;
    params?: Record<string, string>;
    headers?: Record<string, string>;
    user?: HttpRequestUser | null;
  } = {}
) {
  return {
    url: options.url || "https://example.com/",
    params: options.params || {},
    headers: new Headers(options.headers || {}),
    user: options.user,
    json: async () => body,
  };
}

function createSwaHeaders(userRoles: string[]) {
  const principal = Buffer.from(
    JSON.stringify({
      identityProvider: "aad",
      userId: "user-123",
      userDetails: "admin@example.com",
      userRoles,
    }),
    "utf8"
  ).toString("base64");

  return {
    "x-ms-client-principal": principal,
  };
}

test("portal bootstrap exposes the active release and map provider", async () => {
  const handler = createPortalBootstrapHandler({
    runtimeConfig: fixture.runtimeConfig,
    getAzureMapsConfig: () => ({
      isValid: true,
      allowedOrigins: ["https://portal.example.com"],
      azureMapsSasTtlMinutes: 30,
      azureMapsSasMaxRps: 500,
      azureMapsSasSigningKey: "secondaryKey",
      azureTenantId: "tenant-id",
      azureClientId: "client-id",
      azureClientSecret: "client-secret",
      azureMapsSubscriptionId: "subscription-id",
      azureMapsResourceGroup: "rg-name",
      azureMapsAccountName: "maps-name",
      azureMapsAccountClientId: "maps-client-id",
      azureMapsUamiPrincipalId: "uami-principal-id",
      missingSettings: [],
      invalidSettings: [],
      invalidOrigins: [],
    }),
  });

  const response = await handler();

  assert.equal(response.status, 200);
  assert.equal(response.jsonBody?.customerManifest.customerId, "nwmiws");
  assert.equal(response.jsonBody?.publishedRelease.releaseId, "release-seed-current");
  assert.deepEqual(response.jsonBody?.mapProvider.allowedOrigins, ["https://portal.example.com"]);
});

test("admin bootstrap aggregates profile, flags, releases, and audit data", async () => {
  const response = await createAdminBootstrapHandler({ runtimeConfig: fixture.runtimeConfig })();

  assert.equal(response.status, 200);
  assert.equal(response.jsonBody?.customerManifest.customerId, "nwmiws");
  assert.ok(Array.isArray(response.jsonBody?.datasetVersions));
  assert.ok(Array.isArray(response.jsonBody?.auditEvents));
   assert.equal(response.jsonBody?.config.authMode, "mock");
});

test("admin bootstrap rejects unauthenticated requests in swa mode", async () => {
  const response = await createAdminBootstrapHandler({
    runtimeConfig: {
      ...fixture.runtimeConfig,
      adminAuthMode: "swa",
    },
  })(createJsonRequest(null));

  assert.equal(response.status, 401);
  assert.equal(response.jsonBody?.error, "authentication_required");
});

test("admin bootstrap rejects requests without the required role in swa mode", async () => {
  const response = await createAdminBootstrapHandler({
    runtimeConfig: {
      ...fixture.runtimeConfig,
      adminAuthMode: "swa",
    },
  })(
    createJsonRequest(null, {
      headers: createSwaHeaders(["authenticated"]),
    })
  );

  assert.equal(response.status, 403);
  assert.equal(response.jsonBody?.error, "forbidden");
});

test("admin bootstrap accepts authenticated requests with the required role in swa mode", async () => {
  const response = await createAdminBootstrapHandler({
    runtimeConfig: {
      ...fixture.runtimeConfig,
      adminAuthMode: "swa",
    },
  })(
    createJsonRequest(null, {
      headers: createSwaHeaders(["authenticated", "admin"]),
    })
  );

  assert.equal(response.status, 200);
  assert.equal(response.jsonBody?.config.authMode, "entra");
});

test("read endpoints return data from the seeded CSV bundle", async () => {
  const sites = await createSitesReadHandler({ runtimeConfig: fixture.runtimeConfig })();
  const parameters = await createParametersReadHandler({ runtimeConfig: fixture.runtimeConfig })();
  const measurements = await createMeasurementsReadHandler({ runtimeConfig: fixture.runtimeConfig })(
    createJsonRequest(null, {
      url: "https://example.com/api/measurements?parameter=Chloro&year=2000",
    })
  );

  assert.equal(sites.status, 200);
  assert.ok(Array.isArray(sites.jsonBody?.items));
  assert.ok(sites.jsonBody?.count > 0);

  assert.equal(parameters.status, 200);
  assert.ok(Array.isArray(parameters.jsonBody?.items));
  assert.ok(parameters.jsonBody?.count > 0);

  assert.equal(measurements.status, 200);
  assert.equal(measurements.jsonBody?.count, measurements.jsonBody?.items.length);
  assert.equal(measurements.jsonBody?.appliedFilters.parameter, "Chloro");
});

test("export endpoint returns release-scoped artifacts", async () => {
  const handler = createExportFileHandler({ runtimeConfig: fixture.runtimeConfig });
  const response = await handler(
    createJsonRequest(null, {
      params: {
        releaseId: "release-seed-current",
        artifact: "measurements.csv",
      },
    }),
  );

  assert.equal(response.status, 200);
  assert.match(String(response.body), /^Site,SiteType,Year,Parameter,Max,Min,Avg,Count/m);
  assert.equal(
    (response.headers as Record<string, string> | undefined)?.["Content-Disposition"],
    'attachment; filename="release-seed-current-measurements.csv"'
  );
});

test("health endpoint reports service state", async () => {
  const response = await createHealthHandler({ runtimeConfig: fixture.runtimeConfig })();

  assert.equal(response.status, 200);
  assert.equal(response.jsonBody?.status, "ok");
  assert.equal(response.jsonBody?.service, "platform-api");
  assert.equal(response.jsonBody?.customerId, "nwmiws");
});

test("public routes remain accessible when admin auth mode is swa", async () => {
  const secureConfig = {
    ...fixture.runtimeConfig,
    adminAuthMode: "swa" as const,
  };

  const health = await createHealthHandler({ runtimeConfig: secureConfig })();
  const portalBootstrap = await createPortalBootstrapHandler({ runtimeConfig: secureConfig })();

  assert.equal(health.status, 200);
  assert.equal(portalBootstrap.status, 200);
});

test("customer profile updates are persisted and audited", async () => {
  const putHandler = createAdminCustomerProfilePutHandler({ runtimeConfig: fixture.runtimeConfig });
  const putResponse = await putHandler(
    createJsonRequest(
      {
        displayName: "NW Michigan Watershed Portal",
        organization: "Benzie County Conservation District",
        supportContact: {
          name: "Jane Doe",
          organization: "Benzie County Conservation District",
          phoneDisplay: "231-555-0100",
          phoneHref: "tel:+12315550100",
          email: "support@example.com",
        },
        website: "https://portal.example.com",
        supportHours: "Mon-Fri 9:00 AM to 5:00 PM",
      },
      {
        headers: {
          "x-user-name": "operator@example.com",
          "x-correlation-id": "corr-123",
        },
      }
    )
  );

  assert.equal(putResponse.status, 200);
  assert.equal(putResponse.jsonBody?.customerProfile.displayName, "NW Michigan Watershed Portal");

  const getResponse = await createAdminCustomerProfileGetHandler({ runtimeConfig: fixture.runtimeConfig })();
  assert.equal(getResponse.jsonBody?.customerProfile.supportContact.email, "support@example.com");

  const auditResponse = await createAdminAuditEventsHandler({ runtimeConfig: fixture.runtimeConfig })(
    createJsonRequest(null)
  );
  assert.equal(auditResponse.status, 200);
  assert.equal(auditResponse.jsonBody?.items[0].eventType, "customer-profile.updated");
  assert.equal(auditResponse.jsonBody?.items[0].correlationId, "corr-123");
});

test("feature flag updates are persisted and returned in the admin shape", async () => {
  const response = await createFeatureFlagPutHandler({ runtimeConfig: fixture.runtimeConfig })(
    createJsonRequest(
      { enabled: false },
      {
        params: { flagKey: "compareMode" },
        headers: {
          "x-user-name": "operator@example.com",
          "x-correlation-id": "corr-flag",
        },
      }
    )
  );

  assert.equal(response.status, 200);
  assert.equal(response.jsonBody?.updatedFlag.key, "compareMode");
  assert.equal(response.jsonBody?.updatedFlag.enabled, false);
  assert.equal(loadState(fixture.runtimeConfig).customerManifest.featureFlags.compareMode, false);
});

test("dataset import, validate, publish, and rollback flow updates the file-backed state", async () => {
  const importHandler = createImportDatasetHandler({ runtimeConfig: fixture.runtimeConfig });
  const imported = await importHandler(
    createJsonRequest(
      {
        versionId: "dataset-version-2026-04",
        datasetManifestId: "dataset-manifest-seed-current",
        datasetVersion: "2026.04",
        checksum: "sha256:new-seed",
        sourceFiles: ["info.csv", "locations.csv", "NWMIWS_Site_Data_testing_varied.csv"],
        notes: "Imported for release testing.",
      },
      {
        headers: {
          "x-user-name": "operator@example.com",
        },
      }
    )
  );

  assert.equal(imported.status, 201);
  assert.equal(imported.jsonBody?.datasetVersion.status, "imported");

  const validateResponse = await createValidateDatasetHandler({ runtimeConfig: fixture.runtimeConfig })(
    createJsonRequest(null, {
      params: { versionId: "dataset-version-2026-04" },
      headers: {
        "x-user-name": "operator@example.com",
      },
    })
  );
  assert.equal(validateResponse.status, 200);
  assert.equal(validateResponse.jsonBody?.datasetVersion.status, "validated");

  const publishResponse = await createPublishDatasetHandler({ runtimeConfig: fixture.runtimeConfig })(
    createJsonRequest(
      {
        releaseId: "release-2026-04",
        portalVisibleMetadata: {
          title: "April 2026 Release",
          summary: "Test release for the platform API slice.",
        },
      },
      {
        params: { versionId: "dataset-version-2026-04" },
        headers: {
          "x-user-name": "operator@example.com",
        },
      }
    )
  );
  assert.equal(publishResponse.status, 200);
  assert.equal(publishResponse.jsonBody?.publishedRelease.releaseId, "release-2026-04");
  assert.equal(loadState(fixture.runtimeConfig).activeReleaseId, "release-2026-04");

  const rollbackResponse = await createRollbackReleaseHandler({ runtimeConfig: fixture.runtimeConfig })(
    createJsonRequest(null, {
      params: { releaseId: "release-seed-current" },
      headers: {
        "x-user-name": "operator@example.com",
      },
    })
  );
  assert.equal(rollbackResponse.status, 200);
  assert.equal(rollbackResponse.jsonBody?.publishedRelease.releaseId, "release-seed-current");
  assert.equal(loadState(fixture.runtimeConfig).activeReleaseId, "release-seed-current");
});

test("health endpoint returns 503 when the state file is empty", async () => {
  writeFileSync(fixture.runtimeConfig.stateFilePath, "", "utf8");

  const response = await createHealthHandler({ runtimeConfig: fixture.runtimeConfig })(
    undefined,
    createContext()
  );

  assert.equal(response.status, 503);
  assert.equal(response.jsonBody?.status, "state_unavailable");
});

test("portal bootstrap returns 503 when the state file is malformed", async () => {
  writeFileSync(fixture.runtimeConfig.stateFilePath, "{not-json", "utf8");

  const response = await createPortalBootstrapHandler({ runtimeConfig: fixture.runtimeConfig })(
    undefined,
    createContext()
  );

  assert.equal(response.status, 503);
  assert.equal(response.jsonBody?.error, "state_unavailable");
});

test("admin mutations return 503 and leave the state file unchanged when state is unavailable", async () => {
  writeFileSync(fixture.runtimeConfig.stateFilePath, "", "utf8");

  const handler = createAdminCustomerProfilePutHandler({ runtimeConfig: fixture.runtimeConfig });
  const response = await handler(
    createJsonRequest(
      {
        displayName: "Should Not Persist",
      },
      {
        headers: {
          "x-user-name": "operator@example.com",
        },
      }
    ),
    createContext()
  );

  assert.equal(response.status, 503);
  assert.equal(response.jsonBody?.error, "state_unavailable");
  assert.equal(readFileSync(fixture.runtimeConfig.stateFilePath, "utf8"), "");
});
