[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$StorageAccountName,

  [string]$ContainerName = "nwmiws",

  [string[]]$BlobNames = @(
    "NWMIWS_Site_Data_testing_varied.csv",
    "info.csv",
    "locations.csv"
  ),

  [string]$ContentType = "text/csv",

  [string]$CacheControl = "public, max-age=3600, stale-while-revalidate=86400",

  [string]$SubscriptionId
)

$ErrorActionPreference = "Stop"

if (-not $BlobNames -or $BlobNames.Count -eq 0) {
  throw "BlobNames must include at least one blob."
}

foreach ($blobName in $BlobNames) {
  $args = @(
    "storage", "blob", "update",
    "--account-name", $StorageAccountName,
    "--auth-mode", "login",
    "--container-name", $ContainerName,
    "--name", $blobName,
    "--content-type", $ContentType,
    "--content-cache-control", $CacheControl,
    "--only-show-errors"
  )

  if ($SubscriptionId) {
    $args += @("--subscription", $SubscriptionId)
  }

  Write-Host "Updating blob headers: $blobName"
  & az @args | Out-Null
}

Write-Host "Blob cache header updates completed."
