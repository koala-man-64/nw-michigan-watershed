const { AzureMapsManagementClient } = require("@azure/arm-maps");
const { ClientSecretCredential } = require("@azure/identity");

function buildSasParameters(config, now = new Date()) {
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

async function createMapsSasToken(config, dependencies = {}) {
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

module.exports = {
  buildSasParameters,
  createMapsSasToken,
};
