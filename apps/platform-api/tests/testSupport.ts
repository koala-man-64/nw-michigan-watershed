import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { HttpRequestUser } from "@azure/functions";
import { getPlatformRuntimeConfig, type AzureMapsConfig } from "../src/config";
import type { PlatformRuntimeConfig } from "../src/config";
import fixtureSupport from "../../../test-support/fixtures/index.cjs";

interface TestRuntimeFixture {
  rootDir: string;
  runtimeConfig: PlatformRuntimeConfig;
}

export function createRuntimeFixture(
  overrides: Partial<PlatformRuntimeConfig> = {}
): TestRuntimeFixture {
  const rootDir = mkdtempSync(path.join(os.tmpdir(), "nwmiws-platform-api-"));
  const baseConfig = getPlatformRuntimeConfig();
  return {
    rootDir,
    runtimeConfig: {
      ...baseConfig,
      dataDir: rootDir,
      sourceDataDir: path.join(process.cwd(), "data", "source-data"),
      stateFilePath: path.join(rootDir, "platform-state.json"),
      adminAuthMode: "mock",
      ...overrides,
    },
  };
}

export function cleanupRuntimeFixture(fixture: TestRuntimeFixture) {
  rmSync(fixture.rootDir, { recursive: true, force: true });
}

export function writeFixtureState(
  runtimeConfig: PlatformRuntimeConfig,
  fixtureName = "platform-state.json"
) {
  const platformState = fixtureSupport.readTextFixture(fixtureName);
  writeFileSync(runtimeConfig.stateFilePath, platformState, "utf8");
}

export function createContext() {
  return {
    log() {},
    warn() {},
    error() {},
  } as any;
}

export function createJsonRequest(
  body: unknown,
  options: {
    url?: string;
    params?: Record<string, string>;
    headers?: Record<string, string>;
    user?: HttpRequestUser | null;
  } = {}
) {
  return {
    url: options.url || "https://example.com/",
    params: options.params || {},
    headers: new Headers(options.headers || {}),
    user: options.user,
    json: async () => body,
  };
}

export function createSwaHeaders(userRoles: string[]) {
  const principal = Buffer.from(
    JSON.stringify({
      identityProvider: "aad",
      userId: "user-123",
      userDetails: "admin@example.com",
      userRoles,
    }),
    "utf8"
  ).toString("base64");

  return {
    "x-ms-client-principal": principal,
  };
}

export function createAzureMapsConfig(
  overrides: Partial<AzureMapsConfig> = {}
): AzureMapsConfig {
  return {
    isValid: true,
    allowedOrigins: ["https://portal.example.com"],
    azureMapsSasTtlMinutes: 30,
    azureMapsSasMaxRps: 500,
    azureMapsSasSigningKey: "secondaryKey",
    azureTenantId: "tenant-id",
    azureClientId: "client-id",
    azureClientSecret: "client-secret",
    azureMapsSubscriptionId: "subscription-id",
    azureMapsResourceGroup: "rg-name",
    azureMapsAccountName: "maps-name",
    azureMapsAccountClientId: "maps-client-id",
    azureMapsUamiPrincipalId: "uami-principal-id",
    missingSettings: [],
    invalidSettings: [],
    invalidOrigins: [],
    ...overrides,
  };
}

export function readJsonFixture<T = unknown>(fixtureName: string): T {
  return fixtureSupport.readJsonFixture<T>(fixtureName);
}
