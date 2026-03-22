import path from "node:path";
import { normalizeOrigin } from "./origin";

const DEFAULT_SAS_TTL_MINUTES = 30;
const DEFAULT_SAS_MAX_RPS = 500;
const DEFAULT_SAS_SIGNING_KEY = "secondaryKey";
const DEFAULT_ADMIN_REQUIRED_ROLE = "admin";
const VALID_SIGNING_KEYS = new Set(["primaryKey", "secondaryKey", "managedIdentity"]);

export type AdminAuthMode = "mock" | "swa";

function parsePositiveInt(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseAdminAuthMode(value: unknown): AdminAuthMode {
  return String(value ?? "").trim().toLowerCase() === "mock" ? "mock" : "swa";
}

function parseStringList(value: unknown, fallback: string[]): string[] {
  const items = String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return items.length ? Array.from(new Set(items)) : fallback;
}

function parseAllowedOrigins(value: unknown): {
  allowedOrigins: string[];
  invalidOrigins: string[];
} {
  const rawOrigins = String(value ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  const allowedOrigins: string[] = [];
  const invalidOrigins: string[] = [];

  for (const origin of rawOrigins) {
    const normalizedOrigin = normalizeOrigin(origin);
    if (normalizedOrigin) {
      allowedOrigins.push(normalizedOrigin);
    } else {
      invalidOrigins.push(origin);
    }
  }

  return { allowedOrigins, invalidOrigins };
}

export interface PlatformRuntimeConfig {
  dataDir: string;
  platformDir: string;
  customersDir: string;
  datasetsDir: string;
  releasesDir: string;
  sourceDataDir: string;
  stateFilePath: string;
  defaultCustomerId: string;
  adminAuthMode: AdminAuthMode;
  adminRequiredRoles: string[];
}

export interface AzureMapsConfig {
  azureTenantId: string;
  azureClientId: string;
  azureClientSecret: string;
  azureMapsSubscriptionId: string;
  azureMapsResourceGroup: string;
  azureMapsAccountName: string;
  azureMapsAccountClientId: string;
  azureMapsUamiPrincipalId: string;
  azureMapsSasTtlMinutes: number;
  azureMapsSasMaxRps: number;
  azureMapsSasSigningKey: string;
  allowedOrigins: string[];
  missingSettings: string[];
  invalidSettings: string[];
  invalidOrigins: string[];
  isValid: boolean;
}

export function getPlatformRuntimeConfig(env: NodeJS.ProcessEnv = process.env): PlatformRuntimeConfig {
  const dataDir = String(env.NWMIWS_PLATFORM_DATA_DIR || "").trim() || path.join(process.cwd(), "data");
  const platformDir = path.join(dataDir, "platform");
  return {
    dataDir,
    platformDir,
    customersDir: path.join(platformDir, "customers"),
    datasetsDir: path.join(platformDir, "datasets"),
    releasesDir: path.join(platformDir, "releases"),
    sourceDataDir: String(env.NWMIWS_PLATFORM_SOURCE_DATA_DIR || "").trim() || path.join(dataDir, "source-data"),
    stateFilePath: String(env.NWMIWS_PLATFORM_STATE_FILE || "").trim() || path.join(dataDir, "platform-state.json"),
    defaultCustomerId: String(env.NWMIWS_PLATFORM_DEFAULT_CUSTOMER_ID || "nwmiws").trim() || "nwmiws",
    adminAuthMode: parseAdminAuthMode(env.NWMIWS_ADMIN_AUTH_MODE),
    adminRequiredRoles: parseStringList(env.NWMIWS_ADMIN_REQUIRED_ROLES, [DEFAULT_ADMIN_REQUIRED_ROLE]),
  };
}

export function getAzureMapsConfig(env: NodeJS.ProcessEnv = process.env): AzureMapsConfig {
  const missingSettings: string[] = [];
  const invalidSettings: string[] = [];

  const signingKey = String(env.AZURE_MAPS_SAS_SIGNING_KEY || DEFAULT_SAS_SIGNING_KEY).trim();
  if (!VALID_SIGNING_KEYS.has(signingKey)) {
    invalidSettings.push("AZURE_MAPS_SAS_SIGNING_KEY");
  }

  const { allowedOrigins, invalidOrigins } = parseAllowedOrigins(env.AZURE_MAPS_ALLOWED_ORIGINS);

  const config: Omit<AzureMapsConfig, "missingSettings" | "invalidSettings" | "invalidOrigins" | "isValid"> = {
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

  const requiredSettings: Record<string, string> = {
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

export { DEFAULT_SAS_MAX_RPS, DEFAULT_SAS_SIGNING_KEY, DEFAULT_SAS_TTL_MINUTES, parseAllowedOrigins };
