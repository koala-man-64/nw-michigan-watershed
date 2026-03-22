import assert from "node:assert/strict";
import test from "node:test";
import { createMapsTokenHandler } from "../src/runtime/handlers";

function createContext() {
  return {
    log() {},
    warn() {},
    error() {},
  } as any;
}

test("maps token handler returns a SAS token for allowed origins", async () => {
  const handler = createMapsTokenHandler({
    getAzureMapsConfig: () => ({
      isValid: true,
      allowedOrigins: ["https://app.example.com"],
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
    }),
    issueMapsToken: async () => ({
      token: "sas-token",
      clientId: "maps-client-id",
      expiresOnUtc: "2099-01-01T00:30:00Z",
      sasParameters: {
        principalId: "uami-principal-id",
        maxRatePerSecond: 500,
        signingKey: "secondaryKey",
        start: "2099-01-01T00:00:00Z",
        expiry: "2099-01-01T00:30:00Z",
      },
    }),
  });

  const response = await handler(
    {
      headers: new Headers({
        origin: "https://app.example.com",
      }),
    },
    createContext()
  );

  assert.equal(response.status, 200);
  assert.deepEqual(response.jsonBody, {
    token: "sas-token",
    clientId: "maps-client-id",
    expiresOnUtc: "2099-01-01T00:30:00Z",
  });
});

test("maps token handler rejects disallowed origins", async () => {
  const handler = createMapsTokenHandler({
    getAzureMapsConfig: () => ({
      isValid: true,
      allowedOrigins: ["https://app.example.com"],
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
    }),
    issueMapsToken: async () => {
      throw new Error("should not be called");
    },
  });

  const response = await handler(
    {
      headers: new Headers({
        referer: "https://evil.example.com/page",
      }),
    },
    createContext()
  );

  assert.equal(response.status, 403);
  assert.deepEqual(response.jsonBody, {
    error: "Origin is not allowed.",
  });
});

test("maps token handler returns 503 when configuration is invalid", async () => {
  const handler = createMapsTokenHandler({
    getAzureMapsConfig: () => ({
      isValid: false,
      allowedOrigins: [],
      azureMapsSasTtlMinutes: 30,
      azureMapsSasMaxRps: 500,
      azureMapsSasSigningKey: "secondaryKey",
      azureTenantId: "",
      azureClientId: "",
      azureClientSecret: "",
      azureMapsSubscriptionId: "",
      azureMapsResourceGroup: "",
      azureMapsAccountName: "",
      azureMapsAccountClientId: "",
      azureMapsUamiPrincipalId: "",
      missingSettings: ["AZURE_CLIENT_SECRET"],
      invalidSettings: [],
      invalidOrigins: [],
    }),
  });

  const response = await handler(
    {
      headers: new Headers({
        origin: "https://app.example.com",
      }),
    },
    createContext()
  );

  assert.equal(response.status, 503);
  assert.deepEqual(response.jsonBody, {
    error: "Azure Maps API is not configured correctly.",
  });
});
