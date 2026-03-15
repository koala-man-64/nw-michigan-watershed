const { app } = require("@azure/functions");
const { getAzureMapsConfig } = require("../config");
const { createMapsSasToken } = require("../mapsTokenService");
const { extractRequestOrigin, isOriginAllowed } = require("../origin");

function createJsonResponse(status, body) {
  return {
    status,
    jsonBody: body,
    headers: {
      "Cache-Control": "no-store, private",
    },
  };
}

function logWarning(context, message, properties) {
  if (typeof context?.warn === "function") {
    context.warn(message, properties);
    return;
  }

  context?.log?.(message, properties);
}

function logError(context, message, error, properties) {
  if (typeof context?.error === "function") {
    context.error(message, error, properties);
    return;
  }

  context?.log?.(message, error, properties);
}

function createMapsTokenHandler(dependencies = {}) {
  const getConfig = dependencies.getConfig || getAzureMapsConfig;
  const issueToken = dependencies.issueToken || createMapsSasToken;

  return async function mapsTokenHandler(request, context) {
    const config = getConfig();

    if (!config.isValid) {
      logError(
        context,
        "Azure Maps token broker is misconfigured.",
        undefined,
        {
          missingSettings: config.missingSettings,
          invalidSettings: config.invalidSettings,
          invalidOrigins: config.invalidOrigins,
        }
      );

      return createJsonResponse(503, {
        error: "Azure Maps API is not configured correctly.",
      });
    }

    const { origin, source } = extractRequestOrigin(request);
    if (!origin || !isOriginAllowed(origin, config.allowedOrigins)) {
      logWarning(context, "Rejected Azure Maps token request for disallowed origin.", {
        origin,
        source,
      });

      return createJsonResponse(403, {
        error: "Origin is not allowed.",
      });
    }

    try {
      const tokenResponse = await issueToken(config, dependencies);

      context?.log?.("Issued Azure Maps SAS token.", {
        origin,
        source,
        expiresOnUtc: tokenResponse.expiresOnUtc,
        ttlMinutes: config.azureMapsSasTtlMinutes,
        maxRatePerSecond: config.azureMapsSasMaxRps,
      });

      return createJsonResponse(200, {
        token: tokenResponse.token,
        clientId: tokenResponse.clientId,
        expiresOnUtc: tokenResponse.expiresOnUtc,
      });
    } catch (error) {
      logError(context, "Azure Maps SAS issuance failed.", error, {
        origin,
        source,
      });

      return createJsonResponse(500, {
        error: "Failed to issue Azure Maps token.",
      });
    }
  };
}

const mapsTokenHandler = createMapsTokenHandler();

app.http("mapsToken", {
  route: "maps/token",
  methods: ["GET"],
  authLevel: "anonymous",
  handler: mapsTokenHandler,
});

module.exports = {
  createMapsTokenHandler,
  mapsTokenHandler,
};
