import type { AdminApi } from "./adminApi";
import type {
  AdminBootstrap,
  AuditEvent,
  CustomerProfile,
  DatasetVersion,
  FeatureFlag,
  ImportDatasetRequest,
  PublishedRelease,
} from "./types";

export interface DashboardViewModel {
  bootstrap: AdminBootstrap;
  customerProfile: CustomerProfile;
  featureFlags: FeatureFlag[];
  datasetVersions: DatasetVersion[];
  currentRelease: PublishedRelease;
  auditEvents: AuditEvent[];
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function requireValue<T>(value: T | null | undefined, message: string): T {
  if (value == null) {
    throw new Error(message);
  }

  return value;
}

export function toDashboardViewModel(bootstrap: AdminBootstrap): DashboardViewModel {
  return {
    bootstrap: clone(bootstrap),
    customerProfile: clone(bootstrap.customerProfile),
    featureFlags: clone(bootstrap.featureFlags),
    datasetVersions: clone(bootstrap.datasetVersions),
    currentRelease: clone(bootstrap.currentRelease),
    auditEvents: clone(bootstrap.auditEvents),
  };
}

export async function loadDashboardViewModel(adminApi: AdminApi): Promise<DashboardViewModel> {
  return toDashboardViewModel(await adminApi.getBootstrap());
}

export async function refreshAuditEvents(adminApi: AdminApi): Promise<AuditEvent[]> {
  return adminApi.getAuditEvents();
}

export async function saveCustomerProfileAction(
  adminApi: AdminApi,
  customerProfile: CustomerProfile | null
): Promise<{
  customerProfile: CustomerProfile;
  auditEvents: AuditEvent[];
  message: string;
}> {
  const nextProfile = requireValue(customerProfile, "Customer profile is unavailable.");
  const savedProfile = await adminApi.updateCustomerProfile(nextProfile);
  return {
    customerProfile: savedProfile,
    auditEvents: await refreshAuditEvents(adminApi),
    message: "Customer profile saved.",
  };
}

export async function toggleFeatureFlagAction(
  adminApi: AdminApi,
  featureFlags: FeatureFlag[],
  flag: FeatureFlag
): Promise<{
  featureFlags: FeatureFlag[];
  auditEvents: AuditEvent[];
  message: string;
}> {
  const updatedFlag = await adminApi.updateFeatureFlag(flag.key, !flag.enabled);
  return {
    featureFlags: featureFlags.map((item) => (item.key === updatedFlag.key ? updatedFlag : item)),
    auditEvents: await refreshAuditEvents(adminApi),
    message: `Updated ${updatedFlag.label}.`,
  };
}

export async function importDatasetAction(
  adminApi: AdminApi,
  datasetVersions: DatasetVersion[],
  importRequest: ImportDatasetRequest
): Promise<{
  datasetVersions: DatasetVersion[];
  auditEvents: AuditEvent[];
  message: string;
}> {
  const nextVersion = await adminApi.importDataset(importRequest);
  return {
    datasetVersions: [nextVersion, ...datasetVersions],
    auditEvents: await refreshAuditEvents(adminApi),
    message: `Imported dataset version ${nextVersion.versionId}.`,
  };
}

export async function validateDatasetAction(
  adminApi: AdminApi,
  datasetVersions: DatasetVersion[],
  versionId: string
): Promise<{
  datasetVersions: DatasetVersion[];
  auditEvents: AuditEvent[];
  message: string;
}> {
  const nextVersion = await adminApi.validateDataset(versionId);
  return {
    datasetVersions: datasetVersions.map((item) => (item.versionId === versionId ? nextVersion : item)),
    auditEvents: await refreshAuditEvents(adminApi),
    message: `Validated ${versionId}.`,
  };
}

export async function publishDatasetAction(
  adminApi: AdminApi,
  datasetVersions: DatasetVersion[],
  versionId: string
): Promise<{
  datasetVersions: DatasetVersion[];
  currentRelease: PublishedRelease;
  auditEvents: AuditEvent[];
  message: string;
}> {
  const release = await adminApi.publishDataset(versionId);
  return {
    datasetVersions: datasetVersions.map((item) =>
      item.versionId === versionId ? { ...item, status: "published" } : item
    ),
    currentRelease: release,
    auditEvents: await refreshAuditEvents(adminApi),
    message: `Published release ${release.releaseId}.`,
  };
}

export async function rollbackReleaseAction(
  adminApi: AdminApi,
  currentRelease: PublishedRelease | null
): Promise<{
  currentRelease: PublishedRelease;
  auditEvents: AuditEvent[];
  message: string;
}> {
  const activeRelease = requireValue(currentRelease, "Current release is unavailable.");
  const release = await adminApi.rollbackRelease(activeRelease.releaseId);
  return {
    currentRelease: release,
    auditEvents: await refreshAuditEvents(adminApi),
    message: `Rolled back from ${activeRelease.releaseId}.`,
  };
}

export function getErrorMessage(error: unknown, fallback = "The request could not be completed."): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }

  return fallback;
}
