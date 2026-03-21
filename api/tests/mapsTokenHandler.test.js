const test = require("node:test");
const assert = require("node:assert/strict");
const { createMapsTokenHandler } = require("../src/functions/mapsToken");

function createHeaders(values) {
  return {
    get(name) {
      return values[String(name).toLowerCase()] || undefined;
    },
  };
}

function createContext() {
  return {
    log() {},
    warn() {},
    error() {},
  };
}

const validConfig = {
  isValid: true,
  allowedOrigins: ["https://app.example.com"],
  azureMapsSasTtlMinutes: 30,
  azureMapsSasMaxRps: 500,
};

test("maps token handler returns a SAS token for allowed origins", async () => {
  const handler = createMapsTokenHandler({
    getConfig: () => validConfig,
    issueToken: async () => ({
      token: "sas-token",
      clientId: "maps-client-id",
      expiresOnUtc: "2099-01-01T00:30:00Z",
    }),
  });

  const response = await handler(
    {
      headers: createHeaders({
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
  assert.equal(response.headers["Cache-Control"], "no-store, private");
});

test("maps token handler rejects disallowed origins", async () => {
  const handler = createMapsTokenHandler({
    getConfig: () => validConfig,
    issueToken: async () => {
      throw new Error("should not be called");
    },
  });

  const response = await handler(
    {
      headers: createHeaders({
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
    getConfig: () => ({
      isValid: false,
      missingSettings: ["AZURE_CLIENT_SECRET"],
      invalidSettings: [],
      invalidOrigins: [],
    }),
  });

  const response = await handler(
    {
      headers: createHeaders({
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
