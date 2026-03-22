[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [Parameter(Mandatory)]
  [ValidateSet("sbx", "dev", "prod")]
  [string]$Environment,

  [switch]$KeepAppRegistration
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Import-Module (Join-Path $PSScriptRoot "..\common\Az.Common.psm1") -Force -DisableNameChecking
Import-Module (Join-Path $PSScriptRoot "..\common\Repo.Common.psm1") -Force -DisableNameChecking

$contributorRoleDefinitionId = "b24988ac-6180-42a0-ab88-20f7382dd24c"
$repoRoot = Get-WorkspaceRoot -StartPath $PSScriptRoot
$environmentPath = Join-Path $repoRoot ("scripts/environments/{0}.psd1" -f $Environment)
$appSettingNames = @(
  "AZURE_TENANT_ID",
  "AZURE_CLIENT_ID",
  "AZURE_CLIENT_SECRET",
  "AZURE_MAPS_SUBSCRIPTION_ID",
  "AZURE_MAPS_RESOURCE_GROUP",
  "AZURE_MAPS_ACCOUNT_NAME",
  "AZURE_MAPS_ACCOUNT_CLIENT_ID",
  "AZURE_MAPS_UAMI_PRINCIPAL_ID",
  "AZURE_MAPS_ALLOWED_ORIGINS",
  "AZURE_MAPS_SAS_TTL_MINUTES",
  "AZURE_MAPS_SAS_MAX_RPS",
  "AZURE_MAPS_SAS_SIGNING_KEY"
)
$whatIfMode = [bool]$WhatIfPreference

function Get-EnvironmentConfig {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    throw "Environment configuration file was not found: $Path"
  }

  return Import-PowerShellDataFile -LiteralPath $Path
}

$config = Get-EnvironmentConfig -Path $environmentPath

Ensure-AzCli
Require-AzLogin
Set-Subscription -SubscriptionId $config.SubscriptionId

$mapsAccount = Invoke-AzJson -Arguments @(
  "maps",
  "account",
  "show",
  "--name",
  $config.AzureMapsAccountName,
  "--resource-group",
  $config.ResourceGroupName
) -AllowFailure

$entraApps = @(ConvertTo-ArrayCompat -InputObject (Invoke-AzJson -Arguments @("ad", "app", "list", "--display-name", $config.AppRegistrationDisplayName)))
$appRegistration = @($entraApps | Where-Object { $_.displayName -eq $config.AppRegistrationDisplayName }) | Select-Object -First 1
$servicePrincipal = $null
if ($appRegistration) {
  $servicePrincipal = Invoke-AzJson -Arguments @("ad", "sp", "show", "--id", $appRegistration.appId) -AllowFailure
}

if ($mapsAccount -and $servicePrincipal) {
  $assignments = @(ConvertTo-ArrayCompat -InputObject (Invoke-AzJson -Arguments @(
      "role",
      "assignment",
      "list",
      "--assignee-object-id",
      $servicePrincipal.id,
      "--role",
      $contributorRoleDefinitionId,
      "--scope",
      $mapsAccount.id
    )))

  foreach ($assignment in $assignments) {
    if ($whatIfMode) {
      Write-Host "WhatIf: would remove role assignment '$($assignment.id)'."
    } else {
      $null = Invoke-Az -Arguments @("role", "assignment", "delete", "--ids", $assignment.id)
    }
  }
}

if ($whatIfMode) {
  Write-Host "WhatIf: would delete Azure Maps app settings from '$($config.StaticWebAppName)'."
} else {
  $settingArguments = @(
    "staticwebapp",
    "appsettings",
    "delete",
    "--name",
    $config.StaticWebAppName,
    "--resource-group",
    $config.StaticWebAppResourceGroupName,
    "--setting-names"
  )
  $settingArguments += $appSettingNames
  $null = Invoke-Az -Arguments $settingArguments
}

if ($mapsAccount) {
  if ($whatIfMode) {
    Write-Host "WhatIf: would delete Azure Maps account '$($config.AzureMapsAccountName)'."
  } else {
    $null = Invoke-Az -Arguments @(
      "maps",
      "account",
      "delete",
      "--name",
      $config.AzureMapsAccountName,
      "--resource-group",
      $config.ResourceGroupName,
      "--yes"
    )
  }
}

$managedIdentity = Invoke-AzJson -Arguments @(
  "identity",
  "show",
  "--name",
  $config.ManagedIdentityName,
  "--resource-group",
  $config.ResourceGroupName
) -AllowFailure
if ($managedIdentity) {
  if ($whatIfMode) {
    Write-Host "WhatIf: would delete managed identity '$($config.ManagedIdentityName)'."
  } else {
    $null = Invoke-Az -Arguments @(
      "identity",
      "delete",
      "--name",
      $config.ManagedIdentityName,
      "--resource-group",
      $config.ResourceGroupName
    )
  }
}

if (-not $KeepAppRegistration -and $appRegistration) {
  if ($whatIfMode) {
    Write-Host "WhatIf: would delete Entra application '$($config.AppRegistrationDisplayName)'."
  } else {
    if ($servicePrincipal) {
      $null = Invoke-Az -Arguments @("ad", "sp", "delete", "--id", $appRegistration.appId) -AllowFailure
    }

    $null = Invoke-Az -Arguments @("ad", "app", "delete", "--id", $appRegistration.id) -AllowFailure
  }
}

Write-Host "Azure Maps teardown completed for '$Environment'."
