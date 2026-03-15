[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [Parameter(Mandatory)]
  [ValidateSet("dev", "prod")]
  [string]$Environment,

  [switch]$RotateClientSecret
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Import-Module (Join-Path $PSScriptRoot "Common.psm1") -Force

$contributorRoleDefinitionId = "b24988ac-6180-42a0-ab88-20f7382dd24c"
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$environmentPath = Join-Path $PSScriptRoot ("environments/{0}.psd1" -f $Environment)
$templateFile = Join-Path $repoRoot "infra/azuremaps/main.bicep"
$whatIfMode = [bool]$WhatIfPreference

function Get-EnvironmentConfig {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    throw "Environment configuration file was not found: $Path"
  }

  return Import-PowerShellDataFile -LiteralPath $Path
}

function Assert-ExistingStaticWebApp {
  param([hashtable]$Config)

  $null = Invoke-AzJson -Arguments @(
    "staticwebapp",
    "show",
    "--name",
    $Config.StaticWebAppName,
    "--resource-group",
    $Config.StaticWebAppResourceGroupName
  )
}

function Assert-ExistingApplicationInsights {
  param([hashtable]$Config)

  $null = Invoke-AzJson -Arguments @(
    "monitor",
    "app-insights",
    "component",
    "show",
    "--app",
    $Config.ApplicationInsightsName,
    "--resource-group",
    $Config.ApplicationInsightsResourceGroupName
  )
}

function ConvertTo-SettingHashtable {
  param([object]$InputObject)

  $settings = @{}

  if ($null -eq $InputObject) {
    return $settings
  }

  if ($InputObject -is [System.Collections.IDictionary]) {
    foreach ($key in $InputObject.Keys) {
      $settings[[string]$key] = [string]$InputObject[$key]
    }
    return $settings
  }

  foreach ($item in @($InputObject)) {
    $name = $item.name
    if (-not $name) {
      continue
    }

    $value = $item.value
    if ($null -eq $value -and $item.PSObject.Properties.Match("properties").Count -gt 0) {
      $value = $item.properties.value
    }

    $settings[[string]$name] = [string]$value
  }

  return $settings
}

function Get-StaticWebAppSettings {
  param([hashtable]$Config)

  $rawSettings = Invoke-AzJson -Arguments @(
    "staticwebapp",
    "appsettings",
    "list",
    "--name",
    $Config.StaticWebAppName,
    "--resource-group",
    $Config.StaticWebAppResourceGroupName
  )

  return ConvertTo-SettingHashtable -InputObject $rawSettings
}

function Get-OrCreate-AppRegistration {
  param(
    [hashtable]$Config,
    [bool]$WhatIfMode
  )

  $existingApps = @(Invoke-AzJson -Arguments @(
      "ad",
      "app",
      "list",
      "--display-name",
      $Config.AppRegistrationDisplayName
    ))

  $matchingApps = @($existingApps | Where-Object { $_.displayName -eq $Config.AppRegistrationDisplayName })
  if ($matchingApps.Count -gt 1) {
    throw "Multiple Entra applications matched display name '$($Config.AppRegistrationDisplayName)'."
  }

  if ($matchingApps.Count -eq 0) {
    if ($WhatIfMode) {
      Write-Host "WhatIf: would create Entra application '$($Config.AppRegistrationDisplayName)'."
      return @{
        AppId = "<generated-on-apply>"
        AppObjectId = "<generated-on-apply>"
        ServicePrincipalObjectId = "<generated-on-apply>"
      }
    }

    Write-Host "Creating Entra application '$($Config.AppRegistrationDisplayName)'..."
    $app = Invoke-AzJson -Arguments @(
      "ad",
      "app",
      "create",
      "--display-name",
      $Config.AppRegistrationDisplayName,
      "--sign-in-audience",
      "AzureADMyOrg"
    )
  } else {
    $app = $matchingApps[0]
  }

  $servicePrincipal = Invoke-AzJson -Arguments @("ad", "sp", "show", "--id", $app.appId) -AllowFailure
  if ($null -eq $servicePrincipal) {
    if ($WhatIfMode) {
      Write-Host "WhatIf: would create service principal for app '$($Config.AppRegistrationDisplayName)'."
      $servicePrincipal = [pscustomobject]@{ id = "<generated-on-apply>" }
    } else {
      Write-Host "Creating service principal for app '$($Config.AppRegistrationDisplayName)'..."
      $servicePrincipal = Invoke-AzJson -Arguments @("ad", "sp", "create", "--id", $app.appId)
    }
  }

  return @{
    AppId = [string]$app.appId
    AppObjectId = [string]$app.id
    ServicePrincipalObjectId = [string]$servicePrincipal.id
  }
}

function Ensure-RoleAssignment {
  param(
    [string]$PrincipalObjectId,
    [string]$PrincipalType,
    [string]$RoleDefinitionId,
    [string]$Scope,
    [bool]$WhatIfMode
  )

  if ($WhatIfMode) {
    Write-Host "WhatIf: would create role assignment '$RoleDefinitionId' on '$Scope'."
    return
  }

  $existingAssignments = @(Invoke-AzJson -Arguments @(
      "role",
      "assignment",
      "list",
      "--assignee-object-id",
      $PrincipalObjectId,
      "--role",
      $RoleDefinitionId,
      "--scope",
      $Scope
    ))

  if ($existingAssignments.Count -gt 0) {
    return
  }

  $null = Invoke-AzJson -Arguments @(
    "role",
    "assignment",
    "create",
    "--assignee-object-id",
    $PrincipalObjectId,
    "--assignee-principal-type",
    $PrincipalType,
    "--role",
    $RoleDefinitionId,
    "--scope",
    $Scope
  )
}

function Get-OrCreate-ClientSecret {
  param(
    [hashtable]$Config,
    [hashtable]$CurrentSettings,
    [string]$AppId,
    [switch]$RotateClientSecret,
    [bool]$WhatIfMode
  )

  if (-not $RotateClientSecret -and $CurrentSettings.ContainsKey("AZURE_CLIENT_SECRET") -and $CurrentSettings.AZURE_CLIENT_SECRET) {
    return [string]$CurrentSettings.AZURE_CLIENT_SECRET
  }

  if ($WhatIfMode) {
    Write-Host "WhatIf: would create a new Entra client secret for '$($Config.AppRegistrationDisplayName)'."
    return "<generated-on-apply>"
  }

  $credentialDisplayName = "nwmiws-azure-maps-$Environment"
  $endDate = (Get-Date).ToUniversalTime().AddDays(180).ToString("yyyy-MM-ddTHH:mm:ssZ")

  Write-Host "Creating a new Entra client secret that expires on $endDate..."
  return Invoke-Az -Arguments @(
    "ad",
    "app",
    "credential",
    "reset",
    "--id",
    $AppId,
    "--append",
    "--display-name",
    $credentialDisplayName,
    "--end-date",
    $endDate,
    "--query",
    "password",
    "--output",
    "tsv"
  )
}

$config = Get-EnvironmentConfig -Path $environmentPath

Ensure-AzCli
Require-AzLogin
Set-Subscription -SubscriptionId $config.SubscriptionId
Ensure-ProviderRegistered -Namespace "Microsoft.Maps"
Ensure-ProviderRegistered -Namespace "Microsoft.ManagedIdentity"
Ensure-BicepAvailable

Write-Host "Validating prerequisite resources..."
Assert-ExistingStaticWebApp -Config $config
Assert-ExistingApplicationInsights -Config $config

$deploymentParameters = @{
  location = $config.Location
  mapsAccountName = $config.AzureMapsAccountName
  managedIdentityName = $config.ManagedIdentityName
  allowedOrigins = @($config.AllowedOrigins)
  tags = $config.Tags
  disableLocalAuth = [bool]$config.DisableLocalAuth
}
$parameterFile = New-TemporaryJsonFile -InputObject $deploymentParameters

try {
  if ($whatIfMode) {
    Write-Host "Running Azure deployment what-if..."
    $null = Invoke-Az -Arguments @(
      "deployment",
      "group",
      "what-if",
      "--resource-group",
      $config.ResourceGroupName,
      "--template-file",
      $templateFile,
      "--parameters",
      "@$parameterFile"
    )
  }

  $deploymentOutputs = $null
  if (-not $whatIfMode) {
    Write-Host "Deploying Azure Maps infrastructure..."
    $deploymentResult = Invoke-AzJson -Arguments @(
      "deployment",
      "group",
      "create",
      "--resource-group",
      $config.ResourceGroupName,
      "--template-file",
      $templateFile,
      "--parameters",
      "@$parameterFile"
    )
    $deploymentOutputs = $deploymentResult.properties.outputs
  }

  $mapsAccount = if ($deploymentOutputs) {
    [pscustomobject]@{
      Id = [string]$deploymentOutputs.mapsAccountId.value
      ClientId = [string]$deploymentOutputs.mapsAccountClientId.value
      ManagedIdentityPrincipalId = [string]$deploymentOutputs.managedIdentityPrincipalId.value
    }
  } else {
    $mapsAccountResource = Invoke-AzJson -Arguments @(
      "maps",
      "account",
      "show",
      "--name",
      $config.AzureMapsAccountName,
      "--resource-group",
      $config.ResourceGroupName
    ) -AllowFailure
    $managedIdentity = Invoke-AzJson -Arguments @(
      "identity",
      "show",
      "--name",
      $config.ManagedIdentityName,
      "--resource-group",
      $config.ResourceGroupName
    ) -AllowFailure
    [pscustomobject]@{
      Id = if ($mapsAccountResource) { [string]$mapsAccountResource.id } else { "<created-on-apply>" }
      ClientId = if ($mapsAccountResource) { [string]$mapsAccountResource.properties.uniqueId } else { "<created-on-apply>" }
      ManagedIdentityPrincipalId = if ($managedIdentity) { [string]$managedIdentity.principalId } else { "<created-on-apply>" }
    }
  }

  $appRegistration = Get-OrCreate-AppRegistration -Config $config -WhatIfMode $whatIfMode
  Ensure-RoleAssignment `
    -PrincipalObjectId $appRegistration.ServicePrincipalObjectId `
    -PrincipalType "ServicePrincipal" `
    -RoleDefinitionId $contributorRoleDefinitionId `
    -Scope $mapsAccount.Id `
    -WhatIfMode $whatIfMode

  $existingSettings = Get-StaticWebAppSettings -Config $config
  $clientSecret = Get-OrCreate-ClientSecret `
    -Config $config `
    -CurrentSettings $existingSettings `
    -AppId $appRegistration.AppId `
    -RotateClientSecret:$RotateClientSecret `
    -WhatIfMode $whatIfMode

  $settingsToApply = [ordered]@{
    AZURE_TENANT_ID = [string]$config.TenantId
    AZURE_CLIENT_ID = [string]$appRegistration.AppId
    AZURE_CLIENT_SECRET = [string]$clientSecret
    AZURE_MAPS_SUBSCRIPTION_ID = [string]$config.SubscriptionId
    AZURE_MAPS_RESOURCE_GROUP = [string]$config.ResourceGroupName
    AZURE_MAPS_ACCOUNT_NAME = [string]$config.AzureMapsAccountName
    AZURE_MAPS_ACCOUNT_CLIENT_ID = [string]$mapsAccount.ClientId
    AZURE_MAPS_UAMI_PRINCIPAL_ID = [string]$mapsAccount.ManagedIdentityPrincipalId
    AZURE_MAPS_ALLOWED_ORIGINS = [string](@($config.AllowedOrigins) -join ",")
    AZURE_MAPS_SAS_TTL_MINUTES = [string]$config.SasTtlMinutes
    AZURE_MAPS_SAS_MAX_RPS = [string]$config.SasMaxRps
    AZURE_MAPS_SAS_SIGNING_KEY = [string]$config.SasSigningKey
  }

  if ($whatIfMode) {
    Write-Host "WhatIf: would update Static Web App app settings for '$($config.StaticWebAppName)'."
  } else {
    Write-Host "Updating Static Web App app settings..."
    $settingArguments = @(
      "staticwebapp",
      "appsettings",
      "set",
      "--name",
      $config.StaticWebAppName,
      "--resource-group",
      $config.StaticWebAppResourceGroupName,
      "--setting-names"
    )
    $settingArguments += @($settingsToApply.GetEnumerator() | ForEach-Object { "{0}={1}" -f $_.Key, $_.Value })
    $null = Invoke-AzJson -Arguments $settingArguments
  }

  Write-Host ""
  Write-Host "Azure Maps deployment summary"
  Write-Host "  Environment:              $Environment"
  Write-Host "  Maps account:             $($config.AzureMapsAccountName)"
  Write-Host "  Maps client ID:           $($mapsAccount.ClientId)"
  Write-Host "  Static Web App:           $($config.StaticWebAppName)"
  Write-Host "  Entra application:        $($config.AppRegistrationDisplayName)"
  Write-Host "  Client secret in SWA:     $(Mask-Secret -Secret $clientSecret)"
  Write-Host "  Allowed origins:          $(@($config.AllowedOrigins) -join ', ')"
} finally {
  if (Test-Path -LiteralPath $parameterFile) {
    Remove-Item -LiteralPath $parameterFile -Force
  }
}
