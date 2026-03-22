export type AuthStatus = "anonymous" | "authenticated";

export type AuthUser = {
  name: string;
  email: string;
  role: "admin";
  tenantName?: string;
};

export type CustomerProfile = {
  customerId: string;
  customerName: string;
  organizationName: string;
  supportContactName: string;
  supportEmail: string;
  supportPhone: string;
  legalLink: string;
  defaultPublishedDatasetId: string;
};

export type FeatureFlag = {
  key: string;
  label: string;
  description: string;
  enabled: boolean;
};

export type DatasetVersion = {
  versionId: string;
  datasetId: string;
  status: "draft" | "validated" | "published" | "rolled_back";
  sourceFiles: string[];
  notes: string;
  uploadedAt: string;
};

export type PublishedRelease = {
  releaseId: string;
  datasetVersionId: string;
  publishedAt: string;
  rollbackTargetReleaseId?: string;
  summary: string;
};

export type AuditEvent = {
  eventId: string;
  timestamp: string;
  actor: string;
  action: string;
  resource: string;
  details: string;
};

export type AdminBootstrap = {
  customerProfile: CustomerProfile;
  featureFlags: FeatureFlag[];
  datasetVersions: DatasetVersion[];
  currentRelease: PublishedRelease;
  auditEvents: AuditEvent[];
  config: {
    apiBaseUrl: string;
    authMode: "entra" | "mock";
    tenantId?: string;
    clientId?: string;
  };
};

export type ImportDatasetRequest = {
  datasetId: string;
  sourceFiles: string;
  notes: string;
};
