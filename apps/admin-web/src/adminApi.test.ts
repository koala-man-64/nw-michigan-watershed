import { describe, expect, it, vi } from "vitest";
import { createHttpAdminApi } from "./adminApi";

describe("createHttpAdminApi", () => {
  it("maps bootstrap payloads into the admin shape", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          customerManifest: {
            featureFlags: {
              compareMode: true,
              exports: true,
              privatePortalMode: false,
            },
            legalLinks: [{ href: "https://example.org/legal" }],
          },
          customerProfile: {
            customerId: "nwmiws",
            displayName: "NW Michigan Water Quality Database",
            organization: "Benzie County Conservation District",
            supportContact: {
              name: "Jane Doe",
              email: "support@example.org",
              phoneDisplay: "231-555-0100",
            },
          },
          datasetManifest: {
            datasetId: "dataset-2026-q2",
          },
          datasetVersions: [
            {
              versionId: "dataset-version-2026-q2",
              datasetVersion: "2026.04",
              status: "rolled-back",
              sourceFiles: ["info.csv"],
              importedAtUtc: "2026-03-22T00:00:00.000Z",
            },
          ],
          publishedRelease: {
            releaseId: "release-2026-q2",
            datasetVersionId: "dataset-version-2026-q2",
            publishedAtUtc: "2026-03-22T00:00:00.000Z",
            rollbackTargetReleaseId: "release-2026-q1",
            portalVisibleMetadata: {
              summary: "Current published release",
            },
          },
          auditEvents: [
            {
              auditEventId: "audit-1",
              createdAtUtc: "2026-03-22T00:00:00.000Z",
              actor: "admin@example.org",
              eventType: "dataset.published",
              customerId: "nwmiws",
              details: {
                flagKey: "compareMode",
              },
            },
          ],
          config: {
            apiBaseUrl: "/api",
            authMode: "entra",
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      )
    );

    const api = createHttpAdminApi(fetchImpl as unknown as typeof fetch);
    const bootstrap = await api.getBootstrap();

    expect(bootstrap.customerProfile.customerName).toBe("NW Michigan Water Quality Database");
    expect(bootstrap.customerProfile.legalLink).toBe("https://example.org/legal");
    expect(bootstrap.datasetVersions[0].status).toBe("rolled_back");
    expect(bootstrap.currentRelease.rollbackTargetReleaseId).toBe("release-2026-q1");
    expect(bootstrap.auditEvents[0].details).toBe("compareMode");
    expect(bootstrap.config.authMode).toBe("entra");
  });

  it("surfaces HTTP error responses", async () => {
    const fetchImpl = vi.fn(async () => new Response("platform unavailable", { status: 503 }));

    const api = createHttpAdminApi(fetchImpl as unknown as typeof fetch);

    await expect(api.getBootstrap()).rejects.toThrow("platform unavailable");
  });

  it("maps updated feature flags into the catalog shape", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          updatedFlag: {
            key: "exports",
            enabled: false,
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      )
    );

    const api = createHttpAdminApi(fetchImpl as unknown as typeof fetch);
    const result = await api.updateFeatureFlag("exports", false);

    expect(result).toEqual({
      key: "exports",
      label: "Export Downloads",
      description: "Allow published CSV and summary exports.",
      enabled: false,
    });
  });
});
