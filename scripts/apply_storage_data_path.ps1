[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$ResourceGroupName,

  [ValidateSet("dev", "prod")]
  [string]$Environment,

  [string]$ParametersFile,

  [string]$StorageAccountName,

  [string]$PublicContainerName = "nwmiws",

  [string[]]$AllowedOrigins = @(
    "http://localhost:3000",
    "http://127.0.0.1:3000"
  ),

  [int]$CorsMaxAgeSeconds = 86400,

  [string]$SubscriptionId
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $PSCommandPath
$templateFile = Join-Path $scriptDir "..\infra\storage-data-path.bicep"
if (-not (Test-Path $templateFile)) {
  throw "Template file not found: $templateFile"
}

if (-not $ParametersFile -and $Environment) {
  $candidate = Join-Path $scriptDir "..\infra\$Environment.bicepparam"
  if (Test-Path $candidate) {
    $ParametersFile = $candidate
  } else {
    $legacyCandidate = Join-Path $scriptDir "..\infra\env\$Environment.bicepparam"
    if (Test-Path $legacyCandidate) {
      $ParametersFile = $legacyCandidate
    } else {
      throw "Parameter file not found for environment '$Environment': $candidate"
    }
  }
}

$baseArgs = @("deployment", "group", "create", "--resource-group", $ResourceGroupName, "--template-file", $templateFile, "--only-show-errors")
if ($SubscriptionId) {
  $baseArgs += @("--subscription", $SubscriptionId)
}

if ($ParametersFile) {
  $resolvedParamFile = Resolve-Path $ParametersFile
  if ($resolvedParamFile.Path.ToLowerInvariant().EndsWith(".bicepparam")) {
    $baseArgs += @("--parameters", $resolvedParamFile.Path)
  } else {
    $baseArgs += @("--parameters", "@$($resolvedParamFile.Path)")
  }
} else {
  if (-not $StorageAccountName) {
    throw "StorageAccountName is required when ParametersFile is not provided."
  }
  if (-not $AllowedOrigins -or $AllowedOrigins.Count -eq 0) {
    throw "AllowedOrigins must include at least one origin when ParametersFile is not provided."
  }

  $allowedOriginsJson = $AllowedOrigins | ConvertTo-Json -Compress
  $baseArgs += @(
    "--parameters",
    "storageAccountName=$StorageAccountName",
    "publicContainerName=$PublicContainerName",
    "corsMaxAgeSeconds=$CorsMaxAgeSeconds",
    "allowedOrigins=$allowedOriginsJson"
  )
}

Write-Host "Applying storage data-path configuration..."
& az @baseArgs | Out-Null
Write-Host "Storage data-path configuration applied."
