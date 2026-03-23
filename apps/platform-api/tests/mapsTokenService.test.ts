import assert from "node:assert/strict";
import test from "node:test";
import { buildSasParameters, createMapsSasToken } from "../src/mapsTokenService";
import { createAzureMapsConfig } from "./testSupport";

test("buildSasParameters uses the configured ttl and signing settings", () => {
  const config = createAzureMapsConfig({
    azureMapsSasTtlMinutes: 45,
    azureMapsSasMaxRps: 750,
    azureMapsSasSigningKey: "primaryKey",
    azureMapsUamiPrincipalId: "principal-id",
  });
  const now = new Date("2026-03-22T12:00:00.000Z");

  const parameters = buildSasParameters(config, now);

  assert.equal(parameters.principalId, "principal-id");
  assert.equal(parameters.maxRatePerSecond, 750);
  assert.equal(parameters.signingKey, "primaryKey");
  assert.equal(parameters.start, "2026-03-22T11:59:00.000Z");
  assert.equal(parameters.expiry, "2026-03-22T12:45:00.000Z");
});

test("createMapsSasToken returns the SAS token and client id", async () => {
  const config = createAzureMapsConfig();
  const response = await createMapsSasToken(config, {
    mapsClient: {
      accounts: {
        async listSas() {
          return {
            accountSasToken: "issued-token",
          };
        },
      },
    } as any,
    now: new Date("2026-03-22T12:00:00.000Z"),
  });

  assert.equal(response.token, "issued-token");
  assert.equal(response.clientId, "maps-client-id");
  assert.equal(response.expiresOnUtc, "2026-03-22T12:30:00.000Z");
});

test("createMapsSasToken throws when Azure Maps does not return a token", async () => {
  const config = createAzureMapsConfig();

  await assert.rejects(
    () =>
      createMapsSasToken(config, {
        mapsClient: {
          accounts: {
            async listSas() {
              return {
                accountSasToken: "",
              };
            },
          },
        } as any,
      }),
    /did not return a SAS token/
  );
});
