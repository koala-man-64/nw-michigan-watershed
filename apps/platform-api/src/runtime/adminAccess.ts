import type { HttpRequest, HttpRequestUser, HttpResponseInit } from "@azure/functions";
import type { AdminAuthMode, PlatformRuntimeConfig } from "../config";
import { jsonResponse } from "./response";

interface RequestLike extends Partial<HttpRequest> {}

interface StaticWebAppsClaimsPrincipalData {
  [key: string]: unknown;
  identityProvider?: string;
  userId?: string;
  userDetails?: string;
  userRoles?: unknown;
  roles?: unknown;
}

export interface AuthorizedAdminRequest {
  actor: string;
  authMode: AdminAuthMode;
  identityProvider?: string;
  principalId?: string;
  roles: string[];
}

type AdminAuthorizationResult =
  | { authorized: true; access: AuthorizedAdminRequest }
  | { authorized: false; response: HttpResponseInit };

function getHeader(request: RequestLike, name: string): string | undefined {
  const headers = request.headers as unknown;
  if (!headers || !name) {
    return undefined;
  }

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

  const headerContainer = headers as Record<string, string | undefined>;
  const targetName = String(name).toLowerCase();
  const entry = Object.entries(headerContainer).find(
    ([headerName]) => String(headerName).toLowerCase() === targetName
  );
  return entry ? entry[1] : undefined;
}

function normalizeRoles(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((item) => String(item ?? "").trim())
        .filter(Boolean)
    )
  );
}

function decodeClientPrincipalHeader(request: RequestLike): HttpRequestUser | null {
  const headerValue = getHeader(request, "x-ms-client-principal");
  if (!headerValue) {
    return null;
  }

  try {
    const claimsPrincipalData = JSON.parse(
      Buffer.from(headerValue, "base64").toString("utf8")
    ) as StaticWebAppsClaimsPrincipalData;

    if (!claimsPrincipalData.identityProvider) {
      return null;
    }

    return {
      type: "StaticWebApps",
      id: String(claimsPrincipalData.userId ?? "").trim(),
      username: String(claimsPrincipalData.userDetails ?? "").trim(),
      identityProvider: String(claimsPrincipalData.identityProvider ?? "").trim(),
      claimsPrincipalData,
    };
  } catch {
    return null;
  }
}

function getRequestUser(request: RequestLike): HttpRequestUser | null {
  return request.user ?? decodeClientPrincipalHeader(request);
}

function getUserRoles(user: HttpRequestUser | null): string[] {
  if (!user) {
    return [];
  }

  const claimsPrincipalData = (user.claimsPrincipalData ?? {}) as StaticWebAppsClaimsPrincipalData;
  return normalizeRoles(claimsPrincipalData.userRoles ?? claimsPrincipalData.roles);
}

function getMockActor(request: RequestLike): string {
  return (
    request.user?.username ||
    getHeader(request, "x-user-name") ||
    getHeader(request, "x-ms-client-principal-name") ||
    getHeader(request, "x-ms-client-principal-id") ||
    "mock-admin"
  );
}

export function authorizeAdminRequest(
  request: RequestLike,
  runtimeConfig: PlatformRuntimeConfig
): AdminAuthorizationResult {
  if (runtimeConfig.adminAuthMode === "mock") {
    return {
      authorized: true,
      access: {
        actor: getMockActor(request),
        authMode: "mock",
        identityProvider: request.user?.identityProvider,
        principalId: request.user?.id,
        roles: runtimeConfig.adminRequiredRoles,
      },
    };
  }

  const user = getRequestUser(request);
  if (!user || !user.id || !user.username) {
    return {
      authorized: false,
      response: jsonResponse(401, {
        error: "authentication_required",
        message: "Admin access requires an authenticated principal.",
      }),
    };
  }

  const roles = getUserRoles(user);
  const isAuthorized = runtimeConfig.adminRequiredRoles.some((requiredRole) =>
    roles.includes(requiredRole)
  );

  if (!isAuthorized) {
    return {
      authorized: false,
      response: jsonResponse(403, {
        error: "forbidden",
        message: "Admin access requires one of the configured roles.",
        requiredRoles: runtimeConfig.adminRequiredRoles,
      }),
    };
  }

  return {
    authorized: true,
    access: {
      actor: user.username,
      authMode: runtimeConfig.adminAuthMode,
      identityProvider: user.identityProvider,
      principalId: user.id,
      roles,
    },
  };
}
