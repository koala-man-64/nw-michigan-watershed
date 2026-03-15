using './storage-data-path.bicep'

param storageAccountName = '<dev-storage-account-name>'
param publicContainerName = 'nwmiws'
param allowedOrigins = [
  'https://<dev-static-web-app>.azurestaticapps.net'
  'http://localhost:3000'
  'http://127.0.0.1:3000'
]
param corsMaxAgeSeconds = 86400
