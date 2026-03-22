import type {
  AdminBootstrap,
  AuditEvent,
  CustomerProfile,
  DatasetVersion,
  FeatureFlag,
  ImportDatasetRequest,
  PublishedRelease,
} from "./types";

export interface AdminApi {
  getBootstrap(): Promise<AdminBootstrap>;
  updateCustomerProfile(nextProfile: CustomerProfile): Promise<CustomerProfile>;
  updateFeatureFlag(key: string, enabled: boolean): Promise<FeatureFlag>;
  importDataset(request: ImportDatasetRequest): Promise<DatasetVersion>;
  validateDataset(versionId: string): Promise<DatasetVersion>;
  publishDataset(versionId: string): Promise<PublishedRelease>;
  rollbackRelease(releaseId: string): Promise<PublishedRelease>;
  getAuditEvents(): Promise<AuditEvent[]>;
}

const delay = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

interface DatasetVersionResponse {
  versionId: string;
  datasetVersion: string;
  status: string;
  sourceFiles: string[];
  notes?: string;
  importedAtUtc: string;
}

interface PublishedReleaseResponse {
  releaseId: string;
  datasetVersionId: string;
  publishedAtUtc: string;
  rollbackTargetReleaseId?: string;
  portalVisibleMetadata: {
    summary: string;
  };
}

interface AuditEventResponse {
  auditEventId: string;
  createdAtUtc: string;
  actor: string;
  eventType: string;
  releaseId?: string;
  datasetVersionId?: string;
  customerId?: string;
  details?: {
    message?: string;
    datasetVersion?: string;
    flagKey?: string;
  };
}

interface AdminBootstrapResponse {
  customerManifest: {
    featureFlags: Record<string, boolean>;
    legalLinks?: Array<{ href?: string }>;
  };
  customerProfile: {
    customerId: string;
    displayName: string;
    organization: string;
    supportContact: {
      name: string;
      email: string;
      phoneDisplay: string;
    };
  };
  datasetManifest: {
    datasetId: string;
  };
  datasetVersions?: DatasetVersionResponse[];
  publishedRelease: PublishedReleaseResponse;
  auditEvents?: AuditEventResponse[];
  config: AdminBootstrap["config"];
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createEvent(
  actor: string,
  action: string,
  resource: string,
  details: string
): AuditEvent {
  return {
    eventId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    actor,
    action,
    resource,
    details,
  };
}

function buildFeatureFlagCatalog(enabledFlags: Record<string, boolean>): FeatureFlag[] {
  return [
    {
      key: "compareMode",
      label: "Comparison Mode",
      description: "Enable the comparison panel for multi-site review.",
      enabled: Boolean(enabledFlags.compareMode),
    },
    {
      key: "exports",
      label: "Export Downloads",
      description: "Allow published CSV and summary exports.",
      enabled: Boolean(enabledFlags.exports),
    },
    {
      key: "privatePortalMode",
      label: "Private Portal",
      description: "Require authentication for the public portal.",
      enabled: Boolean(enabledFlags.privatePortalMode),
    },
  ];
}

function mapDatasetStatus(status: string): DatasetVersion["status"] {
  if (status === "validated" || status === "published") {
    return status;
  }

  if (status === "rolled-back") {
    return "rolled_back";
  }

  return "draft";
}

function mapDatasetVersion(item: DatasetVersionResponse): DatasetVersion {
  return {
    versionId: item.versionId,
    datasetId: item.datasetVersion,
    status: mapDatasetStatus(item.status),
    sourceFiles: item.sourceFiles,
    notes: item.notes ?? "",
    uploadedAt: item.importedAtUtc,
  };
}

function mapAuditEvent(event: AuditEventResponse): AuditEvent {
  return {
    eventId: event.auditEventId,
    timestamp: event.createdAtUtc,
    actor: event.actor,
    action: event.eventType,
    resource: event.releaseId || event.datasetVersionId || event.customerId || "",
    details:
      event.details?.message ??
      event.details?.datasetVersion ??
      event.details?.flagKey ??
      JSON.stringify(event.details ?? {}),
  };
}

function mapBootstrapResponse(payload: AdminBootstrapResponse): AdminBootstrap {
  return {
    customerProfile: {
      customerId: payload.customerProfile.customerId,
      customerName: payload.customerProfile.displayName,
      organizationName: payload.customerProfile.organization,
      supportContactName: payload.customerProfile.supportContact.name,
      supportEmail: payload.customerProfile.supportContact.email,
      supportPhone: payload.customerProfile.supportContact.phoneDisplay,
      legalLink: payload.customerManifest.legalLinks?.[0]?.href ?? "",
      defaultPublishedDatasetId: payload.datasetManifest.datasetId,
    },
    featureFlags: buildFeatureFlagCatalog(payload.customerManifest.featureFlags),
    datasetVersions: (payload.datasetVersions || []).map(mapDatasetVersion),
    currentRelease: {
      releaseId: payload.publishedRelease.releaseId,
      datasetVersionId: payload.publishedRelease.datasetVersionId,
      publishedAt: payload.publishedRelease.publishedAtUtc,
      rollbackTargetReleaseId: payload.publishedRelease.rollbackTargetReleaseId ?? undefined,
      summary: payload.publishedRelease.portalVisibleMetadata.summary,
    },
    auditEvents: (payload.auditEvents || []).map(mapAuditEvent),
    config: payload.config,
  };
}

function mapProfileToRequest(profile: CustomerProfile) {
  const digits = profile.supportPhone.replace(/[^\d+]/g, "");
  return {
    customerId: profile.customerId,
    displayName: profile.customerName,
    organization: profile.organizationName,
    supportContact: {
      name: profile.supportContactName,
      organization: profile.organizationName,
      phoneDisplay: profile.supportPhone,
      phoneHref: digits ? `tel:${digits}` : "",
      email: profile.supportEmail,
    },
  };
}

async function readJson(response: Response) {
  if (!response.ok) {
    const message = (await response.text()) || `${response.status} ${response.statusText}`;
    throw new Error(message);
  }

  return response.json();
}

export function createHttpAdminApi(fetchImpl: typeof fetch = window.fetch): AdminApi {
  return {
    async getBootstrap() {
      const response = await fetchImpl("/api/admin/bootstrap", {
        headers: {
          Accept: "application/json",
        },
      });
      return mapBootstrapResponse((await readJson(response)) as AdminBootstrapResponse);
    },
    async updateCustomerProfile(nextProfile) {
      const response = await fetchImpl("/api/admin/customer-profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(mapProfileToRequest(nextProfile)),
      });
      const payload = await readJson(response);
      const updated = payload.customerProfile ?? payload;
      return {
        ...nextProfile,
        customerName: updated.displayName,
        organizationName: updated.organization,
        supportContactName: updated.supportContact.name,
        supportEmail: updated.supportContact.email,
        supportPhone: updated.supportContact.phoneDisplay,
      };
    },
    async updateFeatureFlag(key, enabled) {
      const response = await fetchImpl(`/api/admin/feature-flags/${encodeURIComponent(key)}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ enabled }),
      });
      const payload = await readJson(response);
      const updated = payload.updatedFlag ?? payload;
      return buildFeatureFlagCatalog({
        [key]: updated.enabled,
      }).find((item) => item.key === key) as FeatureFlag;
    },
    async importDataset(request) {
      const response = await fetchImpl("/api/admin/datasets/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          datasetId: request.datasetId,
          sourceFiles: request.sourceFiles
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean),
          notes: request.notes,
        }),
      });
      const payload = await readJson(response);
      const imported = payload.datasetVersion ?? payload;
      return {
        versionId: imported.versionId,
        datasetId: imported.datasetVersion,
        status: mapDatasetStatus(imported.status),
        sourceFiles: imported.sourceFiles,
        notes: imported.notes ?? "",
        uploadedAt: imported.importedAtUtc,
      };
    },
    async validateDataset(versionId) {
      const response = await fetchImpl(`/api/admin/datasets/${encodeURIComponent(versionId)}/validate`, {
        method: "POST",
        headers: {
          Accept: "application/json",
        },
      });
      const payload = await readJson(response);
      const validated = payload.datasetVersion ?? payload;
      return {
        versionId: validated.versionId,
        datasetId: validated.datasetVersion,
        status: mapDatasetStatus(validated.status),
        sourceFiles: validated.sourceFiles,
        notes: validated.notes ?? "",
        uploadedAt: validated.importedAtUtc,
      };
    },
    async publishDataset(versionId) {
      const response = await fetchImpl(`/api/admin/datasets/${encodeURIComponent(versionId)}/publish`, {
        method: "POST",
        headers: {
          Accept: "application/json",
        },
      });
      const payload = await readJson(response);
      const published = payload.publishedRelease ?? payload;
      return {
        releaseId: published.releaseId,
        datasetVersionId: published.datasetVersionId,
        publishedAt: published.publishedAtUtc,
        rollbackTargetReleaseId: published.rollbackTargetReleaseId ?? undefined,
        summary: published.portalVisibleMetadata.summary,
      };
    },
    async rollbackRelease(releaseId) {
      const response = await fetchImpl(`/api/admin/releases/${encodeURIComponent(releaseId)}/rollback`, {
        method: "POST",
        headers: {
          Accept: "application/json",
        },
      });
      const payload = await readJson(response);
      const rolledBack = payload.publishedRelease ?? payload;
      return {
        releaseId: rolledBack.releaseId,
        datasetVersionId: rolledBack.datasetVersionId,
        publishedAt: rolledBack.publishedAtUtc,
        rollbackTargetReleaseId: rolledBack.rollbackTargetReleaseId ?? undefined,
        summary: rolledBack.portalVisibleMetadata.summary,
      };
    },
    async getAuditEvents() {
      const response = await fetchImpl("/api/admin/audit-events", {
        headers: {
          Accept: "application/json",
        },
      });
      const payload = (await readJson(response)) as
        | { items?: AuditEventResponse[] }
        | AuditEventResponse[];
      const auditEvents = Array.isArray(payload) ? payload : (payload.items ?? []);
      return auditEvents.map(mapAuditEvent);
    },
  };
}

export function createMockAdminApi(): AdminApi {
  let customerProfile: CustomerProfile = {
    customerId: "nwmiws",
    customerName: "NW Michigan Water Quality Database",
    organizationName: "Benzie County Conservation District",
    supportContactName: "John Ransom",
    supportEmail: "john@benziecd.org",
    supportPhone: "231-882-4391",
    legalLink: "https://example.org/terms",
    defaultPublishedDatasetId: "dataset-2026-q1",
  };

  let featureFlags: FeatureFlag[] = [
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
  ];

  let datasetVersions: DatasetVersion[] = [
    {
      versionId: "dv-2026-01",
      datasetId: "dataset-2026-q1",
      status: "published",
      sourceFiles: ["measurements.csv", "sites.csv", "parameters.csv"],
      notes: "Baseline production release for the migrated admin shell.",
      uploadedAt: new Date("2026-03-01T14:00:00Z").toISOString(),
    },
  ];

  let currentRelease: PublishedRelease = {
    releaseId: "rel-2026-01",
    datasetVersionId: "dv-2026-01",
    publishedAt: new Date("2026-03-01T14:30:00Z").toISOString(),
    summary: "Baseline published release",
  };

  let auditEvents: AuditEvent[] = [
    createEvent("system", "bootstrap", "admin-console", "Mock admin shell initialized."),
  ];

  async function record(action: string, resource: string, details: string) {
    auditEvents = [createEvent("admin@nwmiws.local", action, resource, details), ...auditEvents];
    await delay(120);
  }

  return {
    async getBootstrap() {
      await delay(120);
      return {
        customerProfile: clone(customerProfile),
        featureFlags: clone(featureFlags),
        datasetVersions: clone(datasetVersions),
        currentRelease: clone(currentRelease),
        auditEvents: clone(auditEvents),
        config: {
          apiBaseUrl: "/api",
          authMode: "mock",
          tenantId: "entra-tenant-placeholder",
          clientId: "entra-client-placeholder",
        },
      };
    },
    async updateCustomerProfile(nextProfile) {
      customerProfile = clone(nextProfile);
      await record(
        "customer_profile.updated",
        nextProfile.customerId,
        `Updated support contact and legal links for ${nextProfile.organizationName}.`
      );
      return clone(customerProfile);
    },
    async updateFeatureFlag(key, enabled) {
      featureFlags = featureFlags.map((flag) =>
        flag.key === key ? { ...flag, enabled } : flag
      );
      const updated = featureFlags.find((flag) => flag.key === key);
      await record("feature_flag.updated", key, `Set ${key}=${String(enabled)}.`);
      return clone(updated as FeatureFlag);
    },
    async importDataset(request) {
      const nextVersion: DatasetVersion = {
        versionId: `dv-${crypto.randomUUID().slice(0, 8)}`,
        datasetId: request.datasetId,
        status: "draft",
        sourceFiles: request.sourceFiles
          .split(",")
          .map((file) => file.trim())
          .filter(Boolean),
        notes: request.notes.trim(),
        uploadedAt: new Date().toISOString(),
      };
      datasetVersions = [nextVersion, ...datasetVersions];
      await record(
        "dataset.imported",
        nextVersion.versionId,
        `Imported ${nextVersion.sourceFiles.length} source file(s) for ${request.datasetId}.`
      );
      return clone(nextVersion);
    },
    async validateDataset(versionId) {
      datasetVersions = datasetVersions.map((version) =>
        version.versionId === versionId ? { ...version, status: "validated" } : version
      );
      const validated = datasetVersions.find((version) => version.versionId === versionId);
      await record("dataset.validated", versionId, "Validation passed with mock adapter.");
      return clone(validated as DatasetVersion);
    },
    async publishDataset(versionId) {
      const version = datasetVersions.find((item) => item.versionId === versionId);
      if (!version) {
        throw new Error(`Dataset version not found: ${versionId}`);
      }
      datasetVersions = datasetVersions.map((item) =>
        item.versionId === versionId ? { ...item, status: "published" } : item
      );
      currentRelease = {
        releaseId: `rel-${crypto.randomUUID().slice(0, 8)}`,
        datasetVersionId: versionId,
        publishedAt: new Date().toISOString(),
        summary: `Published ${version.datasetId} from ${versionId}.`,
      };
      await record("release.published", currentRelease.releaseId, currentRelease.summary);
      return clone(currentRelease);
    },
    async rollbackRelease(releaseId) {
      currentRelease = {
        releaseId: `rel-${crypto.randomUUID().slice(0, 8)}`,
        datasetVersionId: currentRelease.datasetVersionId,
        publishedAt: new Date().toISOString(),
        rollbackTargetReleaseId: releaseId,
        summary: `Rolled back from ${releaseId} to ${currentRelease.datasetVersionId}.`,
      };
      await record("release.rolled_back", releaseId, currentRelease.summary);
      return clone(currentRelease);
    },
    async getAuditEvents() {
      await delay(80);
      return clone(auditEvents);
    },
  };
}

export function createAdminApi(): AdminApi {
  if (import.meta.env.MODE === "test" || import.meta.env.VITE_ADMIN_API_MODE === "mock") {
    return createMockAdminApi();
  }

  return createHttpAdminApi();
}
