import type { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import type {
  AdminBootstrap,
  AuditEvent,
  ContactPoint,
  CustomerProfile,
  DatasetManifest,
  DatasetVersionRecord,
  FeatureFlags,
  MeasurementRecord,
  ParameterRecord,
  PortalBootstrap,
  PublishedRelease,
  ReleaseArtifactName,
  SiteRecord,
} from "@nwmiws/contracts";
import {
  getAzureMapsConfig as readAzureMapsConfig,
  getPlatformRuntimeConfig,
  type PlatformRuntimeConfig,
} from "../config";
import { extractRequestOrigin, isOriginAllowed } from "../origin";
import { createMapsSasToken } from "../mapsTokenService";
import { authorizeAdminRequest, type AuthorizedAdminRequest } from "./adminAccess";
import { jsonResponse, stateUnavailableResponse, textResponse } from "./response";
import {
  createAuditEvent,
  createBootstrap,
  createVersionChecksum,
  getActiveRelease,
  isPlatformStateUnavailableError,
  loadState,
  updateState,
  type PlatformState,
} from "./stateStore";
import {
  exportArtifactAsCsv,
  loadMeasurements,
  loadParameters,
  loadSites,
  type MeasurementFilter,
} from "./csvStore";

interface RuntimeDependencies {
  runtimeConfig?: PlatformRuntimeConfig;
  getAzureMapsConfig?: typeof readAzureMapsConfig;
  issueMapsToken?: typeof createMapsSasToken;
}

interface RequestLike extends Partial<HttpRequest> {
  json?: () => Promise<unknown>;
}

type RequestBody = Record<string, unknown> | null;

function getRuntimeConfig(dependencies: RuntimeDependencies = {}): PlatformRuntimeConfig {
  if (!dependencies.runtimeConfig) {
    return getPlatformRuntimeConfig();
  }

  return dependencies.runtimeConfig;
}

function getHeader(request: RequestLike, name: string): string | undefined {
  const headers = request.headers as unknown;
  if (!headers || !name) {
    return undefined;
  }

  const headerContainer = headers as Record<string, string | undefined>;
  if (typeof Headers !== "undefined" && headers instanceof Headers) {
    const headerValue = headers.get(name) ?? headers.get(name.toLowerCase()) ?? undefined;
    return typeof headerValue === "string" ? headerValue : undefined;
  }

  const headerGetter = (headers as { get?: (key: string) => string | undefined }).get;
  if (typeof headerGetter === "function") {
    const headerValue =
      headerGetter.call(headers as never, name) ??
      headerGetter.call(headers as never, name.toLowerCase()) ??
      undefined;
    return typeof headerValue === "string" ? headerValue : undefined;
  }

  const targetName = String(name).toLowerCase();
  const entry = Object.entries(headerContainer).find(([headerName]) => String(headerName).toLowerCase() === targetName);
  return entry ? entry[1] : undefined;
}

function getCorrelationId(request: RequestLike): string | undefined {
  return getHeader(request, "x-correlation-id") || getHeader(request, "x-ms-client-request-id");
}

function getRequestUrl(request: RequestLike): URL | null {
  if (!request.url) {
    return null;
  }

  try {
    return new URL(request.url);
  } catch {
    return null;
  }
}

function getQueryValue(request: RequestLike, name: string): string | undefined {
  const query = request.query as Record<string, string | undefined> | undefined;
  const directValue = query?.[name];
  if (directValue !== undefined && directValue !== "") {
    return directValue;
  }

  const url = getRequestUrl(request);
  return url?.searchParams.get(name) || undefined;
}

async function readJsonBody(request: RequestLike): Promise<RequestBody> {
  if (typeof request.json !== "function") {
    return null;
  }

  try {
    const value = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }

    return value as RequestBody;
  } catch {
    return null;
  }
}

function jsonListResponse<T>(items: T[]): HttpResponseInit {
  return jsonResponse(200, {
    items,
    count: items.length,
  });
}

function csvAttachmentResponse(filename: string, body: string): HttpResponseInit {
  return textResponse(200, body, "text/csv; charset=utf-8", {
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "no-store, private",
  });
}

function resolveMapProvider(state: PlatformState, mapsConfig = readAzureMapsConfig()) {
  return {
    ...state.customerManifest.mapProvider,
    allowedOrigins: mapsConfig.allowedOrigins.length
      ? mapsConfig.allowedOrigins
      : state.customerManifest.mapProvider.allowedOrigins,
  };
}

function buildBootstrap(state: PlatformState, mapsConfig = readAzureMapsConfig()): PortalBootstrap {
  return {
    ...createBootstrap(state),
    mapProvider: resolveMapProvider(state, mapsConfig),
  };
}

function buildManifest(state: PlatformState, mapsConfig = readAzureMapsConfig()) {
  return {
    customerManifest: {
      ...state.customerManifest,
      mapProvider: resolveMapProvider(state, mapsConfig),
    },
    datasetManifest: state.datasetManifest,
    publishedRelease: getActiveRelease(state),
    featureFlags: state.customerManifest.featureFlags,
  };
}

function buildAdminBootstrap(
  state: PlatformState,
  runtimeConfig: PlatformRuntimeConfig,
  mapsConfig = readAzureMapsConfig()
): AdminBootstrap {
  return {
    customerManifest: {
      ...state.customerManifest,
      mapProvider: resolveMapProvider(state, mapsConfig),
    },
    customerProfile: state.customerProfile,
    datasetManifest: state.datasetManifest,
    datasetVersions: state.datasetVersions,
    publishedRelease: getActiveRelease(state),
    auditEvents: state.auditEvents.slice().reverse().slice(0, 50),
    config: {
      apiBaseUrl: "/api",
      authMode: runtimeConfig.adminAuthMode === "mock" ? "mock" : "entra",
      tenantId: process.env.AZURE_TENANT_ID || undefined,
      clientId: process.env.AZURE_CLIENT_ID || undefined,
    },
  };
}

function toContactPoint(value: unknown, fallback: ContactPoint): ContactPoint {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fallback;
  }

  const contact = value as Partial<ContactPoint>;
  return {
    name: String(contact.name ?? fallback.name).trim() || fallback.name,
    organization: String(contact.organization ?? fallback.organization).trim() || fallback.organization,
    phoneDisplay: String(contact.phoneDisplay ?? fallback.phoneDisplay).trim() || fallback.phoneDisplay,
    phoneHref: String(contact.phoneHref ?? fallback.phoneHref).trim() || fallback.phoneHref,
    email: String(contact.email ?? fallback.email).trim() || fallback.email,
  };
}

function sanitizeString(value: unknown, fallback = ""): string {
  const sanitized = String(value ?? "").trim();
  return sanitized || fallback;
}

function readReleaseMetadata(body: RequestBody, fallbackTitle: string, fallbackSummary: string) {
  const metadata = body?.portalVisibleMetadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {
      title: fallbackTitle,
      summary: fallbackSummary,
      notes: undefined as string | undefined,
    };
  }

  return {
    title: sanitizeString((metadata as Record<string, unknown>).title, fallbackTitle),
    summary: sanitizeString((metadata as Record<string, unknown>).summary, fallbackSummary),
    notes: sanitizeString((metadata as Record<string, unknown>).notes || undefined) || undefined,
  };
}

function assertDatasetVersionExists(state: PlatformState, versionId: string): DatasetVersionRecord | null {
  return state.datasetVersions.find((version) => version.versionId === versionId) ?? null;
}

function toStateUnavailableHealthResponse(): HttpResponseInit {
  return jsonResponse(503, {
    status: "state_unavailable",
    service: "platform-api",
    error: "Platform state is unavailable.",
  });
}

function logStateUnavailable(
  error: unknown,
  context?: InvocationContext,
  operation = "runtime state access"
): HttpResponseInit | undefined {
  if (!isPlatformStateUnavailableError(error)) {
    return undefined;
  }

  context?.error?.(`Platform state unavailable during ${operation}.`, {
    stateFilePath: error.stateFilePath,
    reason: error.reason,
    cause: error.cause instanceof Error ? error.cause.message : error.cause,
  });

  return stateUnavailableResponse();
}

async function withStateHandling(
  operation: string,
  context: InvocationContext | undefined,
  action: () => Promise<HttpResponseInit> | HttpResponseInit,
  options: { health?: boolean } = {}
): Promise<HttpResponseInit> {
  try {
    return await action();
  } catch (error) {
    const response = logStateUnavailable(error, context, operation);
    if (response) {
      return options.health ? toStateUnavailableHealthResponse() : response;
    }

    throw error;
  }
}

function authorizeAdmin(
  request: RequestLike | undefined,
  runtimeConfig: PlatformRuntimeConfig
): AuthorizedAdminRequest | HttpResponseInit {
  const authorization = authorizeAdminRequest(request ?? {}, runtimeConfig);
  if (!authorization.authorized) {
    return authorization.response;
  }

  return authorization.access;
}

export function createHealthHandler(dependencies: RuntimeDependencies = {}) {
  return async function healthHandler(
    _request?: RequestLike,
    context?: InvocationContext
  ): Promise<HttpResponseInit> {
    return withStateHandling(
      "health check",
      context,
      () => {
        const state = loadState(getRuntimeConfig(dependencies));
        return jsonResponse(200, {
          status: "ok",
          service: "platform-api",
          customerId: state.customerManifest.customerId,
          activeReleaseId: state.activeReleaseId,
          publishedReleases: state.publishedReleases.length,
          datasetVersions: state.datasetVersions.length,
          auditEvents: state.auditEvents.length,
        });
      },
      { health: true }
    );
  };
}

export function createPortalBootstrapHandler(dependencies: RuntimeDependencies = {}) {
  return async function portalBootstrapHandler(
    _request?: RequestLike,
    context?: InvocationContext
  ): Promise<HttpResponseInit> {
    const runtimeConfig = getRuntimeConfig(dependencies);
    return withStateHandling("portal bootstrap", context, () => {
      const state = loadState(runtimeConfig);
      return jsonResponse(
        200,
        buildBootstrap(state, (dependencies.getAzureMapsConfig ?? readAzureMapsConfig)())
      );
    });
  };
}

export function createAdminBootstrapHandler(dependencies: RuntimeDependencies = {}) {
  return async function adminBootstrapHandler(
    request: RequestLike = {},
    context?: InvocationContext
  ): Promise<HttpResponseInit> {
  const runtimeConfig = getRuntimeConfig(dependencies);
  const access = authorizeAdmin(request, runtimeConfig);
    if (!("actor" in access)) {
      return access;
    }

    return withStateHandling("admin bootstrap", context, () => {
      const state = loadState(runtimeConfig);
      return jsonResponse(
        200,
        buildAdminBootstrap(state, runtimeConfig, (dependencies.getAzureMapsConfig ?? readAzureMapsConfig)())
      );
    });
  };
}

export function createSitesHandler(dependencies: RuntimeDependencies = {}) {
  return async function sitesHandler(): Promise<HttpResponseInit> {
    const runtimeConfig = getRuntimeConfig(dependencies);
    const items = loadSites(runtimeConfig);
    return jsonListResponse<SiteRecord>(items);
  };
}

export function createParametersHandler(dependencies: RuntimeDependencies = {}) {
  return async function parametersHandler(): Promise<HttpResponseInit> {
    const runtimeConfig = getRuntimeConfig(dependencies);
    const items = loadParameters(runtimeConfig);
    return jsonListResponse<ParameterRecord>(items);
  };
}

function parseMeasurementFilter(request: RequestLike): MeasurementFilter {
  const year = getQueryValue(request, "year");
  const parsedYear = year ? Number.parseInt(year, 10) : undefined;
  return {
    site: getQueryValue(request, "site"),
    siteType: getQueryValue(request, "siteType"),
    parameter: getQueryValue(request, "parameter"),
    year: parsedYear !== undefined && Number.isFinite(parsedYear) ? parsedYear : undefined,
  };
}

export function createMeasurementsHandler(dependencies: RuntimeDependencies = {}) {
  return async function measurementsHandler(request: RequestLike): Promise<HttpResponseInit> {
    const runtimeConfig = getRuntimeConfig(dependencies);
    const filter = parseMeasurementFilter(request);
    const items = loadMeasurements(runtimeConfig, filter);
    return jsonResponse(200, {
      items,
      count: items.length,
      appliedFilters: filter,
    });
  };
}

export function createExportsHandler(dependencies: RuntimeDependencies = {}) {
  return async function exportsHandler(request: RequestLike): Promise<HttpResponseInit> {
    const runtimeConfig = getRuntimeConfig(dependencies);
    const state = loadState(runtimeConfig);
    const releaseId = String(request.params?.releaseId ?? "").trim();
    const artifact = String(request.params?.artifact ?? "").trim() as ReleaseArtifactName;

    const release = state.publishedReleases.find((item) => item.releaseId === releaseId);
    if (!release) {
      return jsonResponse(404, { error: "Release not found." });
    }

    if (artifact === "bootstrap.json") {
      return jsonResponse(200, buildBootstrap(state));
    }

    if (artifact === "customer-profile.json") {
      return jsonResponse(200, state.customerProfile);
    }

    if (artifact === "manifest.json") {
      return jsonResponse(200, buildManifest(state));
    }

    if (artifact === "sites.csv") {
      return csvAttachmentResponse(`${releaseId}-sites.csv`, exportArtifactAsCsv(runtimeConfig, artifact));
    }

    if (artifact === "parameters.csv") {
      return csvAttachmentResponse(`${releaseId}-parameters.csv`, exportArtifactAsCsv(runtimeConfig, artifact));
    }

    if (artifact === "measurements.csv") {
      return csvAttachmentResponse(`${releaseId}-measurements.csv`, exportArtifactAsCsv(runtimeConfig, artifact));
    }

    return jsonResponse(400, { error: "Unsupported export artifact." });
  };
}

export function createCustomerProfileGetHandler(dependencies: RuntimeDependencies = {}) {
  return async function customerProfileGetHandler(
    request: RequestLike = {},
    context?: InvocationContext
  ): Promise<HttpResponseInit> {
    const runtimeConfig = getRuntimeConfig(dependencies);
    const access = authorizeAdmin(request, runtimeConfig);
    if (!("actor" in access)) {
      return access;
    }

    return withStateHandling("admin customer profile read", context, () => {
      const state = loadState(runtimeConfig);
      return jsonResponse(200, { customerProfile: state.customerProfile });
    });
  };
}

export function createCustomerProfilePutHandler(dependencies: RuntimeDependencies = {}) {
  return async function customerProfilePutHandler(
    request: RequestLike,
    context?: InvocationContext
  ): Promise<HttpResponseInit> {
    const runtimeConfig = getRuntimeConfig(dependencies);
    const access = authorizeAdmin(request, runtimeConfig);
    if (!("actor" in access)) {
      return access;
    }

    const body = await readJsonBody(request);

    if (!body) {
      return jsonResponse(400, { error: "A JSON request body is required." });
    }

    return withStateHandling("admin customer profile update", context, async () => {
      const updatedState = await updateState((state) => {
        const nextCustomerProfile: CustomerProfile = {
          ...state.customerProfile,
          customerId: state.customerManifest.customerId,
          displayName: sanitizeString(body.displayName, state.customerProfile.displayName),
          organization: sanitizeString(body.organization, state.customerProfile.organization),
          supportContact: toContactPoint(body.supportContact, state.customerProfile.supportContact),
          website: body.website === undefined ? state.customerProfile.website : sanitizeString(body.website),
          supportHours:
            body.supportHours === undefined ? state.customerProfile.supportHours : sanitizeString(body.supportHours),
          updatedAtUtc: new Date().toISOString(),
        };

        const nextState = {
          ...state,
          customerProfile: nextCustomerProfile,
          auditEvents: state.auditEvents.concat(
            createAuditEvent({
              eventType: "customer-profile.updated",
              actor: access.actor,
              customerId: state.customerManifest.customerId,
              correlationId: getCorrelationId(request),
              details: {
                displayName: nextCustomerProfile.displayName,
                organization: nextCustomerProfile.organization,
              },
            })
          ),
        };

        return nextState;
      }, runtimeConfig);

      context?.log?.("Updated customer profile.", {
        actor: access.actor,
        customerId: updatedState.customerProfile.customerId,
        correlationId: getCorrelationId(request),
      });

      return jsonResponse(200, { customerProfile: updatedState.customerProfile });
    });
  };
}

export function createAuditEventsHandler(dependencies: RuntimeDependencies = {}) {
  return async function auditEventsHandler(request: RequestLike): Promise<HttpResponseInit> {
    const state = loadState(getRuntimeConfig(dependencies));
    const limitValue = getQueryValue(request, "limit");
    const limit = limitValue ? Number.parseInt(limitValue, 10) : 50;
    const safeLimit = Number.isFinite(limit) && limit > 0 ? limit : 50;
    const items = state.auditEvents.slice(-safeLimit).reverse();
    return jsonResponse(200, { items, count: items.length });
  };
}

export function createFeatureFlagPutHandler(dependencies: RuntimeDependencies = {}) {
  return async function featureFlagPutHandler(request: RequestLike): Promise<HttpResponseInit> {
    const runtimeConfig = getRuntimeConfig(dependencies);
    const access = authorizeAdmin(request, runtimeConfig);
    if (!("actor" in access)) {
      return access;
    }

    const flagKey = String(request.params?.flagKey ?? "").trim() as keyof FeatureFlags;
    const body = await readJsonBody(request);

    if (!flagKey) {
      return jsonResponse(400, { error: "A flagKey route parameter is required." });
    }

    if (body == null || typeof body.enabled !== "boolean") {
      return jsonResponse(400, { error: "A boolean enabled property is required." });
    }

    return withStateHandling("admin feature flag update", undefined, async () => {
      const currentState = loadState(runtimeConfig);
      if (!(flagKey in currentState.customerManifest.featureFlags)) {
        return jsonResponse(404, { error: "Feature flag not found." });
      }

      const nextState = await updateState((state) => ({
        ...state,
        customerManifest: {
          ...state.customerManifest,
          featureFlags: {
            ...state.customerManifest.featureFlags,
            [flagKey]: body.enabled,
          },
        },
        auditEvents: state.auditEvents.concat(
          createAuditEvent({
            eventType: "feature-flag.updated",
            actor: access.actor,
            customerId: state.customerManifest.customerId,
            correlationId: getCorrelationId(request),
            details: {
              flagKey,
              enabled: body.enabled,
            },
          })
        ),
      }), runtimeConfig);

      return jsonResponse(200, {
        featureFlags: nextState.customerManifest.featureFlags,
        updatedFlag: {
          key: flagKey,
          enabled: nextState.customerManifest.featureFlags[flagKey],
        },
      });
    });
  };
}

export function createImportDatasetHandler(dependencies: RuntimeDependencies = {}) {
  return async function importDatasetHandler(request: RequestLike, context?: InvocationContext): Promise<HttpResponseInit> {
    const runtimeConfig = getRuntimeConfig(dependencies);
    const access = authorizeAdmin(request, runtimeConfig);
    if (!("actor" in access)) {
      return access;
    }

    const body = await readJsonBody(request);

    if (!body) {
      return jsonResponse(400, { error: "A JSON request body is required." });
    }

    return withStateHandling("admin dataset import", context, async () => {
      const result = await updateState((state) => {
        const datasetManifestId = sanitizeString(body.datasetManifestId, state.datasetManifest.datasetManifestId);
        const datasetVersion = sanitizeString(body.datasetVersion, state.datasetManifest.version);
        const versionId = sanitizeString(body.versionId, `dataset-version-${Date.now()}`);
        const sourceFiles = Array.isArray(body.sourceFiles)
          ? body.sourceFiles.map((item) => String(item).trim()).filter(Boolean)
          : state.datasetManifest.sourceFiles;
        const checksum = sanitizeString(body.checksum, createVersionChecksum([versionId, datasetManifestId, datasetVersion]));
        const importedAtUtc = new Date().toISOString();
        const versionRecord: DatasetVersionRecord = {
          versionId,
          datasetManifestId,
          datasetVersion,
          checksum,
          sourceFiles,
          status: "imported",
          importedAtUtc,
          notes: sanitizeString(body.notes, ""),
        };

        return {
          ...state,
          datasetVersions: state.datasetVersions.concat(versionRecord),
          auditEvents: state.auditEvents.concat(
            createAuditEvent({
              eventType: "dataset.imported",
              actor: access.actor,
              customerId: state.customerManifest.customerId,
              datasetVersionId: versionId,
              correlationId: getCorrelationId(request),
              details: {
                datasetManifestId,
                datasetVersion,
                sourceFiles,
              },
            })
          ),
        };
      }, runtimeConfig);

      context?.log?.("Imported dataset version.", {
        actor: access.actor,
        versionId: result.datasetVersions[result.datasetVersions.length - 1]?.versionId,
        correlationId: getCorrelationId(request),
      });

      return jsonResponse(201, {
        datasetVersion: result.datasetVersions[result.datasetVersions.length - 1],
      });
    });
  };
}

export function createValidateDatasetHandler(dependencies: RuntimeDependencies = {}) {
  return async function validateDatasetHandler(request: RequestLike): Promise<HttpResponseInit> {
    const runtimeConfig = getRuntimeConfig(dependencies);
    const access = authorizeAdmin(request, runtimeConfig);
    if (!("actor" in access)) {
      return access;
    }

    const versionId = String(request.params?.versionId ?? "").trim();

    if (!versionId) {
      return jsonResponse(400, { error: "A versionId route parameter is required." });
    }

    return withStateHandling("admin dataset validate", undefined, async () => {
      const preflightState = loadState(runtimeConfig);
      if (!assertDatasetVersionExists(preflightState, versionId)) {
        return jsonResponse(404, { error: "Dataset version not found." });
      }

      const state = await updateState((currentState) => {
        const version = assertDatasetVersionExists(currentState, versionId);
        if (!version) {
          return currentState;
        }

        const validatedAtUtc = new Date().toISOString();
        return {
          ...currentState,
          datasetVersions: currentState.datasetVersions.map((item) =>
            item.versionId === versionId
              ? {
                  ...item,
                  status: item.status === "published" ? "published" : "validated",
                  validatedAtUtc,
                }
              : item
          ),
          auditEvents: currentState.auditEvents.concat(
            createAuditEvent({
              eventType: "dataset.validated",
              actor: access.actor,
              customerId: currentState.customerManifest.customerId,
              datasetVersionId: versionId,
              correlationId: getCorrelationId(request),
            })
          ),
        };
      }, runtimeConfig);

      const updatedVersion = state.datasetVersions.find((item) => item.versionId === versionId);
      return jsonResponse(200, { datasetVersion: updatedVersion });
    });
  };
}

export function createPublishDatasetHandler(dependencies: RuntimeDependencies = {}) {
  return async function publishDatasetHandler(request: RequestLike): Promise<HttpResponseInit> {
    const runtimeConfig = getRuntimeConfig(dependencies);
    const access = authorizeAdmin(request, runtimeConfig);
    if (!("actor" in access)) {
      return access;
    }

    const versionId = String(request.params?.versionId ?? "").trim();

    if (!versionId) {
      return jsonResponse(400, { error: "A versionId route parameter is required." });
    }

    const body = await readJsonBody(request);
    return withStateHandling("admin dataset publish", undefined, async () => {
      const preflightState = loadState(runtimeConfig);
      const version = assertDatasetVersionExists(preflightState, versionId);
      if (!version) {
        return jsonResponse(404, { error: "Dataset version not found." });
      }

      if (!preflightState.datasetManifest.publishable) {
        return jsonResponse(409, { error: "Dataset publishing is disabled for this manifest." });
      }

      const result = await updateState((state) => {
        const previousActiveRelease = getActiveRelease(state);
        const publishedAtUtc = new Date().toISOString();
        const releaseId = sanitizeString(body?.releaseId, `release-${versionId}`);
        const portalVisibleMetadata = readReleaseMetadata(
          body,
          `Release ${version.datasetVersion}`,
          `Published dataset version ${version.datasetVersion}.`
        );
        const publishedRelease: PublishedRelease = {
          releaseId,
          customerId: state.customerManifest.customerId,
          datasetManifestId: version.datasetManifestId,
          datasetVersionId: version.versionId,
          status: "active",
          publishedAtUtc,
          rollbackTargetReleaseId: previousActiveRelease.releaseId,
          portalVisibleMetadata,
        };
        const nextPublishedReleases: PublishedRelease[] = state.publishedReleases
          .map((item) =>
            item.releaseId === previousActiveRelease.releaseId
              ? {
                  ...item,
                  status: "superseded" as const,
                  rollbackTargetReleaseId: releaseId,
                }
              : item
          )
          .concat(publishedRelease);

        return {
          ...state,
          activeReleaseId: releaseId,
          datasetVersions: state.datasetVersions.map((item) =>
            item.versionId === versionId
              ? {
                  ...item,
                  status: "published",
                  validatedAtUtc: item.validatedAtUtc ?? publishedAtUtc,
                  publishedAtUtc,
                }
              : item
          ),
          publishedReleases: nextPublishedReleases,
          auditEvents: state.auditEvents.concat(
            createAuditEvent({
              eventType: "dataset.published",
              actor: access.actor,
              customerId: state.customerManifest.customerId,
              datasetVersionId: versionId,
              releaseId,
              correlationId: getCorrelationId(request),
              details: {
                datasetManifestId: version.datasetManifestId,
                portalVisibleMetadata,
              },
            })
          ),
        };
      }, runtimeConfig);

      const release = result.publishedReleases.find((item) => item.releaseId === result.activeReleaseId);
      if (!release) {
        return jsonResponse(404, { error: "Dataset version not found." });
      }

      return jsonResponse(200, { publishedRelease: release });
    });
  };
}

export function createRollbackReleaseHandler(dependencies: RuntimeDependencies = {}) {
  return async function rollbackReleaseHandler(request: RequestLike): Promise<HttpResponseInit> {
    const runtimeConfig = getRuntimeConfig(dependencies);
    const access = authorizeAdmin(request, runtimeConfig);
    if (!("actor" in access)) {
      return access;
    }

    const releaseId = String(request.params?.releaseId ?? "").trim();

    if (!releaseId) {
      return jsonResponse(400, { error: "A releaseId route parameter is required." });
    }

    return withStateHandling("admin release rollback", undefined, async () => {
      const preflightState = loadState(runtimeConfig);
      if (!preflightState.publishedReleases.find((item) => item.releaseId === releaseId)) {
        return jsonResponse(404, { error: "Release not found." });
      }

      const state = await updateState((currentState) => {
        const targetRelease = currentState.publishedReleases.find((item) => item.releaseId === releaseId);
        if (!targetRelease) {
          return currentState;
        }

        const activeRelease = getActiveRelease(currentState);
        const rollbackAtUtc = new Date().toISOString();
        const nextPublishedReleases: PublishedRelease[] = currentState.publishedReleases.map((item) => {
          if (item.releaseId === releaseId) {
            return {
              ...item,
              status: "active" as const,
            };
          }

          if (item.releaseId === activeRelease.releaseId) {
            return {
              ...item,
              status: "rolled-back" as const,
              rollbackTargetReleaseId: releaseId,
            };
          }

          return item;
        });

        return {
          ...currentState,
          activeReleaseId: releaseId,
          publishedReleases: nextPublishedReleases,
          datasetVersions: currentState.datasetVersions.map((item) =>
            item.versionId === targetRelease.datasetVersionId
              ? {
                  ...item,
                  status: "published",
                  publishedAtUtc: item.publishedAtUtc ?? rollbackAtUtc,
                }
              : item
          ),
          auditEvents: currentState.auditEvents.concat(
            createAuditEvent({
              eventType: "release.rolled-back",
              actor: access.actor,
              customerId: currentState.customerManifest.customerId,
              releaseId,
              correlationId: getCorrelationId(request),
              details: {
                previousActiveReleaseId: activeRelease.releaseId,
              },
            })
          ),
        };
      }, runtimeConfig);

      const release = state.publishedReleases.find((item) => item.releaseId === releaseId);
      if (!release) {
        return jsonResponse(404, { error: "Release not found." });
      }

      return jsonResponse(200, { publishedRelease: release });
    });
  };
}

export function createMapsTokenHandler(dependencies: RuntimeDependencies = {}) {
  const getConfig = dependencies.getAzureMapsConfig ?? readAzureMapsConfig;
  const issueToken = dependencies.issueMapsToken ?? createMapsSasToken;

  return async function mapsTokenHandler(request: RequestLike, context?: InvocationContext): Promise<HttpResponseInit> {
    const config = getConfig();

    if (!config.isValid) {
      context?.error?.("Azure Maps token broker is misconfigured.", {
        missingSettings: config.missingSettings,
        invalidSettings: config.invalidSettings,
        invalidOrigins: config.invalidOrigins,
      });

      return jsonResponse(503, { error: "Azure Maps API is not configured correctly." });
    }

    const { origin, source } = extractRequestOrigin(request);
    if (!origin || !isOriginAllowed(origin, config.allowedOrigins)) {
      context?.warn?.("Rejected Azure Maps token request for disallowed origin.", {
        origin,
        source,
      });

      return jsonResponse(403, { error: "Origin is not allowed." });
    }

    try {
      const tokenResponse = await issueToken(config);

      context?.log?.("Issued Azure Maps SAS token.", {
        origin,
        source,
        expiresOnUtc: tokenResponse.expiresOnUtc,
        ttlMinutes: config.azureMapsSasTtlMinutes,
        maxRatePerSecond: config.azureMapsSasMaxRps,
      });

      return jsonResponse(200, {
        token: tokenResponse.token,
        clientId: tokenResponse.clientId,
        expiresOnUtc: tokenResponse.expiresOnUtc,
      });
    } catch (error) {
      context?.error?.("Azure Maps SAS issuance failed.", error, {
        origin,
        source,
      });

      return jsonResponse(500, { error: "Failed to issue Azure Maps token." });
    }
  };
}

export function createPortalManifestHandler(dependencies: RuntimeDependencies = {}) {
  return async function portalManifestHandler(
    _request?: RequestLike,
    context?: InvocationContext
  ): Promise<HttpResponseInit> {
    return withStateHandling("portal manifest", context, () => {
      const state = loadState(getRuntimeConfig(dependencies));
      return jsonResponse(200, buildManifest(state, (dependencies.getAzureMapsConfig ?? readAzureMapsConfig)()));
    });
  };
}

export function createBootstrapHandler(dependencies: RuntimeDependencies = {}) {
  return async function bootstrapHandler(
    _request?: RequestLike,
    context?: InvocationContext
  ): Promise<HttpResponseInit> {
    return withStateHandling("bootstrap", context, () => {
      const state = loadState(getRuntimeConfig(dependencies));
      return jsonResponse(200, buildBootstrap(state, (dependencies.getAzureMapsConfig ?? readAzureMapsConfig)()));
    });
  };
}

export function createPortalReadSummary<T>(
  items: T[],
  extra: Record<string, unknown> = {}
): HttpResponseInit {
  return jsonResponse(200, {
    items,
    count: items.length,
    ...extra,
  });
}

export function createSitesReadHandler(dependencies: RuntimeDependencies = {}) {
  return async function sitesReadHandler(): Promise<HttpResponseInit> {
    const runtimeConfig = getRuntimeConfig(dependencies);
    return createPortalReadSummary<SiteRecord>(loadSites(runtimeConfig));
  };
}

export function createParametersReadHandler(dependencies: RuntimeDependencies = {}) {
  return async function parametersReadHandler(): Promise<HttpResponseInit> {
    const runtimeConfig = getRuntimeConfig(dependencies);
    return createPortalReadSummary<ParameterRecord>(loadParameters(runtimeConfig));
  };
}

export function createMeasurementsReadHandler(dependencies: RuntimeDependencies = {}) {
  return async function measurementsReadHandler(request: RequestLike): Promise<HttpResponseInit> {
    const runtimeConfig = getRuntimeConfig(dependencies);
    const filter: MeasurementFilter = {
      site: getQueryValue(request, "site"),
      siteType: getQueryValue(request, "siteType"),
      parameter: getQueryValue(request, "parameter"),
      year: getQueryValue(request, "year") ? Number.parseInt(getQueryValue(request, "year")!, 10) : undefined,
    };
    const items = loadMeasurements(runtimeConfig, filter);
    return jsonResponse(200, {
      items,
      count: items.length,
      appliedFilters: filter,
    });
  };
}

export function createExportFileHandler(dependencies: RuntimeDependencies = {}) {
  return async function exportFileHandler(
    request: RequestLike,
    context?: InvocationContext
  ): Promise<HttpResponseInit> {
    const runtimeConfig = getRuntimeConfig(dependencies);
    return withStateHandling("export file", context, () => {
      const state = loadState(runtimeConfig);
      const releaseId = String(request.params?.releaseId ?? "").trim();
      const artifact = String(request.params?.artifact ?? "").trim() as ReleaseArtifactName;

      if (!state.publishedReleases.find((item) => item.releaseId === releaseId)) {
        return jsonResponse(404, { error: "Release not found." });
      }

      if (artifact === "bootstrap.json") {
        return jsonResponse(200, buildBootstrap(state, (dependencies.getAzureMapsConfig ?? readAzureMapsConfig)()));
      }

      if (artifact === "customer-profile.json") {
        return jsonResponse(200, state.customerProfile);
      }

      if (artifact === "manifest.json") {
        return jsonResponse(200, buildManifest(state, (dependencies.getAzureMapsConfig ?? readAzureMapsConfig)()));
      }

      if (
        artifact === "sites.csv" ||
        artifact === "parameters.csv" ||
        artifact === "measurements.csv"
      ) {
        return textResponse(200, exportArtifactAsCsv(runtimeConfig, artifact), "text/csv; charset=utf-8", {
          "Content-Disposition": `attachment; filename="${releaseId}-${artifact}"`,
        });
      }

      return jsonResponse(400, { error: "Unsupported export artifact." });
    });
  };
}

export function createAdminAuditEventsHandler(dependencies: RuntimeDependencies = {}) {
  return async function adminAuditEventsHandler(
    request: RequestLike = {},
    context?: InvocationContext
  ): Promise<HttpResponseInit> {
    const runtimeConfig = getRuntimeConfig(dependencies);
    const access = authorizeAdmin(request, runtimeConfig);
    if (!("actor" in access)) {
      return access;
    }

    return withStateHandling("admin audit events read", context, () => {
      const state = loadState(runtimeConfig);
      const limit = Number.parseInt(getQueryValue(request, "limit") || "50", 10);
      const safeLimit = Number.isFinite(limit) && limit > 0 ? limit : 50;
      const items = state.auditEvents.slice(-safeLimit).reverse();
      return jsonResponse(200, { items, count: items.length });
    });
  };
}

export function createAdminCustomerProfileGetHandler(dependencies: RuntimeDependencies = {}) {
  return async function adminCustomerProfileGetHandler(
    request: RequestLike = {},
    context?: InvocationContext
  ): Promise<HttpResponseInit> {
    return createCustomerProfileGetHandler(dependencies)(request, context);
  };
}

export function createAdminCustomerProfilePutHandler(dependencies: RuntimeDependencies = {}) {
  return createCustomerProfilePutHandler(dependencies);
}
