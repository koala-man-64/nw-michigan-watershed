function getHeader(headers, name) {
  if (!headers || !name) {
    return undefined;
  }

  if (typeof headers.get === "function") {
    return headers.get(name) || headers.get(name.toLowerCase()) || undefined;
  }

  const targetName = String(name).toLowerCase();
  const entry = Object.entries(headers).find(([headerName]) => {
    return String(headerName).toLowerCase() === targetName;
  });

  return entry ? entry[1] : undefined;
}

function normalizeOrigin(value) {
  if (!value) {
    return null;
  }

  try {
    return new URL(String(value)).origin;
  } catch (error) {
    return null;
  }
}

function extractRequestOrigin(request) {
  const originHeader = getHeader(request?.headers, "origin");
  const normalizedOrigin = normalizeOrigin(originHeader);

  if (normalizedOrigin) {
    return {
      origin: normalizedOrigin,
      source: "origin",
    };
  }

  const refererHeader = getHeader(request?.headers, "referer");
  const normalizedRefererOrigin = normalizeOrigin(refererHeader);

  if (normalizedRefererOrigin) {
    return {
      origin: normalizedRefererOrigin,
      source: "referer",
    };
  }

  return {
    origin: null,
    source: null,
  };
}

function isOriginAllowed(origin, allowedOrigins) {
  const normalizedOrigin = normalizeOrigin(origin);
  return Boolean(normalizedOrigin && Array.isArray(allowedOrigins) && allowedOrigins.includes(normalizedOrigin));
}

module.exports = {
  extractRequestOrigin,
  getHeader,
  isOriginAllowed,
  normalizeOrigin,
};
