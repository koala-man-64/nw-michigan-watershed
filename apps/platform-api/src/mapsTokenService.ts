import { AzureMapsManagementClient } from "@azure/arm-maps";
import { ClientSecretCredential } from "@azure/identity";
import type { AzureMapsConfig } from "./config";

export interface MapsSasTokenResponse {
  token: string;
  clientId: string;
  expiresOnUtc: string;
  sasParameters: {
    principalId: string;
    maxRatePerSecond: number;
    signingKey: string;
    start: string;
    expiry: string;
  };
}

function buildSasParameters(config: AzureMapsConfig, now = new Date()) {
  const start = new Date(now.getTime() - 60 * 1000);
  const expiry = new Date(now.getTime() + config.azureMapsSasTtlMinutes * 60 * 1000);

  return {
    principalId: config.azureMapsUamiPrincipalId,
    maxRatePerSecond: config.azureMapsSasMaxRps,
    signingKey: config.azureMapsSasSigningKey,
    start: start.toISOString(),
    expiry: expiry.toISOString(),
  };
}

async function createMapsSasToken(
  config: AzureMapsConfig,
  dependencies: {
    credential?: ClientSecretCredential;
    mapsClient?: AzureMapsManagementClient;
    now?: Date;
  } = {}
): Promise<MapsSasTokenResponse> {
  const credential =
    dependencies.credential ||
    new ClientSecretCredential(
      config.azureTenantId,
      config.azureClientId,
      config.azureClientSecret
    );
  const mapsClient =
    dependencies.mapsClient ||
    new AzureMapsManagementClient(credential, config.azureMapsSubscriptionId);
  const sasParameters = buildSasParameters(config, dependencies.now || new Date());
  const response = await mapsClient.accounts.listSas(
    config.azureMapsResourceGroup,
    config.azureMapsAccountName,
    sasParameters
  );

  const token = String(response?.accountSasToken || "").trim();
  if (!token) {
    throw new Error("Azure Maps listSas did not return a SAS token.");
  }

  return {
    token,
    clientId: config.azureMapsAccountClientId,
    expiresOnUtc: sasParameters.expiry,
    sasParameters,
  };
}

export { buildSasParameters, createMapsSasToken };
