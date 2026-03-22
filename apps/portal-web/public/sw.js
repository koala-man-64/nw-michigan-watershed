const AZURE_MAPS_TILE_CACHE_NAME = "nwmiws-azuremaps-tiles-v1";
const AZURE_MAPS_TILE_CACHE_PREFIX = "nwmiws-azuremaps-tiles-";
const AZURE_MAPS_TILE_CACHE_MAX_ENTRIES = 500;
const AZURE_MAPS_TILE_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function isAzureMapsBaseTileRequest(request) {
  if (!request || request.method !== "GET") {
    return false;
  }

  const url = new URL(request.url);
  if (url.hostname !== "atlas.microsoft.com" || url.pathname !== "/map/tile") {
    return false;
  }

  const tilesetId = String(url.searchParams.get("tilesetId") || "");
  return (
    tilesetId === "microsoft.base.hybrid.road" ||
    tilesetId === "microsoft.base.road" ||
    tilesetId === "microsoft.base.darkgrey" ||
    tilesetId === "microsoft.imagery"
  );
}

function readCachedTimestamp(response) {
  const value = Number(response?.headers?.get("x-nwmiws-cached-at"));
  return Number.isFinite(value) ? value : null;
}

function isFreshResponse(response, nowMs) {
  const cachedAtMs = readCachedTimestamp(response);
  return Number.isFinite(cachedAtMs) && nowMs - cachedAtMs <= AZURE_MAPS_TILE_CACHE_MAX_AGE_MS;
}

async function withCachedTimestamp(response) {
  const body = await response.blob();
  const headers = new Headers(response.headers);
  headers.set("x-nwmiws-cached-at", String(Date.now()));

  return new Response(body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}

async function trimTileCache(cache) {
  const keys = await cache.keys();
  if (keys.length <= AZURE_MAPS_TILE_CACHE_MAX_ENTRIES) {
    return;
  }

  const entries = await Promise.all(
    keys.map(async (request) => {
      const response = await cache.match(request);
      return {
        cachedAtMs: readCachedTimestamp(response) || 0,
        request,
      };
    })
  );

  entries.sort((left, right) => left.cachedAtMs - right.cachedAtMs);
  const overflowCount = entries.length - AZURE_MAPS_TILE_CACHE_MAX_ENTRIES;

  await Promise.all(
    entries.slice(0, overflowCount).map((entry) => cache.delete(entry.request))
  );
}

async function fetchAndCache(request) {
  const networkResponse = await fetch(request);
  if (!networkResponse || !networkResponse.ok) {
    return networkResponse;
  }

  const responseToCache = await withCachedTimestamp(networkResponse.clone());
  const cache = await caches.open(AZURE_MAPS_TILE_CACHE_NAME);
  await cache.put(request, responseToCache);
  await trimTileCache(cache);
  return networkResponse;
}

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const cacheKeys = await caches.keys();
      await Promise.all(
        cacheKeys
          .filter(
            (cacheKey) =>
              cacheKey.startsWith(AZURE_MAPS_TILE_CACHE_PREFIX) &&
              cacheKey !== AZURE_MAPS_TILE_CACHE_NAME
          )
          .map((cacheKey) => caches.delete(cacheKey))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  if (!isAzureMapsBaseTileRequest(event.request)) {
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(AZURE_MAPS_TILE_CACHE_NAME);
      const cachedResponse = await cache.match(event.request);
      if (cachedResponse) {
        if (isFreshResponse(cachedResponse, Date.now())) {
          return cachedResponse;
        }

        await cache.delete(event.request);
      }

      return fetchAndCache(event.request);
    })()
  );
});
