@{
  SubscriptionId = "eabd0bb1-8f36-4f27-ad86-8b33e02aaeb9"
  TenantId = "355ae10d-1fc8-4e87-bb01-7822419d7c3b"
  ResourceGroupName = "nwmiws-rg"
  Location = "eastus"
  StaticWebAppName = "nwmiws-sbx"
  StaticWebAppResourceGroupName = "nwmiws-rg"
  StaticWebAppLocation = "eastus2"
  StaticWebAppSku = "Free"
  ApplicationInsightsName = "appi-nwmiws-sbx"
  ApplicationInsightsResourceGroupName = "nwmiws-rg"
  AzureMapsAccountName = "nwmiws-sbx-maps"
  ManagedIdentityName = "nwmiws-sbx-maps-uami"
  AppRegistrationDisplayName = "nwmiws-azure-maps-sbx"
  AllowedOrigins = @(
    "http://localhost:4280"
  )
  SasTtlMinutes = 30
  SasMaxRps = 500
  SasSigningKey = "secondaryKey"
  DisableLocalAuth = $false
  Tags = @{
    Application = "nw-michigan-watershed"
    Environment = "sbx"
    ManagedBy = "PowerShell"
  }
}
