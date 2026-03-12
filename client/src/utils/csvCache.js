const CSV_CACHE_PREFIX = "nwmiws:csv-cache:v1:";

function cacheKeyFor(url) {
  return `${CSV_CACHE_PREFIX}${url}`;
}

function getStorage() {
  try {
    return window.localStorage;
  } catch (error) {
    return null;
  }
}

function readCachedEntry(url) {
  const storage = getStorage();
  if (!storage) {
    return null;
  }

  try {
    const raw = storage.getItem(cacheKeyFor(url));
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
      lastModified:
        typeof parsed.lastModified === "string" ? parsed.lastModified : null,
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : null,
    };
  } catch (error) {
    return null;
  }
}

function writeCachedEntry(url, entry) {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  try {
    storage.setItem(cacheKeyFor(url), JSON.stringify(entry));
  } catch (error) {
    // Ignore storage quota / private mode failures and keep the fetch path working.
  }
}

async function requestLatestText(url, cachedEntry) {
  const headers = {};
  if (cachedEntry?.etag) {
    headers["If-None-Match"] = cachedEntry.etag;
  }
  if (cachedEntry?.lastModified) {
    headers["If-Modified-Since"] = cachedEntry.lastModified;
  }

  const response = await fetch(url, {
    cache: "no-cache",
    headers,
  });

  if (response.status === 304 && cachedEntry?.text != null) {
    writeCachedEntry(url, {
      ...cachedEntry,
      etag: response.headers.get("etag") || cachedEntry.etag,
      lastModified:
        response.headers.get("last-modified") || cachedEntry.lastModified,
      updatedAt: Date.now(),
    });
    return cachedEntry.text;
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }

  const text = await response.text();
  writeCachedEntry(url, {
    text,
    etag: response.headers.get("etag"),
    lastModified: response.headers.get("last-modified"),
    updatedAt: Date.now(),
  });
  return text;
}

export async function fetchCachedCsvText(url, { onFreshText } = {}) {
  const cachedEntry = readCachedEntry(url);
  const networkRequest = requestLatestText(url, cachedEntry)
    .then((latestText) => {
      if (
        cachedEntry?.text != null &&
        latestText !== cachedEntry.text &&
        typeof onFreshText === "function"
      ) {
        onFreshText(latestText);
      }
      return latestText;
    })
    .catch((error) => {
      if (cachedEntry?.text != null) {
        console.warn(`Using cached CSV after fetch failed for ${url}`, error);
        return cachedEntry.text;
      }
      throw error;
    });

  if (cachedEntry?.text != null) {
    void networkRequest;
    return cachedEntry.text;
  }

  return networkRequest;
}

export function readCachedCsvText(url) {
  return readCachedEntry(url)?.text ?? null;
}
