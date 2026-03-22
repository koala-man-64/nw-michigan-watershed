function getHeader(headers: unknown, name: string): string | undefined {
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
  const entry = Object.entries(headerContainer).find(([headerName]) => {
    return String(headerName).toLowerCase() === targetName;
  });

  return entry ? entry[1] : undefined;
}

function normalizeOrigin(value: unknown): string | null {
  if (!value) {
    return null;
  }

  try {
    return new URL(String(value)).origin;
  } catch {
    return null;
  }
}

function extractRequestOrigin(request: { headers?: unknown } | undefined): {
  origin: string | null;
  source: "origin" | "referer" | null;
} {
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

function isOriginAllowed(origin: string | null, allowedOrigins: string[]): boolean {
  const normalizedOrigin = normalizeOrigin(origin);
  return Boolean(normalizedOrigin && Array.isArray(allowedOrigins) && allowedOrigins.includes(normalizedOrigin));
}

export { extractRequestOrigin, getHeader, isOriginAllowed, normalizeOrigin };
