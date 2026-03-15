const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DEFAULT_SAS_MAX_RPS,
  DEFAULT_SAS_SIGNING_KEY,
  DEFAULT_SAS_TTL_MINUTES,
  getAzureMapsConfig,
} = require("../src/config");

test("getAzureMapsConfig applies defaults and normalizes origins", () => {
  const config = getAzureMapsConfig({
    AZURE_TENANT_ID: "tenant-id",
    AZURE_CLIENT_ID: "client-id",
    AZURE_CLIENT_SECRET: "client-secret",
    AZURE_MAPS_SUBSCRIPTION_ID: "subscription-id",
    AZURE_MAPS_RESOURCE_GROUP: "rg-name",
    AZURE_MAPS_ACCOUNT_NAME: "maps-name",
    AZURE_MAPS_ACCOUNT_CLIENT_ID: "maps-client-id",
    AZURE_MAPS_UAMI_PRINCIPAL_ID: "uami-principal-id",
    AZURE_MAPS_ALLOWED_ORIGINS: "http://localhost:4280, https://dev.example.com/path",
  });

  assert.equal(config.azureMapsSasTtlMinutes, DEFAULT_SAS_TTL_MINUTES);
  assert.equal(config.azureMapsSasMaxRps, DEFAULT_SAS_MAX_RPS);
  assert.equal(config.azureMapsSasSigningKey, DEFAULT_SAS_SIGNING_KEY);
  assert.deepEqual(config.allowedOrigins, [
    "http://localhost:4280",
    "https://dev.example.com",
  ]);
  assert.equal(config.isValid, true);
});

test("getAzureMapsConfig flags invalid origins and signing keys", () => {
  const config = getAzureMapsConfig({
    AZURE_TENANT_ID: "tenant-id",
    AZURE_CLIENT_ID: "client-id",
    AZURE_CLIENT_SECRET: "client-secret",
    AZURE_MAPS_SUBSCRIPTION_ID: "subscription-id",
    AZURE_MAPS_RESOURCE_GROUP: "rg-name",
    AZURE_MAPS_ACCOUNT_NAME: "maps-name",
    AZURE_MAPS_ACCOUNT_CLIENT_ID: "maps-client-id",
    AZURE_MAPS_UAMI_PRINCIPAL_ID: "uami-principal-id",
    AZURE_MAPS_ALLOWED_ORIGINS: "not-a-url",
    AZURE_MAPS_SAS_SIGNING_KEY: "bad-key",
  });

  assert.equal(config.isValid, false);
  assert.deepEqual(config.invalidOrigins, ["not-a-url"]);
  assert.deepEqual(config.invalidSettings.sort(), [
    "AZURE_MAPS_ALLOWED_ORIGINS",
    "AZURE_MAPS_SAS_SIGNING_KEY",
  ]);
});
