import { getAzureMapsAuthBundle } from "./azureMapsToken";
import { MAP_MAX_ZOOM } from "./mapViewport";
import { trackEvent, trackException } from "../utils/telemetry";
import {
  DEFAULT_AZURE_MAPS_TILESET_ID,
  isCacheableAzureMapsTilesetId,
  normalizeAzureMapsTilesetId,
} from "./azureMapsTilesets";

export const AZURE_MAPS_TILE_CACHE_NAME = "nwmiws-azuremaps-tiles-v1";
export const AZURE_MAPS_TILE_CACHE_MAX_ENTRIES = 500;
export const AZURE_MAPS_TILE_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const AZURE_MAPS_TILE_API_VERSION = "2.1";
export const AZURE_MAPS_TILE_DOMAIN = "atlas.microsoft.com";
export const AZURE_MAPS_TILESET_ID = DEFAULT_AZURE_MAPS_TILESET_ID;
export const AZURE_MAPS_TILE_LANGUAGE = "en-US";
export const AZURE_MAPS_TILE_VIEW = "Auto";
export const AZURE_MAPS_TILE_SIZE = 256;
export const MAX_WARM_TILE_URLS = 40;
export const TILE_WARM_CONCURRENCY = 4;

const SLOW_EFFECTIVE_TYPES = new Set(["slow-2g", "2g"]);

const warmedTilesetIdsThisPage = new Set();

function parseRequestUrl(value) {
  if (value instanceof Request) {
    return new URL(value.url);
  }

  if (value instanceof URL) {
    return value;
  }

  try {
    return new URL(String(value));
  } catch (error) {
    return null;
  }
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function normalizeBounds(bounds) {
  if (!bounds) {
    return null;
  }

  if (
    typeof bounds.getNorth === "function" &&
    typeof bounds.getSouth === "function" &&
    typeof bounds.getEast === "function" &&
    typeof bounds.getWest === "function"
  ) {
    return {
      north: bounds.getNorth(),
      south: bounds.getSouth(),
      east: bounds.getEast(),
      west: bounds.getWest(),
    };
  }

  if (
    Array.isArray(bounds) &&
    bounds.length === 2 &&
    Array.isArray(bounds[0]) &&
    Array.isArray(bounds[1])
  ) {
    return {
      south: Number(bounds[0][0]),
      west: Number(bounds[0][1]),
      north: Number(bounds[1][0]),
      east: Number(bounds[1][1]),
    };
  }

  return null;
}

function lngToTileX(lng, zoom) {
  const tileCount = 2 ** zoom;
  return clamp(Math.floor(((lng + 180) / 360) * tileCount), 0, tileCount - 1);
}

function latToTileY(lat, zoom) {
  const tileCount = 2 ** zoom;
  const clampedLat = clamp(lat, -85.05112878, 85.05112878);
  const latRadians = (clampedLat * Math.PI) / 180;
  const mercator =
    (1 - Math.log(Math.tan(latRadians) + 1 / Math.cos(latRadians)) / Math.PI) / 2;

  return clamp(Math.floor(mercator * tileCount), 0, tileCount - 1);
}

function getWarmSkipReason(navigatorImpl, cacheStorage, fetchImpl, tilesetId) {
  if (!navigatorImpl?.serviceWorker?.controller) {
    return "no-controller";
  }

  if (!cacheStorage?.open || typeof fetchImpl !== "function") {
    return "unsupported-cache";
  }

  const connection = navigatorImpl.connection;
  if (connection?.saveData) {
    return "save-data";
  }

  if (SLOW_EFFECTIVE_TYPES.has(String(connection?.effectiveType || "").toLowerCase())) {
    return "slow-network";
  }

  if (warmedTilesetIdsThisPage.has(tilesetId)) {
    return "already-warmed";
  }

  return null;
}

function readCachedTimestamp(response) {
  const value = Number(response?.headers?.get("x-nwmiws-cached-at"));
  return Number.isFinite(value) ? value : null;
}

async function readFreshCacheStatus(cache, url, nowMs) {
  const cachedResponse = await cache.match(url);
  if (!cachedResponse) {
    return { cached: false };
  }

  const cachedAtMs = readCachedTimestamp(cachedResponse);
  const isFresh =
    Number.isFinite(cachedAtMs) && nowMs - cachedAtMs <= AZURE_MAPS_TILE_CACHE_MAX_AGE_MS;

  if (isFresh) {
    return { cached: true };
  }

  await cache.delete(url);
  return { cached: false };
}

async function runWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let currentIndex = 0;

  async function next() {
    const itemIndex = currentIndex;
    currentIndex += 1;

    if (itemIndex >= items.length) {
      return;
    }

    results[itemIndex] = await worker(items[itemIndex], itemIndex);
    await next();
  }

  const runners = Array.from({ length: Math.min(concurrency, items.length) }, () => next());
  await Promise.all(runners);

  return results;
}

export function isAzureMapsBaseTileUrl(value) {
  const url = parseRequestUrl(value);
  if (!url) {
    return false;
  }

  const isExpectedHost = url.hostname === AZURE_MAPS_TILE_DOMAIN;
  const isExpectedPath = url.pathname === "/map/tile";
  const tilesetId = String(url.searchParams.get("tilesetId") || "");

  return isExpectedHost && isExpectedPath && isCacheableAzureMapsTilesetId(tilesetId);
}

export function buildAzureMapsTileUrl({
  x,
  y,
  zoom,
  tilesetId = AZURE_MAPS_TILESET_ID,
  language = AZURE_MAPS_TILE_LANGUAGE,
  view = AZURE_MAPS_TILE_VIEW,
  tileSize = AZURE_MAPS_TILE_SIZE,
} = {}) {
  const url = new URL(`https://${AZURE_MAPS_TILE_DOMAIN}/map/tile`);
  url.searchParams.set("api-version", AZURE_MAPS_TILE_API_VERSION);
  url.searchParams.set("tilesetId", tilesetId);
  url.searchParams.set("zoom", String(zoom));
  url.searchParams.set("x", String(x));
  url.searchParams.set("y", String(y));
  url.searchParams.set("tileSize", String(tileSize));
  url.searchParams.set("language", language);
  url.searchParams.set("view", view);
  return url.toString();
}

export function collectTileUrlsForBounds(bounds, zoom, options = {}) {
  const normalizedBounds = normalizeBounds(bounds);
  if (!normalizedBounds || !Number.isFinite(Number(zoom))) {
    return [];
  }

  const ringSize = Math.max(0, Number.parseInt(String(options.ringSize ?? 1), 10) || 0);
  const tileCount = 2 ** zoom;
  const xMin = clamp(lngToTileX(normalizedBounds.west, zoom) - ringSize, 0, tileCount - 1);
  const xMax = clamp(lngToTileX(normalizedBounds.east, zoom) + ringSize, 0, tileCount - 1);
  const yMin = clamp(latToTileY(normalizedBounds.north, zoom) - ringSize, 0, tileCount - 1);
  const yMax = clamp(latToTileY(normalizedBounds.south, zoom) + ringSize, 0, tileCount - 1);

  const urls = [];
  for (let x = xMin; x <= xMax; x += 1) {
    for (let y = yMin; y <= yMax; y += 1) {
      urls.push(
        buildAzureMapsTileUrl({
          x,
          y,
          zoom,
          tilesetId: options.tilesetId,
          language: options.language,
          view: options.view,
          tileSize: options.tileSize,
        })
      );
    }
  }

  return urls;
}

export async function warmAzureMapsTiles({
  map,
  navigatorImpl = globalThis.navigator,
  cacheStorage = globalThis.caches,
  fetchImpl = globalThis.fetch,
  getAuthBundle = getAzureMapsAuthBundle,
  now = () => Date.now(),
  tilesetId = AZURE_MAPS_TILESET_ID,
} = {}) {
  const resolvedTilesetId = normalizeAzureMapsTilesetId(tilesetId);
  const skipReason = getWarmSkipReason(
    navigatorImpl,
    cacheStorage,
    fetchImpl,
    resolvedTilesetId
  );
  if (skipReason) {
    trackEvent("azure_maps_tile_warm_skipped", {
      reason: skipReason,
      tilesetId: resolvedTilesetId,
    });
    return { status: "skipped", reason: skipReason };
  }

  if (!map || typeof map.getBounds !== "function" || typeof map.getZoom !== "function") {
    const error = new Error("Azure Maps tile warming requires a Leaflet map instance.");
    trackException(error, { component: "azureMapsTileWarm" });
    throw error;
  }

  const startedAtMs = now();
  const currentZoom = clamp(Math.round(map.getZoom()), 0, MAP_MAX_ZOOM);
  const zoomLevels = Array.from(new Set([currentZoom, Math.min(currentZoom + 1, MAP_MAX_ZOOM)]));
  const candidateTileUrls = zoomLevels.flatMap((zoomLevel) =>
    collectTileUrlsForBounds(map.getBounds(), zoomLevel, {
      tilesetId: resolvedTilesetId,
    })
  );
  const requestedTileUrls = Array.from(new Set(candidateTileUrls)).slice(0, MAX_WARM_TILE_URLS);

  trackEvent(
    "azure_maps_tile_warm_started",
    {
      tilesetId: resolvedTilesetId,
      zoomLevels: zoomLevels.join(","),
    },
    {
      requestedTileCount: requestedTileUrls.length,
    }
  );

  try {
    const cache = await cacheStorage.open(AZURE_MAPS_TILE_CACHE_NAME);
    const nowMs = startedAtMs;
    const cacheStatuses = await Promise.all(
      requestedTileUrls.map(async (url) => ({
        url,
        ...(await readFreshCacheStatus(cache, url, nowMs)),
      }))
    );
    const uncachedTileUrls = cacheStatuses
      .filter((entry) => !entry.cached)
      .map((entry) => entry.url);
    const skippedCachedCount = requestedTileUrls.length - uncachedTileUrls.length;

    const authBundle = await getAuthBundle();
    const warmResults = await runWithConcurrency(
      uncachedTileUrls,
      TILE_WARM_CONCURRENCY,
      async (url) => {
        try {
          const response = await fetchImpl(url, {
            credentials: "omit",
            headers: {
              Authorization: `jwt-sas ${authBundle.token}`,
              "x-ms-client-id": authBundle.clientId,
            },
            mode: "cors",
          });

          if (!response.ok) {
            const error = new Error(
              `Azure Maps tile warm request failed with ${response.status}.`
            );
            error.status = response.status;
            throw error;
          }

          return { success: true, url };
        } catch (error) {
          return { error, success: false, url };
        }
      }
    );

    const failedResults = warmResults.filter((result) => !result.success);
    const prefetchedTileCount = warmResults.filter((result) => result.success).length;
    const failedTileCount = uncachedTileUrls.length - prefetchedTileCount;
    const durationMs = Math.max(0, now() - startedAtMs);

    warmedTilesetIdsThisPage.add(resolvedTilesetId);

    if (failedResults.length > 0) {
      trackException(failedResults[0].error, {
        component: "azureMapsTileWarm",
        failedTileCount,
        tilesetId: resolvedTilesetId,
        zoomLevels: zoomLevels.join(","),
      });
    }

    trackEvent(
      "azure_maps_tile_warm_completed",
      {
        tilesetId: resolvedTilesetId,
        zoomLevels: zoomLevels.join(","),
        requestedTileCount: requestedTileUrls.length,
        prefetchedTileCount,
        skippedCachedCount,
        failedTileCount,
        durationMs,
      },
      {
        requestedTileCount: requestedTileUrls.length,
        prefetchedTileCount,
        skippedCachedCount,
        failedTileCount,
        durationMs,
      }
    );

    return {
      status: "completed",
      requestedTileCount: requestedTileUrls.length,
      prefetchedTileCount,
      skippedCachedCount,
      failedTileCount,
      zoomLevels,
      durationMs,
    };
  } catch (error) {
    trackEvent("azure_maps_tile_warm_failed", {
      tilesetId: resolvedTilesetId,
      zoomLevels: zoomLevels.join(","),
    });
    trackException(error, {
      component: "azureMapsTileWarm",
      tilesetId: resolvedTilesetId,
      zoomLevels: zoomLevels.join(","),
    });
    throw error;
  }
}

export function resetAzureMapsTileWarmForTests() {
  warmedTilesetIdsThisPage.clear();
}
