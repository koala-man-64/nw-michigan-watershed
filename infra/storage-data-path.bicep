@description('Existing storage account name that hosts public CSV data.')
param storageAccountName string

@description('Container that serves public CSV files.')
param publicContainerName string = 'nwmiws'

@description('Allowed browser origins for blob CORS.')
param allowedOrigins array

@description('CORS max age in seconds.')
@minValue(1)
param corsMaxAgeSeconds int = 86400

@description('Allowed request headers for blob CORS.')
param allowedHeaders array = [
  '*'
]

@description('Exposed response headers for blob CORS.')
param exposedHeaders array = [
  'ETag'
  'Last-Modified'
  'Cache-Control'
  'Content-Type'
  'Content-Disposition'
]

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' existing = {
  name: storageAccountName
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storageAccount
  name: 'default'
  properties: {
    cors: {
      corsRules: [
        {
          allowedOrigins: allowedOrigins
          allowedMethods: [
            'GET'
            'HEAD'
            'OPTIONS'
          ]
          allowedHeaders: allowedHeaders
          exposedHeaders: exposedHeaders
          maxAgeInSeconds: corsMaxAgeSeconds
        }
      ]
    }
  }
}

resource publicContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: publicContainerName
  properties: {
    publicAccess: 'Blob'
  }
}

output configuredContainer string = publicContainer.name
