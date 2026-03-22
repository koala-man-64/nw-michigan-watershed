import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import {
  DEFAULT_SAS_MAX_RPS,
  DEFAULT_SAS_SIGNING_KEY,
  DEFAULT_SAS_TTL_MINUTES,
  getAzureMapsConfig,
  getPlatformRuntimeConfig,
  parseAllowedOrigins,
} from "../src/config";

test("parseAllowedOrigins keeps valid origins and reports invalid entries", () => {
  const result = parseAllowedOrigins("http://localhost:3000,notaurl,https://example.org");

  assert.deepEqual(result.allowedOrigins, [
    "http://localhost:3000",
    "https://example.org",
  ]);
  assert.deepEqual(result.invalidOrigins, ["notaurl"]);
});

test("getAzureMapsConfig applies defaults and marks missing settings", () => {
  const config = getAzureMapsConfig({});

  assert.equal(config.azureMapsSasTtlMinutes, DEFAULT_SAS_TTL_MINUTES);
  assert.equal(config.azureMapsSasMaxRps, DEFAULT_SAS_MAX_RPS);
  assert.equal(config.azureMapsSasSigningKey, DEFAULT_SAS_SIGNING_KEY);
  assert.equal(config.isValid, false);
  assert.ok(config.missingSettings.includes("AZURE_TENANT_ID"));
});

test("getPlatformRuntimeConfig resolves platform directories from the base data directory", () => {
  const dataDir = path.join("C:", "workspace", "data");
  const config = getPlatformRuntimeConfig({
    NWMIWS_PLATFORM_DATA_DIR: dataDir,
    NWMIWS_ADMIN_AUTH_MODE: "mock",
    NWMIWS_ADMIN_REQUIRED_ROLES: "admin,release-manager",
  } as NodeJS.ProcessEnv);

  assert.equal(config.dataDir, dataDir);
  assert.equal(config.platformDir, path.join(dataDir, "platform"));
  assert.equal(config.customersDir, path.join(dataDir, "platform", "customers"));
  assert.equal(config.datasetsDir, path.join(dataDir, "platform", "datasets"));
  assert.equal(config.sourceDataDir, path.join(dataDir, "source-data"));
  assert.equal(config.stateFilePath, path.join(dataDir, "platform-state.json"));
  assert.equal(config.adminAuthMode, "mock");
  assert.deepEqual(config.adminRequiredRoles, ["admin", "release-manager"]);
});
