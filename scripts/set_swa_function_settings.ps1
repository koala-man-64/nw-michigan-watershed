[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$ResourceGroupName,

  [Parameter(Mandatory = $true)]
  [string]$StaticWebAppName,

  [string]$EnvironmentName,

  [string]$PublicBlobContainer = "nwmiws",

  [string]$PublicBlobs = "NWMIWS_Site_Data_testing_varied.csv,info.csv,locations.csv",

  [int]$ReadCsvMemoryCacheTtlSec = 900,

  [int]$ReadCsvBrowserCacheMaxAgeSec = 3600,

  [int]$ReadCsvBrowserCacheSwrSec = 86400,

  [string]$SubscriptionId
)

$ErrorActionPreference = "Stop"

$settingNames = @(
  "PUBLIC_BLOB_CONTAINER=$PublicBlobContainer",
  "PUBLIC_BLOBS=$PublicBlobs",
  "READ_CSV_MEMORY_CACHE_TTL_SEC=$ReadCsvMemoryCacheTtlSec",
  "READ_CSV_BROWSER_CACHE_MAX_AGE_SEC=$ReadCsvBrowserCacheMaxAgeSec",
  "READ_CSV_BROWSER_CACHE_SWR_SEC=$ReadCsvBrowserCacheSwrSec"
)

$args = @(
  "staticwebapp", "appsettings", "set",
  "--resource-group", $ResourceGroupName,
  "--name", $StaticWebAppName,
  "--setting-names"
)
$args += $settingNames
$args += "--only-show-errors"

if ($EnvironmentName) {
  $args += @("--environment-name", $EnvironmentName)
}
if ($SubscriptionId) {
  $args += @("--subscription", $SubscriptionId)
}

Write-Host "Applying Static Web App function settings..."
& az @args | Out-Null
Write-Host "Static Web App function settings updated."
