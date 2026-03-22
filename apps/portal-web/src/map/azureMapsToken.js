import { trackEvent, trackException } from "../utils/telemetry";

const TOKEN_ENDPOINT = "/api/maps/token";
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;
export const AZURE_MAPS_AUTH_BUNDLE_STORAGE_KEY = "nwmiws.azureMapsAuthBundle.v1";

let cachedAuthBundle = null;
let inFlightPromise = null;

function normalizeAuthBundle(payload) {
  const token = String(payload?.token || "").trim();
  const clientId = String(payload?.clientId || "").trim();
  const expiresOnUtc = String(payload?.expiresOnUtc || "").trim();
  const expiresAtMs = Date.parse(expiresOnUtc);

  if (!token || !clientId || !Number.isFinite(expiresAtMs)) {
    throw new Error("Azure Maps token payload is incomplete.");
  }

  return {
    token,
    clientId,
    expiresOnUtc,
  };
}

async function readErrorMessage(response) {
  const responseText = (await response.text()).trim();
  if (responseText) {
    return responseText;
  }

  return `${response.status} ${response.statusText}`.trim();
}

async function fetchAzureMapsAuthBundleFromApi(fetchImpl) {
  if (typeof fetchImpl !== "function") {
    throw new Error("Fetch API is unavailable for Azure Maps token requests.");
  }

  const response = await fetchImpl(TOKEN_ENDPOINT, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const message = await readErrorMessage(response);
    const error = new Error(`Azure Maps token request failed: ${message}`);
    error.status = response.status;
    throw error;
  }

  return normalizeAuthBundle(await response.json());
}

function getSessionStorage() {
  return globalThis.sessionStorage || null;
}

function persistAzureMapsAuthBundle(bundle, storage = getSessionStorage()) {
  if (!storage?.setItem || !bundle) {
    return;
  }

  try {
    storage.setItem(AZURE_MAPS_AUTH_BUNDLE_STORAGE_KEY, JSON.stringify(bundle));
  } catch (error) {
    // Ignore storage failures and continue with in-memory caching only.
  }
}

function readPersistedAzureMapsAuthBundle(storage = getSessionStorage()) {
  if (!storage?.getItem) {
    return null;
  }

  try {
    const rawValue = storage.getItem(AZURE_MAPS_AUTH_BUNDLE_STORAGE_KEY);
    if (!rawValue) {
      return null;
    }

    const bundle = normalizeAuthBundle(JSON.parse(rawValue));
    if (isAzureMapsAuthBundleFresh(bundle)) {
      return bundle;
    }
  } catch (error) {
    // Fall through to remove any malformed or expired payload.
  }

  try {
    storage.removeItem(AZURE_MAPS_AUTH_BUNDLE_STORAGE_KEY);
  } catch (error) {
    // Ignore storage cleanup failures.
  }
  return null;
}

export function isAzureMapsAuthBundleFresh(bundle, nowMs = Date.now()) {
  if (!bundle) {
    return false;
  }

  const expiresAtMs = Date.parse(bundle.expiresOnUtc);
  return Number.isFinite(expiresAtMs) && expiresAtMs - TOKEN_REFRESH_BUFFER_MS > nowMs;
}

export async function getAzureMapsAuthBundle(options = {}) {
  const { forceRefresh = false, fetchImpl = globalThis.fetch } = options;

  if (!forceRefresh && isAzureMapsAuthBundleFresh(cachedAuthBundle)) {
    return cachedAuthBundle;
  }

  if (!forceRefresh) {
    const persistedBundle = readPersistedAzureMapsAuthBundle();
    if (persistedBundle) {
      cachedAuthBundle = persistedBundle;
      return cachedAuthBundle;
    }
  }

  if (inFlightPromise) {
    return inFlightPromise;
  }

  inFlightPromise = fetchAzureMapsAuthBundleFromApi(fetchImpl)
    .then((bundle) => {
      cachedAuthBundle = bundle;
      persistAzureMapsAuthBundle(bundle);
      return bundle;
    })
    .catch((error) => {
      trackEvent("azure_maps_token_fetch_failed", {
        endpoint: TOKEN_ENDPOINT,
        status: error?.status,
      });
      trackException(error, {
        component: "azureMapsToken",
        endpoint: TOKEN_ENDPOINT,
        status: error?.status,
      });
      throw error;
    })
    .finally(() => {
      inFlightPromise = null;
    });

  return inFlightPromise;
}

export async function getAzureMapsSasToken(options = {}) {
  const bundle = await getAzureMapsAuthBundle(options);
  return bundle.token;
}

export function resetAzureMapsTokenCacheForTests() {
  cachedAuthBundle = null;
  inFlightPromise = null;
  const storage = getSessionStorage();
  try {
    storage?.removeItem?.(AZURE_MAPS_AUTH_BUNDLE_STORAGE_KEY);
  } catch (error) {
    // Ignore storage cleanup failures during tests.
  }
}

