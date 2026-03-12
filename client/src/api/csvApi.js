import Papa from "papaparse";

const CSV_CACHE_PREFIX = "nwmiws:csv-cache:v1:";

export function apiCsvUrl(blobName) {
  const blob = encodeURIComponent(blobName);
  return `/api/read-csv?blob=${blob}&format=csv`;
}

function cacheKey(blobName) {
  return `${CSV_CACHE_PREFIX}${apiCsvUrl(blobName)}`;
}

function cacheStorage() {
  try {
    return window.localStorage;
  } catch (error) {
    return null;
  }
}

function readCachedCsv(blobName) {
  const storage = cacheStorage();
  if (!storage) {
    return null;
  }

  try {
    const raw = storage.getItem(cacheKey(blobName));
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.text !== "string") {
      return null;
    }

    return {
      text: parsed.text,
      etag: typeof parsed.etag === "string" ? parsed.etag : null,
      lastModified: typeof parsed.lastModified === "string" ? parsed.lastModified : null,
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : null,
    };
  } catch (error) {
    return null;
  }
}

function writeCachedCsv(blobName, entry) {
  const storage = cacheStorage();
  if (!storage) {
    return;
  }

  try {
    storage.setItem(cacheKey(blobName), JSON.stringify(entry));
  } catch (error) {
    // Ignore storage quota and privacy-mode failures.
  }
}

async function requestLatestCsvText(blobName, cachedEntry) {
  const headers = {};
  if (cachedEntry?.etag) {
    headers["If-None-Match"] = cachedEntry.etag;
  }
  if (cachedEntry?.lastModified) {
    headers["If-Modified-Since"] = cachedEntry.lastModified;
  }

  const response = await fetch(apiCsvUrl(blobName), {
    cache: "no-cache",
    headers,
  });

  if (response.status === 304 && cachedEntry?.text != null) {
    writeCachedCsv(blobName, {
      ...cachedEntry,
      etag: response.headers.get("ETag") || cachedEntry.etag,
      lastModified: response.headers.get("Last-Modified") || cachedEntry.lastModified,
      updatedAt: Date.now(),
    });
    return cachedEntry.text;
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${blobName}`);
  }

  const text = await response.text();
  writeCachedCsv(blobName, {
    text,
    etag: response.headers.get("ETag"),
    lastModified: response.headers.get("Last-Modified"),
    updatedAt: Date.now(),
  });
  return text;
}

export async function fetchCsvText(blobName) {
  const cachedEntry = readCachedCsv(blobName);
  const refreshPromise = requestLatestCsvText(blobName, cachedEntry).catch((error) => {
    if (cachedEntry?.text != null) {
      console.warn(`Using cached CSV after fetch failed for ${blobName}`, error);
      return cachedEntry.text;
    }
    throw error;
  });

  if (cachedEntry?.text != null) {
    void refreshPromise;
    return cachedEntry.text;
  }

  return refreshPromise;
}

export function parseCsvRows(csvText, { skipEmptyLines = true } = {}) {
  let rows = [];
  Papa.parse(csvText, {
    header: true,
    skipEmptyLines,
    complete: ({ data }) => {
      rows = data;
    },
  });
  return rows;
}
