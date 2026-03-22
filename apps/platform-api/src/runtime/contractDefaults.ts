import type {
  ContactPoint,
  CustomerManifest,
  CustomerProfile,
  DatasetManifest,
  FeatureFlags,
  PublishedRelease,
} from "@nwmiws/contracts";

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

function createEmptyContactPoint(): ContactPoint {
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
