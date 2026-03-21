param location string
param mapsAccountName string
param managedIdentityResourceId string
param allowedOrigins array
param tags object = {}
param disableLocalAuth bool = false

resource mapsAccount 'Microsoft.Maps/accounts@2023-06-01' = {
  name: mapsAccountName
  location: location
  kind: 'Gen2'
  sku: {
    name: 'G2'
  }
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${managedIdentityResourceId}': {}
    }
  }
  tags: tags
  properties: {
    disableLocalAuth: disableLocalAuth
    cors: {
      corsRules: [
        {
          allowedOrigins: allowedOrigins
        }
      ]
    }
  }
}

output resourceId string = mapsAccount.id
output clientId string = mapsAccount.properties.uniqueId
