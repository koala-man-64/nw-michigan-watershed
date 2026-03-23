const fixtureSupport = require("../../../test-support/fixtures/index.cjs");

import { describe, expect, it, vi } from "vitest";
import { createHttpAdminApi } from "./adminApi";

function createJsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

describe("createHttpAdminApi", () => {
  it("maps bootstrap payloads into the admin shape", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(createJsonResponse(fixtureSupport.readJsonFixture("admin-bootstrap.json")));

    const api = createHttpAdminApi(fetchImpl as unknown as typeof fetch);
    const bootstrap = await api.getBootstrap();

    expect(bootstrap.customerProfile.customerName).toBe("NW Michigan Water Quality Database");
    expect(bootstrap.customerProfile.legalLink).toBe("/api/exports/release-seed-current/manifest.json");
    expect(bootstrap.datasetVersions[0].status).toBe("published");
    expect(bootstrap.currentRelease.releaseId).toBe("release-seed-current");
    expect(bootstrap.auditEvents[0].details).toContain("datasetVersionId");
    expect(bootstrap.config.authMode).toBe("mock");
  });

  it("surfaces HTTP error responses", async () => {
    const fetchImpl = vi.fn(async () => new Response("platform unavailable", { status: 503 }));

    const api = createHttpAdminApi(fetchImpl as unknown as typeof fetch);

    await expect(api.getBootstrap()).rejects.toThrow("platform unavailable");
  });

  it("maps updated feature flags into the catalog shape", async () => {
    const fetchImpl = vi.fn(async () =>
      createJsonResponse({
        updatedFlag: {
          key: "exports",
          enabled: false,
        },
      })
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

  it("maps publish and rollback responses into the release summary shape", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse({
          publishedRelease: {
            releaseId: "release-2026-04",
            datasetVersionId: "dataset-version-2026-04",
            publishedAtUtc: "2026-04-15T10:00:00.000Z",
            rollbackTargetReleaseId: "release-seed-current",
            portalVisibleMetadata: {
              summary: "Published fixture release",
            },
          },
        })
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          publishedRelease: {
            releaseId: "release-seed-current",
            datasetVersionId: "dataset-version-seed-current",
            publishedAtUtc: "2026-03-22T06:00:00.000Z",
            rollbackTargetReleaseId: "release-2026-04",
            portalVisibleMetadata: {
              summary: "Rolled back to fixture seed release",
            },
          },
        })
      );

    const api = createHttpAdminApi(fetchImpl as unknown as typeof fetch);
    const published = await api.publishDataset("dataset-version-2026-04");
    const rolledBack = await api.rollbackRelease("release-2026-04");

    expect(published.summary).toBe("Published fixture release");
    expect(published.rollbackTargetReleaseId).toBe("release-seed-current");
    expect(rolledBack.releaseId).toBe("release-seed-current");
    expect(rolledBack.rollbackTargetReleaseId).toBe("release-2026-04");
  });

  it("maps audit event list wrappers into the dashboard shape", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      createJsonResponse({
        items: [
          {
            auditEventId: "audit-1",
            createdAtUtc: "2026-03-22T00:00:00.000Z",
            actor: "admin@example.org",
            eventType: "feature-flag.updated",
            customerId: "nwmiws",
            details: {
              message: "Feature flag updated.",
            },
          },
        ],
      })
    );

    const api = createHttpAdminApi(fetchImpl as unknown as typeof fetch);
    const auditEvents = await api.getAuditEvents();

    expect(auditEvents).toEqual([
      {
        eventId: "audit-1",
        timestamp: "2026-03-22T00:00:00.000Z",
        actor: "admin@example.org",
        action: "feature-flag.updated",
        resource: "nwmiws",
        details: "Feature flag updated.",
      },
    ]);
  });
});
