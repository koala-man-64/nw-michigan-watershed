@{
  SubscriptionId = "<subscription-id>"
  TenantId = "<tenant-id>"
  ResourceGroupName = "<azure-resource-group>"
  Location = "eastus"
  StaticWebAppName = "<existing-prod-static-web-app-name>"
  StaticWebAppResourceGroupName = "<existing-prod-static-web-app-resource-group>"
  ApplicationInsightsName = "<existing-prod-application-insights-name>"
  ApplicationInsightsResourceGroupName = "<existing-prod-application-insights-resource-group>"
  AzureMapsAccountName = "nwmiws-prod-maps"
  ManagedIdentityName = "nwmiws-prod-maps-uami"
  AppRegistrationDisplayName = "nwmiws-azure-maps-prod"
  AllowedOrigins = @(
    "https://<prod-static-web-app>.azurestaticapps.net"
    "https://<custom-domain>"
  )
  SasTtlMinutes = 30
  SasMaxRps = 500
  SasSigningKey = "secondaryKey"
  DisableLocalAuth = $false
  Tags = @{
    Application = "nw-michigan-watershed"
    Environment = "prod"
    ManagedBy = "PowerShell"
  }
}
