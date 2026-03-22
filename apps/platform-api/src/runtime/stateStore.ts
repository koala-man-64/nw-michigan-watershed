import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import path from "node:path";
import type {
  AuditEvent,
  CustomerManifest,
  CustomerProfile,
  DatasetManifest,
  DatasetVersionRecord,
  FeatureFlags,
  PortalBootstrap,
  PublishedRelease,
} from "@nwmiws/contracts";
import { getPlatformRuntimeConfig, type PlatformRuntimeConfig } from "../config";
import {
  createEmptyCustomerManifest,
  createEmptyCustomerProfile,
  createEmptyDatasetManifest,
  createEmptyFeatureFlags,
  createEmptyPublishedRelease,
} from "./contractDefaults";

export type PlatformStateUnavailableReason = "empty" | "malformed";

export class PlatformStateUnavailableError extends Error {
  readonly stateFilePath: string;
  readonly reason: PlatformStateUnavailableReason;
  readonly cause?: unknown;

  constructor(
    stateFilePath: string,
    reason: PlatformStateUnavailableReason,
    message: string,
    cause?: unknown
  ) {
    super(message);
    this.name = "PlatformStateUnavailableError";
    this.stateFilePath = stateFilePath;
    this.reason = reason;
    this.cause = cause;
  }
}

export function isPlatformStateUnavailableError(error: unknown): error is PlatformStateUnavailableError {
  return error instanceof PlatformStateUnavailableError;
}

export interface PlatformState {
  customerManifest: CustomerManifest;
  customerProfile: CustomerProfile;
  datasetManifest: DatasetManifest;
  datasetVersions: DatasetVersionRecord[];
  publishedReleases: PublishedRelease[];
  auditEvents: AuditEvent[];
  activeReleaseId: string;
}

interface StateEnvelope {
  version: 1;
  state: PlatformState;
}

const DEFAULT_CUSTOMER_ID = "nwmiws";
const DEFAULT_CUSTOMER_SLUG = "nwmiws";
const DEFAULT_RELEASE_ID = "release-seed-current";
const DEFAULT_DATASET_MANIFEST_ID = "dataset-manifest-seed-current";
const DEFAULT_DATASET_VERSION_ID = "dataset-version-seed-current";

let pendingWrite: Promise<void> = Promise.resolve();

function utcNow(now = new Date()): string {
  return now.toISOString();
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function sha256(input: string): string {
  return `sha256:${createHash("sha256").update(input, "utf8").digest("hex")}`;
}

function createSeedFeatureFlags(): FeatureFlags {
  return createEmptyFeatureFlags();
}

function createSeedState(now = new Date()): PlatformState {
  const supportContact = {
    name: "John Ransom",
    organization: "Benzie County Conservation District",
    phoneDisplay: "231-882-4391",
    phoneHref: "tel:+12318824391",
    email: "john@benziecd.org",
  };

  const customerManifest = createEmptyCustomerManifest();
  customerManifest.customerId = DEFAULT_CUSTOMER_ID;
  customerManifest.slug = DEFAULT_CUSTOMER_SLUG;
  customerManifest.displayName = "NW Michigan Water Quality Database";
  customerManifest.description = "Public water quality portal for Northwest Michigan watershed data.";
  customerManifest.authMode = "anonymous";
  customerManifest.branding = {
    title: "NW Michigan Water Quality Database",
    subtitle: "Read-only water quality atlas and release portal",
    colorPrimary: "#0f766e",
    colorSecondary: "#134e4a",
  };
  customerManifest.supportContact = supportContact;
  customerManifest.legalLinks = [
    { label: "Data provenance", href: "/api/exports/release-seed-current/manifest.json" },
  ];
  customerManifest.featureFlags = createSeedFeatureFlags();
  customerManifest.mapProvider = {
    provider: "azure-maps",
    tokenRoute: "/api/maps/token",
    tilesetId: "microsoft.base.road",
    allowedOrigins: ["http://localhost:3000", "http://localhost:4173", "http://localhost:4280"],
  };
  customerManifest.defaultDatasetManifestId = DEFAULT_DATASET_MANIFEST_ID;
  customerManifest.defaultReleaseId = DEFAULT_RELEASE_ID;

  const customerProfile = createEmptyCustomerProfile();
  customerProfile.customerId = DEFAULT_CUSTOMER_ID;
  customerProfile.displayName = "NW Michigan Water Quality Database";
  customerProfile.organization = "Benzie County Conservation District";
  customerProfile.supportContact = supportContact;
  customerProfile.website = "https://www.benziecd.org";
  customerProfile.supportHours = "Mon-Fri 8:00 AM to 4:30 PM";
  customerProfile.updatedAtUtc = utcNow(now);

  const sourceFiles = ["info.csv", "locations.csv", "NWMIWS_Site_Data_testing_varied.csv"];
  const datasetManifest = createEmptyDatasetManifest();
  datasetManifest.datasetManifestId = DEFAULT_DATASET_MANIFEST_ID;
  datasetManifest.datasetId = "nwmiws-water-quality";
  datasetManifest.version = "2026.03.22";
  datasetManifest.schemaVersion = "1.0.0";
  datasetManifest.owner = "Benzie County Conservation District";
  datasetManifest.allowedUse = "Internal and public read-only portal distribution.";
  datasetManifest.checksum = sha256(sourceFiles.join("|"));
  datasetManifest.provenance = {
    sourceSystem: "portal-web-public-data",
    sourceFiles,
    notes: "Seeded from the current portal CSV assets.",
  };
  datasetManifest.sourceFiles = sourceFiles;
  datasetManifest.publishable = true;

  const importedAtUtc = utcNow(now);
  const datasetVersions: DatasetVersionRecord[] = [
    {
      versionId: DEFAULT_DATASET_VERSION_ID,
      datasetManifestId: DEFAULT_DATASET_MANIFEST_ID,
      datasetVersion: datasetManifest.version,
      checksum: datasetManifest.checksum,
      sourceFiles,
      status: "published",
      importedAtUtc,
      validatedAtUtc: importedAtUtc,
      publishedAtUtc: importedAtUtc,
      notes: "Seed dataset imported from the current portal CSV source files.",
    },
  ];

  const publishedReleases: PublishedRelease[] = [
    {
      releaseId: DEFAULT_RELEASE_ID,
      customerId: DEFAULT_CUSTOMER_ID,
      datasetManifestId: DEFAULT_DATASET_MANIFEST_ID,
      datasetVersionId: DEFAULT_DATASET_VERSION_ID,
      status: "active",
      publishedAtUtc: importedAtUtc,
      rollbackTargetReleaseId: null,
      portalVisibleMetadata: {
        title: "Current published dataset",
        summary: "Seed release reflecting the current portal CSV contents.",
        notes: "Acts as the initial active portal release.",
      },
    },
  ];

  const auditEvents: AuditEvent[] = [
    {
      auditEventId: randomUUID(),
      eventType: "state.seeded",
      actor: "system",
      customerId: DEFAULT_CUSTOMER_ID,
      releaseId: DEFAULT_RELEASE_ID,
      createdAtUtc: importedAtUtc,
      details: {
        datasetManifestId: DEFAULT_DATASET_MANIFEST_ID,
        datasetVersionId: DEFAULT_DATASET_VERSION_ID,
      },
    },
  ];

  return {
    customerManifest,
    customerProfile,
    datasetManifest,
    datasetVersions,
    publishedReleases,
    auditEvents,
    activeReleaseId: DEFAULT_RELEASE_ID,
  };
}

function normalizeState(state: Partial<PlatformState> | undefined, now = new Date()): PlatformState {
  const seed = createSeedState(now);
  const value = state ?? {};

  return {
    customerManifest: {
      ...seed.customerManifest,
      ...(value.customerManifest ?? {}),
      featureFlags: {
        ...seed.customerManifest.featureFlags,
        ...((value.customerManifest?.featureFlags as FeatureFlags | undefined) ?? {}),
      },
      supportContact: {
        ...seed.customerManifest.supportContact,
        ...(value.customerManifest?.supportContact ?? {}),
      },
      branding: {
        ...seed.customerManifest.branding,
        ...(value.customerManifest?.branding ?? {}),
      },
      legalLinks: value.customerManifest?.legalLinks ?? seed.customerManifest.legalLinks,
      mapProvider: {
        ...seed.customerManifest.mapProvider,
        ...(value.customerManifest?.mapProvider ?? {}),
      },
    },
    customerProfile: {
      ...seed.customerProfile,
      ...(value.customerProfile ?? {}),
      supportContact: {
        ...seed.customerProfile.supportContact,
        ...(value.customerProfile?.supportContact ?? {}),
      },
    },
    datasetManifest: {
      ...seed.datasetManifest,
      ...(value.datasetManifest ?? {}),
      provenance: {
        ...seed.datasetManifest.provenance,
        ...(value.datasetManifest?.provenance ?? {}),
        sourceFiles: value.datasetManifest?.provenance?.sourceFiles ?? seed.datasetManifest.provenance.sourceFiles,
      },
      sourceFiles: value.datasetManifest?.sourceFiles ?? seed.datasetManifest.sourceFiles,
    },
    datasetVersions: Array.isArray(value.datasetVersions) && value.datasetVersions.length
      ? value.datasetVersions
      : seed.datasetVersions,
    publishedReleases: Array.isArray(value.publishedReleases) && value.publishedReleases.length
      ? value.publishedReleases
      : seed.publishedReleases,
    auditEvents: Array.isArray(value.auditEvents) && value.auditEvents.length
      ? value.auditEvents
      : seed.auditEvents,
    activeReleaseId: String(value.activeReleaseId || "").trim() || seed.activeReleaseId,
  };
}

function readStateFile(stateFilePath: string, now = new Date()): PlatformState {
  if (!existsSync(stateFilePath)) {
    const seed = createSeedState(now);
    writeStateFile(stateFilePath, seed);
    return seed;
  }

  const raw = readFileSync(stateFilePath, "utf8");
  if (!raw.trim()) {
    throw new PlatformStateUnavailableError(
      stateFilePath,
      "empty",
      "Platform state file is empty."
    );
  }

  try {
    const envelope = JSON.parse(raw) as Partial<StateEnvelope> & { state?: Partial<PlatformState> };
    return normalizeState(envelope.state ?? (envelope as unknown as Partial<PlatformState>), now);
  } catch (error) {
    throw new PlatformStateUnavailableError(
      stateFilePath,
      "malformed",
      "Platform state file is malformed.",
      error
    );
  }
}

function writeStateFile(stateFilePath: string, state: PlatformState): void {
  const directory = path.dirname(stateFilePath);
  mkdirSync(directory, { recursive: true });

  const tmpPath = `${stateFilePath}.tmp-${randomUUID()}`;
  const envelope: StateEnvelope = {
    version: 1,
    state: clone(state),
  };

  writeFileSync(tmpPath, `${JSON.stringify(envelope, null, 2)}\n`, "utf8");
  renameSync(tmpPath, stateFilePath);
}

export function getPlatformStatePath(runtimeConfig: PlatformRuntimeConfig = getPlatformRuntimeConfig()): string {
  return runtimeConfig.stateFilePath;
}

export function loadState(
  runtimeConfig: PlatformRuntimeConfig = getPlatformRuntimeConfig(),
  now = new Date()
): PlatformState {
  return readStateFile(getPlatformStatePath(runtimeConfig), now);
}

export async function updateState(
  updater: (state: PlatformState) => PlatformState | Promise<PlatformState>,
  runtimeConfig: PlatformRuntimeConfig = getPlatformRuntimeConfig()
): Promise<PlatformState> {
  const stateFilePath = getPlatformStatePath(runtimeConfig);

  pendingWrite = pendingWrite
    .catch(() => undefined)
    .then(async () => {
    const currentState = readStateFile(stateFilePath);
    const nextState = normalizeState(await updater(clone(currentState)));
    writeStateFile(stateFilePath, nextState);
    });

  await pendingWrite;
  return readStateFile(stateFilePath);
}

export function getActiveRelease(state: PlatformState): PublishedRelease {
  const activeRelease = state.publishedReleases.find((release) => release.releaseId === state.activeReleaseId);
  if (activeRelease) {
    return activeRelease;
  }

  const fallback = state.publishedReleases.find((release) => release.status === "active");
  if (fallback) {
    return fallback;
  }

  return createEmptyPublishedRelease();
}

export function createBootstrap(state: PlatformState): PortalBootstrap {
  return {
    customerManifest: clone(state.customerManifest),
    customerProfile: clone(state.customerProfile),
    datasetManifest: clone(state.datasetManifest),
    featureFlags: clone(state.customerManifest.featureFlags),
    publishedRelease: clone(getActiveRelease(state)),
    mapProvider: clone(state.customerManifest.mapProvider),
  };
}

export function createAuditEvent(input: {
  eventType: string;
  actor: string;
  customerId: string;
  details?: Record<string, unknown>;
  datasetVersionId?: string;
  releaseId?: string;
  correlationId?: string;
  now?: Date;
}): AuditEvent {
  const now = input.now ?? new Date();
  return {
    auditEventId: randomUUID(),
    eventType: input.eventType,
    actor: input.actor,
    customerId: input.customerId,
    datasetVersionId: input.datasetVersionId,
    releaseId: input.releaseId,
    correlationId: input.correlationId,
    createdAtUtc: utcNow(now),
    details: input.details ?? {},
  };
}

export function createVersionChecksum(parts: string[]): string {
  return sha256(parts.join("|"));
}
