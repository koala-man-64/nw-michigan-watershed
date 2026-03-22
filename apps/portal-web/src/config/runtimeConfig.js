import { DEFAULT_DATA_REVALIDATE_AFTER_MS } from "./dataSources";
import { getRuntimeEnv, getRuntimeEnvString } from "./runtimeEnv";

const DEFAULT_SUPPORT_CONTACT = Object.freeze({
  name: "John Ransom",
  organization: "Benzie County Conservation District",
  phoneDisplay: "231-882-4391",
  phoneHref: "tel:+12318824391",
  email: "john@benziecd.org",
});

const DEFAULT_FEATURE_FLAGS = Object.freeze({
  compareMode: true,
  adminEnabled: false,
  privatePortal: false,
});

const DEFAULT_MAP_CONFIG = Object.freeze({
  center: [44.75, -85.85],
  zoom: 8,
  minZoom: 7,
  maxZoom: 16,
  tilesetId: "microsoft.base.road",
  tokenRoute: "/api/maps/token",
});

const DEFAULT_ENDPOINTS = Object.freeze({
  bootstrap: "/api/portal/bootstrap",
  sites: "/api/sites",
  parameters: "/api/parameters",
  measurements: "/api/measurements",
  exportsBase: "/api/exports",
});

export const DEFAULT_RUNTIME_CONFIG = Object.freeze({
  appTitle: "NW Michigan Water Quality Database",
  bootstrapEndpoint: DEFAULT_ENDPOINTS.bootstrap,
  endpoints: DEFAULT_ENDPOINTS,
  featureFlags: DEFAULT_FEATURE_FLAGS,
  map: DEFAULT_MAP_CONFIG,
  revalidateAfterMs: DEFAULT_DATA_REVALIDATE_AFTER_MS,
  supportContact: DEFAULT_SUPPORT_CONTACT,
  customerManifest: null,
  customerProfile: null,
  datasetManifest: null,
  publishedRelease: null,
  telemetry: {
    connectionString: "",
  },
});

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeArray2(value, fallback) {
  if (Array.isArray(value) && value.length === 2) {
    const first = Number(value[0]);
    const second = Number(value[1]);
    if (Number.isFinite(first) && Number.isFinite(second)) {
      return [first, second];
    }
  }

  return fallback;
}

function normalizeSupportContact(value = {}) {
  const phoneDisplay = String(value.phoneDisplay ?? value.phone ?? "").trim();
  const fallbackPhoneHref =
    phoneDisplay ? `tel:${phoneDisplay.replace(/[^+\d]/g, "")}` : DEFAULT_SUPPORT_CONTACT.phoneHref;

  return {
    name: String(value.name ?? DEFAULT_SUPPORT_CONTACT.name).trim() || DEFAULT_SUPPORT_CONTACT.name,
    organization:
      String(value.organization ?? DEFAULT_SUPPORT_CONTACT.organization).trim() ||
      DEFAULT_SUPPORT_CONTACT.organization,
    phoneDisplay: phoneDisplay || DEFAULT_SUPPORT_CONTACT.phoneDisplay,
    phoneHref:
      String(value.phoneHref ?? fallbackPhoneHref).trim() || DEFAULT_SUPPORT_CONTACT.phoneHref,
    email: String(value.email ?? DEFAULT_SUPPORT_CONTACT.email).trim() || DEFAULT_SUPPORT_CONTACT.email,
  };
}

function normalizeEndpoints(value = {}) {
  return {
    bootstrap: String(value.bootstrap ?? DEFAULT_ENDPOINTS.bootstrap).trim() || DEFAULT_ENDPOINTS.bootstrap,
    sites: String(value.sites ?? DEFAULT_ENDPOINTS.sites).trim() || DEFAULT_ENDPOINTS.sites,
    parameters:
      String(value.parameters ?? DEFAULT_ENDPOINTS.parameters).trim() || DEFAULT_ENDPOINTS.parameters,
    measurements:
      String(value.measurements ?? DEFAULT_ENDPOINTS.measurements).trim() ||
      DEFAULT_ENDPOINTS.measurements,
    exportsBase:
      String(value.exportsBase ?? DEFAULT_ENDPOINTS.exportsBase).trim() ||
      DEFAULT_ENDPOINTS.exportsBase,
  };
}

function normalizeFeatureFlags(value = {}) {
  return {
    compareMode:
      typeof value.compareMode === "boolean" ? value.compareMode : DEFAULT_FEATURE_FLAGS.compareMode,
    adminEnabled:
      typeof value.adminEnabled === "boolean"
        ? value.adminEnabled
        : typeof value.adminMode === "boolean"
          ? value.adminMode
          : DEFAULT_FEATURE_FLAGS.adminEnabled,
    privatePortal:
      typeof value.privatePortal === "boolean"
        ? value.privatePortal
        : typeof value.privatePortalMode === "boolean"
          ? value.privatePortalMode
          : DEFAULT_FEATURE_FLAGS.privatePortal,
  };
}

function normalizeMapConfig(value = {}) {
  return {
    center: normalizeArray2(value.center, DEFAULT_MAP_CONFIG.center),
    zoom: parsePositiveInt(value.zoom, DEFAULT_MAP_CONFIG.zoom),
    minZoom: parsePositiveInt(value.minZoom, DEFAULT_MAP_CONFIG.minZoom),
    maxZoom: parsePositiveInt(value.maxZoom, DEFAULT_MAP_CONFIG.maxZoom),
    tilesetId:
      String(value.tilesetId ?? DEFAULT_MAP_CONFIG.tilesetId).trim() || DEFAULT_MAP_CONFIG.tilesetId,
    tokenRoute:
      String(value.tokenRoute ?? DEFAULT_MAP_CONFIG.tokenRoute).trim() || DEFAULT_MAP_CONFIG.tokenRoute,
  };
}

function normalizeTelemetry(value = {}) {
  return {
    connectionString:
      String(value.connectionString ?? value.REACT_APP_APPLICATIONINSIGHTS_CONNECTION_STRING ?? "")
        .trim() || "",
  };
}

export function normalizeRuntimeConfig(value = {}) {
  const payload = value && typeof value === "object" ? value : {};
  const runtimeEnv = getRuntimeEnv();
  const customerManifest = payload.customerManifest ?? null;
  const customerProfile = payload.customerProfile ?? null;
  const datasetManifest = payload.datasetManifest ?? null;
  const publishedRelease = payload.publishedRelease ?? null;
  const featureFlagsPayload = payload.featureFlags ?? customerManifest?.featureFlags ?? {};
  const mapProviderPayload = payload.mapProvider ?? customerManifest?.mapProvider ?? {};
  const mapDefaultsPayload = customerManifest?.mapDefaults ?? payload.map ?? {};
  const supportContactPayload =
    customerProfile?.supportContact ?? customerManifest?.supportContact ?? payload.supportContact;

  return {
    appTitle:
      String(
        payload.appTitle ??
          customerManifest?.branding?.title ??
          customerManifest?.displayName ??
          payload.title ??
          DEFAULT_RUNTIME_CONFIG.appTitle
      ).trim() ||
      DEFAULT_RUNTIME_CONFIG.appTitle,
    bootstrapEndpoint:
      String(payload.bootstrapEndpoint ?? DEFAULT_RUNTIME_CONFIG.bootstrapEndpoint).trim() ||
      DEFAULT_RUNTIME_CONFIG.bootstrapEndpoint,
    endpoints: normalizeEndpoints(payload.endpoints),
    featureFlags: normalizeFeatureFlags(featureFlagsPayload),
    map: normalizeMapConfig({
      ...mapDefaultsPayload,
      tilesetId: mapProviderPayload.tilesetId,
      tokenRoute: mapProviderPayload.tokenRoute,
    }),
    revalidateAfterMs: parsePositiveInt(
      payload.revalidateAfterMs ?? runtimeEnv.REACT_APP_PUBLIC_DATA_REVALIDATE_AFTER_MS,
      DEFAULT_RUNTIME_CONFIG.revalidateAfterMs
    ),
    supportContact: normalizeSupportContact(supportContactPayload),
    customerManifest,
    customerProfile,
    datasetManifest,
    publishedRelease,
    telemetry: normalizeTelemetry(payload.telemetry),
  };
}

let runtimeConfigLoadPromise = null;

export async function loadRuntimeConfig(fetchImpl = globalThis.fetch) {
  if (runtimeConfigLoadPromise) {
    return runtimeConfigLoadPromise;
  }

  runtimeConfigLoadPromise = (async () => {
    if (typeof fetchImpl !== "function") {
      return {
        config: normalizeRuntimeConfig(),
        source: "fallback",
      };
    }

    const bootstrapUrl = DEFAULT_RUNTIME_CONFIG.bootstrapEndpoint;
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timeoutId = controller
      ? globalThis.setTimeout(() => controller.abort(), 3000)
      : null;

    try {
      const response = await fetchImpl(bootstrapUrl, {
        headers: {
          Accept: "application/json",
        },
        signal: controller?.signal,
      });

      if (!response.ok) {
        throw new Error(`Bootstrap request failed with ${response.status}.`);
      }

      return {
        config: normalizeRuntimeConfig(await response.json()),
        source: "bootstrap",
      };
    } catch (error) {
      return {
        config: normalizeRuntimeConfig({
          telemetry: {
            connectionString: getRuntimeEnvString(
              "REACT_APP_APPLICATIONINSIGHTS_CONNECTION_STRING",
              getRuntimeEnvString("VITE_APPLICATIONINSIGHTS_CONNECTION_STRING", "")
            ),
          },
        }),
        source: "fallback",
        error,
      };
    } finally {
      if (timeoutId) {
        globalThis.clearTimeout(timeoutId);
      }
    }
  })();

  return runtimeConfigLoadPromise;
}

export function resetRuntimeConfigForTests() {
  runtimeConfigLoadPromise = null;
}
