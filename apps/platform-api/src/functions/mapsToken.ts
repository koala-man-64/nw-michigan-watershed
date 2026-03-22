import type { HttpRequest, InvocationContext } from "@azure/functions";
import { getAzureMapsConfig } from "../config";
import { createMapsSasToken } from "../mapsTokenService";
import { extractRequestOrigin, isOriginAllowed } from "../origin";
import { jsonResponse } from "../runtime/response";

function logWarning(context: InvocationContext, message: string, properties: Record<string, unknown>) {
  if (typeof context.warn === "function") {
    context.warn(message, properties);
    return;
  }

  context.log(message, properties);
}

function logError(
  context: InvocationContext,
  message: string,
  error: unknown,
  properties: Record<string, unknown>
) {
  if (typeof context.error === "function") {
    context.error(message, error, properties);
    return;
  }

  context.log(message, error, properties);
}

export function createMapsTokenHandler(
  dependencies: {
    getConfig?: typeof getAzureMapsConfig;
    issueToken?: typeof createMapsSasToken;
  } = {}
) {
  const getConfig = dependencies.getConfig || getAzureMapsConfig;
  const issueToken = dependencies.issueToken || createMapsSasToken;

  return async function mapsTokenHandler(request: HttpRequest, context: InvocationContext) {
    const config = getConfig();

    if (!config.isValid) {
      logError(context, "Azure Maps token broker is misconfigured.", undefined, {
        missingSettings: config.missingSettings,
        invalidSettings: config.invalidSettings,
        invalidOrigins: config.invalidOrigins,
      });

      return jsonResponse(503, {
        error: "Azure Maps API is not configured correctly.",
      });
    }

    const { origin, source } = extractRequestOrigin(request);
    if (!origin || !isOriginAllowed(origin, config.allowedOrigins)) {
      logWarning(context, "Rejected Azure Maps token request for disallowed origin.", {
        origin,
        source,
      });

      return jsonResponse(403, {
        error: "Origin is not allowed.",
      });
    }

    try {
      const tokenResponse = await issueToken(config);

      context.log("Issued Azure Maps SAS token.", {
        origin,
        source,
        expiresOnUtc: tokenResponse.expiresOnUtc,
        ttlMinutes: config.azureMapsSasTtlMinutes,
        maxRatePerSecond: config.azureMapsSasMaxRps,
      });

      return jsonResponse(200, {
        token: tokenResponse.token,
        clientId: tokenResponse.clientId,
        expiresOnUtc: tokenResponse.expiresOnUtc,
      });
    } catch (error) {
      logError(context, "Azure Maps SAS issuance failed.", error, {
        origin,
        source,
      });

      return jsonResponse(500, {
        error: "Failed to issue Azure Maps token.",
      });
    }
  };
}
