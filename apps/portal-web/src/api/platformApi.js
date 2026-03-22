function ensureOk(response, resourceName) {
  if (response.ok) {
    return response;
  }

  throw new Error(`${resourceName} request failed with ${response.status}.`);
}

async function fetchJson(url, resourceName, fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== "function") {
    throw new Error(`Fetch API is unavailable for ${resourceName}.`);
  }

  const response = await fetchImpl(url, {
    headers: {
      Accept: "application/json",
    },
  });

  ensureOk(response, resourceName);
  const payload = await response.json();
  return payload?.items ?? payload;
}

export function fetchPortalBootstrap(endpoint, fetchImpl) {
  return fetchJson(endpoint, "portal bootstrap", fetchImpl);
}

export function fetchSites(endpoint, fetchImpl) {
  return fetchJson(endpoint, "sites", fetchImpl);
}

export function fetchParameters(endpoint, fetchImpl) {
  return fetchJson(endpoint, "parameters", fetchImpl);
}

export function fetchMeasurements(endpoint, fetchImpl) {
  return fetchJson(endpoint, "measurements", fetchImpl);
}
