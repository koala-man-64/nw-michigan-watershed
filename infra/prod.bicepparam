using './storage-data-path.bicep'

param storageAccountName = '<prod-storage-account-name>'
param publicContainerName = 'nwmiws'
param allowedOrigins = [
  'https://<prod-static-web-app>.azurestaticapps.net'
]
param corsMaxAgeSeconds = 86400
