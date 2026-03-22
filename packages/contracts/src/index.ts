export type AuthMode = "anonymous" | "entra";

export interface ContactPoint {
  name: string;
  organization: string;
  phoneDisplay: string;
  phoneHref: string;
  email: string;
}

export interface LegalLink {
  label: string;
  href: string;
}

export interface Branding {
  title: string;
  subtitle?: string;
  logoUrl?: string;
  colorPrimary?: string;
  colorSecondary?: string;
}

export interface MapProviderConfig {
  provider: "azure-maps";
  tokenRoute: string;
  tilesetId: string;
  allowedOrigins: string[];
}

export interface MapViewportDefaults {
  center: [number, number];
  zoom: number;
  minZoom: number;
  maxZoom: number;
}

export interface FeatureFlags {
  compareMode: boolean;
  exports: boolean;
  mapLayers: boolean;
  privatePortalMode: boolean;
  adminMode: boolean;
  datasetPublishing: boolean;
}

export interface CustomerProfile {
  customerId: string;
  displayName: string;
  organization: string;
  supportContact: ContactPoint;
  website?: string;
  supportHours?: string;
  updatedAtUtc: string;
}

export interface CustomerManifest {
  customerId: string;
  slug: string;
  displayName: string;
  description: string;
  authMode: AuthMode;
  branding: Branding;
  supportContact: ContactPoint;
  legalLinks: LegalLink[];
  featureFlags: FeatureFlags;
  mapProvider: MapProviderConfig;
  mapDefaults: MapViewportDefaults;
  defaultDatasetManifestId: string;
  defaultReleaseId: string;
}

export interface DatasetProvenance {
  sourceSystem: string;
  sourceFiles: string[];
  notes?: string;
}

export interface DatasetManifest {
  datasetManifestId: string;
  datasetId: string;
  version: string;
  schemaVersion: string;
  owner: string;
  allowedUse: string;
  checksum: string;
  provenance: DatasetProvenance;
  sourceFiles: string[];
  publishable: boolean;
}

export interface DatasetVersionRecord {
  versionId: string;
  datasetManifestId: string;
  datasetVersion: string;
  checksum: string;
  sourceFiles: string[];
  status: "imported" | "validated" | "published" | "rolled-back";
  importedAtUtc: string;
  validatedAtUtc?: string;
  publishedAtUtc?: string;
  notes?: string;
}

export interface ReleaseMetadata {
  title: string;
  summary: string;
  notes?: string;
}

export interface PublishedRelease {
  releaseId: string;
  customerId: string;
  datasetManifestId: string;
  datasetVersionId: string;
  status: "active" | "superseded" | "rolled-back";
  publishedAtUtc: string;
  rollbackTargetReleaseId?: string | null;
  portalVisibleMetadata: ReleaseMetadata;
}

export interface SiteRecord {
  name: string;
  latitude: number;
  longitude: number;
  surfaceAreaAcres: number | null;
  maxDepthFt: number | null;
  avgDepthFt: number | null;
  description: string;
}

export interface ParameterRecord {
  parameter: string;
  contactInfo: string;
  associationInfo: string;
  parameterInfo: string;
}

export interface MeasurementRecord {
  site: string;
  siteType: string;
  year: number;
  parameter: string;
  max: number;
  min: number;
  avg: number;
  count: number;
}

export interface AuditEvent {
  auditEventId: string;
  eventType: string;
  actor: string;
  customerId: string;
  datasetVersionId?: string;
  releaseId?: string;
  correlationId?: string;
  createdAtUtc: string;
  details: Record<string, unknown>;
}

export interface PortalBootstrap {
  customerManifest: CustomerManifest;
  customerProfile: CustomerProfile;
  datasetManifest: DatasetManifest;
  featureFlags: FeatureFlags;
  publishedRelease: PublishedRelease;
  mapProvider: MapProviderConfig;
}

export interface AdminBootstrap {
  customerManifest: CustomerManifest;
  customerProfile: CustomerProfile;
  datasetManifest: DatasetManifest;
  datasetVersions: DatasetVersionRecord[];
  publishedRelease: PublishedRelease;
  auditEvents: AuditEvent[];
  config: {
    apiBaseUrl: string;
    authMode: AuthMode | "mock";
    tenantId?: string;
    clientId?: string;
  };
}

export interface DatasetImportRequest {
  datasetId: string;
  sourceFiles: string[];
  notes: string;
}

export interface PlatformState {
  activeReleaseId: string;
  datasetVersions: DatasetVersionRecord[];
  publishedReleases: PublishedRelease[];
  auditEvents: AuditEvent[];
}

export type ReleaseArtifactName =
  | "bootstrap.json"
  | "customer-profile.json"
  | "manifest.json"
  | "measurements.csv"
  | "parameters.csv"
  | "sites.csv";

export function createEmptyFeatureFlags(): FeatureFlags {
  return {
    compareMode: true,
    exports: true,
    mapLayers: true,
    privatePortalMode: false,
    adminMode: true,
    datasetPublishing: true,
  };
}

export function createEmptyContactPoint(): ContactPoint {
  return {
    name: "",
    organization: "",
    phoneDisplay: "",
    phoneHref: "",
    email: "",
  };
}

export function createEmptyCustomerManifest(): CustomerManifest {
  const supportContact = createEmptyContactPoint();
  return {
    customerId: "",
    slug: "",
    displayName: "",
    description: "",
    authMode: "anonymous",
    branding: {
      title: "",
    },
    supportContact,
    legalLinks: [],
    featureFlags: createEmptyFeatureFlags(),
    mapProvider: {
      provider: "azure-maps",
      tokenRoute: "/api/maps/token",
      tilesetId: "",
      allowedOrigins: [],
    },
    mapDefaults: {
      center: [44.75, -85.85],
      zoom: 8,
      minZoom: 7,
      maxZoom: 16,
    },
    defaultDatasetManifestId: "",
    defaultReleaseId: "",
  };
}

export function createEmptyCustomerProfile(): CustomerProfile {
  return {
    customerId: "",
    displayName: "",
    organization: "",
    supportContact: createEmptyContactPoint(),
    updatedAtUtc: new Date(0).toISOString(),
  };
}

export function createEmptyDatasetManifest(): DatasetManifest {
  return {
    datasetManifestId: "",
    datasetId: "",
    version: "",
    schemaVersion: "1.0.0",
    owner: "",
    allowedUse: "",
    checksum: "",
    provenance: {
      sourceSystem: "",
      sourceFiles: [],
    },
    sourceFiles: [],
    publishable: false,
  };
}

export function createEmptyPublishedRelease(): PublishedRelease {
  return {
    releaseId: "",
    customerId: "",
    datasetManifestId: "",
    datasetVersionId: "",
    status: "active",
    publishedAtUtc: new Date(0).toISOString(),
    rollbackTargetReleaseId: null,
    portalVisibleMetadata: {
      title: "",
      summary: "",
    },
  };
}

export function createEmptyPlatformState(): PlatformState {
  return {
    activeReleaseId: "",
    datasetVersions: [],
    publishedReleases: [],
    auditEvents: [],
  };
}
