import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { App } from "./App";
import type { AdminApi } from "./adminApi";
import type {
  AdminBootstrap,
  AuditEvent,
  CustomerProfile,
  DatasetVersion,
  FeatureFlag,
  PublishedRelease,
} from "./types";

function createBootstrapFixture(overrides: Partial<AdminBootstrap> = {}): AdminBootstrap {
  return {
    customerProfile: {
      customerId: "nwmiws",
      customerName: "NW Michigan Water Quality Database",
      organizationName: "Benzie County Conservation District",
      supportContactName: "John Ransom",
      supportEmail: "john@benziecd.org",
      supportPhone: "231-882-4391",
      legalLink: "/api/exports/release-seed-current/manifest.json",
      defaultPublishedDatasetId: "nwmiws-water-quality",
    },
    featureFlags: [
      {
        key: "compareMode",
        label: "Comparison Mode",
        description: "Enable the comparison panel for multi-site review.",
        enabled: true,
      },
      {
        key: "exports",
        label: "Export Downloads",
        description: "Allow published CSV and summary exports.",
        enabled: true,
      },
      {
        key: "privatePortalMode",
        label: "Private Portal",
        description: "Require authentication for the public portal.",
        enabled: false,
      },
    ],
    datasetVersions: [
      {
        versionId: "dataset-version-seed-current",
        datasetId: "2026.03.22",
        status: "published",
        sourceFiles: ["info.csv", "locations.csv", "NWMIWS_Site_Data_testing_varied.csv"],
        notes: "Seed dataset imported from the current portal CSV source files.",
        uploadedAt: "2026-03-22T06:00:00.000Z",
      },
      {
        versionId: "dataset-version-draft",
        datasetId: "2026.04",
        status: "draft",
        sourceFiles: ["info.csv", "locations.csv"],
        notes: "Draft dataset for workflow tests.",
        uploadedAt: "2026-04-01T06:00:00.000Z",
      },
    ],
    currentRelease: {
      releaseId: "release-seed-current",
      datasetVersionId: "dataset-version-seed-current",
      publishedAt: "2026-03-22T06:00:00.000Z",
      summary: "Seed release reflecting the current portal CSV contents.",
    },
    auditEvents: [
      {
        eventId: "audit-1",
        timestamp: "2026-03-22T06:00:00.000Z",
        actor: "system",
        action: "state.seeded",
        resource: "release-seed-current",
        details: "Fixture bootstrap loaded.",
      },
    ],
    config: {
      apiBaseUrl: "/api",
      authMode: "mock",
    },
    ...overrides,
  };
}

function createAuditEvents(action = "audit.refreshed"): AuditEvent[] {
  return [
    {
      eventId: `audit-${action}`,
      timestamp: "2026-03-22T08:00:00.000Z",
      actor: "admin@example.com",
      action,
      resource: "fixture-resource",
      details: `Refreshed ${action}.`,
    },
  ];
}

function createStubAdminApi(
  overrides: Partial<Record<keyof AdminApi, any>> = {}
): AdminApi & Record<keyof AdminApi, any> {
  const bootstrap = createBootstrapFixture();
  const auditEvents = createAuditEvents();

  return {
    getBootstrap: vi.fn().mockResolvedValue(bootstrap),
    updateCustomerProfile: vi
      .fn()
      .mockImplementation(async (nextProfile: CustomerProfile) => nextProfile),
    updateFeatureFlag: vi.fn().mockImplementation(async (key: string, enabled: boolean) => {
      const currentFlag = bootstrap.featureFlags.find((item) => item.key === key) as FeatureFlag;
      return {
        ...currentFlag,
        enabled,
      };
    }),
    importDataset: vi.fn().mockImplementation(async ({ datasetId, sourceFiles, notes }) => ({
      versionId: "dataset-version-imported",
      datasetId,
      status: "draft" as DatasetVersion["status"],
      sourceFiles: sourceFiles
        .split(",")
        .map((value: string) => value.trim())
        .filter(Boolean),
      notes,
      uploadedAt: "2026-04-15T09:00:00.000Z",
    })),
    validateDataset: vi.fn().mockImplementation(async (versionId: string) => ({
      versionId,
      datasetId: "2026.04",
      status: "validated" as DatasetVersion["status"],
      sourceFiles: ["info.csv"],
      notes: "Validated.",
      uploadedAt: "2026-04-01T06:00:00.000Z",
    })),
    publishDataset: vi.fn().mockImplementation(async (versionId: string) => ({
      releaseId: "release-2026-04",
      datasetVersionId: versionId,
      publishedAt: "2026-04-15T10:00:00.000Z",
      summary: "Published fixture release.",
    })),
    rollbackRelease: vi.fn().mockImplementation(async (releaseId: string) => ({
      releaseId: "release-seed-current",
      datasetVersionId: "dataset-version-seed-current",
      publishedAt: "2026-03-22T06:00:00.000Z",
      rollbackTargetReleaseId: releaseId,
      summary: "Rolled back to the fixture seed release.",
    })),
    getAuditEvents: vi.fn().mockResolvedValue(auditEvents),
    ...overrides,
  };
}

async function signInToDashboard(adminApi = createStubAdminApi()) {
  const user = userEvent.setup();
  render(<App adminApi={adminApi} />);

  expect(
    screen.getByRole("heading", { name: /operator console for a packaged customer deployment/i })
  ).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: /sign in with microsoft entra/i }));
  await screen.findByRole("heading", { name: /branding and support metadata/i });

  return { user, adminApi };
}

describe("admin shell", () => {
  beforeEach(() => {
    window.history.pushState({}, "", "/");
  });

  it("redirects anonymous users to the login entrypoint", () => {
    render(<App adminApi={createStubAdminApi()} />);

    expect(
      screen.getByRole("heading", { name: /operator console for a packaged customer deployment/i })
    ).toBeInTheDocument();
  });

  it("signs in and loads the bootstrap-backed dashboard", async () => {
    const adminApi = createStubAdminApi();
    await signInToDashboard(adminApi);

    expect(adminApi.getBootstrap).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/release control for a single-tenant watershed deployment/i)).toBeInTheDocument();
  });

  it("signs out and returns the user to the login screen", async () => {
    const { user } = await signInToDashboard();

    await user.click(screen.getByRole("button", { name: /sign out/i }));

    expect(
      await screen.findByRole("heading", { name: /operator console for a packaged customer deployment/i })
    ).toBeInTheDocument();
  });

  it("saves the customer profile and refreshes the audit feed", async () => {
    const adminApi = createStubAdminApi();
    const { user } = await signInToDashboard(adminApi);

    const customerNameInput = screen.getByDisplayValue("NW Michigan Water Quality Database");
    await user.clear(customerNameInput);
    await user.type(customerNameInput, "NW Michigan Watershed Portal");
    await user.click(screen.getByRole("button", { name: /save profile/i }));

    await waitFor(() => {
      expect(adminApi.updateCustomerProfile).toHaveBeenCalled();
    });
    expect(adminApi.getAuditEvents).toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("Customer profile saved.");
  });

  it("toggles a feature flag and clears the busy state after the mutation", async () => {
    const adminApi = createStubAdminApi();
    const { user } = await signInToDashboard(adminApi);

    const toggle = screen.getByRole("button", { name: /comparison mode/i });
    await user.click(toggle);

    await waitFor(() => {
      expect(adminApi.updateFeatureFlag).toHaveBeenCalledWith("compareMode", false);
    });
    expect(adminApi.getAuditEvents).toHaveBeenCalled();
    await waitFor(() => {
      expect(toggle).not.toBeDisabled();
    });
  });

  it("imports a dataset and adds the returned version to the dashboard", async () => {
    const adminApi = createStubAdminApi();
    const { user } = await signInToDashboard(adminApi);

    const datasetIdInput = screen.getByDisplayValue("dataset-2026-q2");
    await user.clear(datasetIdInput);
    await user.type(datasetIdInput, "dataset-2026-q3");
    await user.click(screen.getByRole("button", { name: /import dataset/i }));

    await waitFor(() => {
      expect(adminApi.importDataset).toHaveBeenCalled();
    });
    expect(screen.getByText("dataset-version-imported")).toBeInTheDocument();
  });

  it("validates and publishes the latest draft dataset", async () => {
    const adminApi = createStubAdminApi();
    const { user } = await signInToDashboard(adminApi);

    await user.click(screen.getByRole("button", { name: /validate latest draft/i }));
    await waitFor(() => {
      expect(adminApi.validateDataset).toHaveBeenCalledWith("dataset-version-draft");
    });

    await user.click(screen.getByRole("button", { name: /publish latest draft/i }));
    await waitFor(() => {
      expect(adminApi.publishDataset).toHaveBeenCalledWith("dataset-version-draft");
    });
    expect(screen.getByRole("status")).toHaveTextContent("Published release release-2026-04.");
  });

  it("rolls back the current release", async () => {
    const adminApi = createStubAdminApi();
    const { user } = await signInToDashboard(adminApi);

    await user.click(screen.getByRole("button", { name: /roll back current release/i }));

    await waitFor(() => {
      expect(adminApi.rollbackRelease).toHaveBeenCalledWith("release-seed-current");
    });
  });

  it("surfaces a bootstrap failure in an alert region", async () => {
    const adminApi = createStubAdminApi({
      getBootstrap: vi.fn().mockRejectedValue(new Error("platform unavailable")),
    });
    const user = userEvent.setup();
    render(<App adminApi={adminApi} />);

    await user.click(screen.getByRole("button", { name: /sign in with microsoft entra/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("platform unavailable");
  });

  it("surfaces a representative mutation failure and restores the UI to idle", async () => {
    const adminApi = createStubAdminApi({
      updateFeatureFlag: vi.fn().mockRejectedValue(new Error("flag update failed")),
    });
    const { user } = await signInToDashboard(adminApi);
    const toggle = screen.getByRole("button", { name: /comparison mode/i });

    await user.click(toggle);

    expect(await screen.findByRole("alert")).toHaveTextContent("flag update failed");
    await waitFor(() => {
      expect(toggle).not.toBeDisabled();
    });
  });
});
