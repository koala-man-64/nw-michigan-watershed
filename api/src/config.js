const { normalizeOrigin } = require("./origin");

const DEFAULT_SAS_TTL_MINUTES = 30;
const DEFAULT_SAS_MAX_RPS = 500;
const DEFAULT_SAS_SIGNING_KEY = "secondaryKey";
const VALID_SIGNING_KEYS = new Set(["primaryKey", "secondaryKey", "managedIdentity"]);

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value || "").trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseAllowedOrigins(value) {
  const rawOrigins = String(value || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  const allowedOrigins = [];
  const invalidOrigins = [];

  for (const origin of rawOrigins) {
    const normalizedOrigin = normalizeOrigin(origin);
    if (normalizedOrigin) {
      allowedOrigins.push(normalizedOrigin);
    } else {
      invalidOrigins.push(origin);
    }
  }

  return {
    allowedOrigins,
    invalidOrigins,
  };
}

function getAzureMapsConfig(env = process.env) {
  const missingSettings = [];
  const invalidSettings = [];

  const signingKey = String(env.AZURE_MAPS_SAS_SIGNING_KEY || DEFAULT_SAS_SIGNING_KEY).trim();
  if (!VALID_SIGNING_KEYS.has(signingKey)) {
    invalidSettings.push("AZURE_MAPS_SAS_SIGNING_KEY");
  }

  const { allowedOrigins, invalidOrigins } = parseAllowedOrigins(env.AZURE_MAPS_ALLOWED_ORIGINS);

  const config = {
    azureTenantId: String(env.AZURE_TENANT_ID || "").trim(),
    azureClientId: String(env.AZURE_CLIENT_ID || "").trim(),
    azureClientSecret: String(env.AZURE_CLIENT_SECRET || "").trim(),
    azureMapsSubscriptionId: String(env.AZURE_MAPS_SUBSCRIPTION_ID || "").trim(),
    azureMapsResourceGroup: String(env.AZURE_MAPS_RESOURCE_GROUP || "").trim(),
    azureMapsAccountName: String(env.AZURE_MAPS_ACCOUNT_NAME || "").trim(),
    azureMapsAccountClientId: String(env.AZURE_MAPS_ACCOUNT_CLIENT_ID || "").trim(),
    azureMapsUamiPrincipalId: String(env.AZURE_MAPS_UAMI_PRINCIPAL_ID || "").trim(),
    azureMapsSasTtlMinutes: parsePositiveInt(
      env.AZURE_MAPS_SAS_TTL_MINUTES,
      DEFAULT_SAS_TTL_MINUTES
    ),
    azureMapsSasMaxRps: parsePositiveInt(env.AZURE_MAPS_SAS_MAX_RPS, DEFAULT_SAS_MAX_RPS),
    azureMapsSasSigningKey: signingKey,
    allowedOrigins,
  };

  const requiredSettings = {
    AZURE_TENANT_ID: config.azureTenantId,
    AZURE_CLIENT_ID: config.azureClientId,
    AZURE_CLIENT_SECRET: config.azureClientSecret,
    AZURE_MAPS_SUBSCRIPTION_ID: config.azureMapsSubscriptionId,
    AZURE_MAPS_RESOURCE_GROUP: config.azureMapsResourceGroup,
    AZURE_MAPS_ACCOUNT_NAME: config.azureMapsAccountName,
    AZURE_MAPS_ACCOUNT_CLIENT_ID: config.azureMapsAccountClientId,
    AZURE_MAPS_UAMI_PRINCIPAL_ID: config.azureMapsUamiPrincipalId,
  };

  for (const [settingName, settingValue] of Object.entries(requiredSettings)) {
    if (!settingValue) {
      missingSettings.push(settingName);
    }
  }

  if (!allowedOrigins.length) {
    missingSettings.push("AZURE_MAPS_ALLOWED_ORIGINS");
  }

  if (invalidOrigins.length) {
    invalidSettings.push("AZURE_MAPS_ALLOWED_ORIGINS");
  }

  return {
    ...config,
    missingSettings,
    invalidSettings,
    invalidOrigins,
    isValid: missingSettings.length === 0 && invalidSettings.length === 0,
  };
}

module.exports = {
  DEFAULT_SAS_MAX_RPS,
  DEFAULT_SAS_SIGNING_KEY,
  DEFAULT_SAS_TTL_MINUTES,
  getAzureMapsConfig,
  parseAllowedOrigins,
};
