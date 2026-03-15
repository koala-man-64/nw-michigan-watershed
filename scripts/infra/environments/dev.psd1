@{
  SubscriptionId = "<subscription-id>"
  TenantId = "<tenant-id>"
  ResourceGroupName = "<azure-resource-group>"
  Location = "eastus"
  StaticWebAppName = "<existing-dev-static-web-app-name>"
  StaticWebAppResourceGroupName = "<existing-dev-static-web-app-resource-group>"
  ApplicationInsightsName = "<existing-dev-application-insights-name>"
  ApplicationInsightsResourceGroupName = "<existing-dev-application-insights-resource-group>"
  AzureMapsAccountName = "nwmiws-dev-maps"
  ManagedIdentityName = "nwmiws-dev-maps-uami"
  AppRegistrationDisplayName = "nwmiws-azure-maps-dev"
  AllowedOrigins = @(
    "http://localhost:4280"
    "https://<dev-static-web-app>.azurestaticapps.net"
  )
  SasTtlMinutes = 30
  SasMaxRps = 500
  SasSigningKey = "secondaryKey"
  DisableLocalAuth = $false
  Tags = @{
    Application = "nw-michigan-watershed"
    Environment = "dev"
    ManagedBy = "PowerShell"
  }
}
