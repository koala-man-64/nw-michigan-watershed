[CmdletBinding()]
param(
  [Parameter(Mandatory)]
  [ValidateSet("dev", "prod")]
  [string]$Environment,

  [string]$Path = (Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) "api/local.settings.json"),

  [int]$LocalHttpPort = 9091
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Import-Module (Join-Path $PSScriptRoot "Common.psm1") -Force

$environmentPath = Join-Path $PSScriptRoot ("environments/{0}.psd1" -f $Environment)

function Get-EnvironmentConfig {
  param([string]$ConfigPath)

  if (-not (Test-Path -LiteralPath $ConfigPath)) {
    throw "Environment configuration file was not found: $ConfigPath"
  }

  return Import-PowerShellDataFile -LiteralPath $ConfigPath
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

  if ($InputObject.PSObject.Properties.Match("properties").Count -gt 0) {
    $properties = $InputObject.properties
    if ($properties -is [System.Collections.IDictionary]) {
      foreach ($key in $properties.Keys) {
        $settings[[string]$key] = [string]$properties[$key]
      }
      return $settings
    }

    foreach ($property in $properties.PSObject.Properties) {
      $settings[[string]$property.Name] = [string]$property.Value
    }
    return $settings
  }

  foreach ($item in (ConvertTo-ArrayCompat -InputObject $InputObject)) {
    if (
      $null -ne $item -and
      $item.PSObject.Properties.Match("name").Count -gt 0 -and
      $item.name
    ) {
      $value = if ($item.PSObject.Properties.Match("value").Count -gt 0) { $item.value } else { $null }
      if (
        $null -eq $value -and
        $item.PSObject.Properties.Match("properties").Count -gt 0 -and
        $item.properties.PSObject.Properties.Match("value").Count -gt 0
      ) {
        $value = $item.properties.value
      }

      $settings[[string]$item.name] = [string]$value
    }
  }

  return $settings
}

$config = Get-EnvironmentConfig -ConfigPath $environmentPath

Ensure-AzCli
Require-AzLogin
Set-Subscription -SubscriptionId $config.SubscriptionId

$swaSettings = ConvertTo-SettingHashtable -InputObject (Invoke-AzJson -Arguments @(
    "staticwebapp",
    "appsettings",
    "list",
    "--name",
    $config.StaticWebAppName,
    "--resource-group",
    $config.StaticWebAppResourceGroupName
  ))

$requiredSettings = @(
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

foreach ($setting in $requiredSettings) {
  if (-not $swaSettings.ContainsKey($setting) -or [string]::IsNullOrWhiteSpace([string]$swaSettings[$setting])) {
    throw "Static Web App setting '$setting' is missing. Run Deploy-AzureMapsStack.ps1 first."
  }
}

$output = [ordered]@{
  IsEncrypted = $false
  Host = @{
    LocalHttpPort = $LocalHttpPort
  }
  Values = [ordered]@{
    FUNCTIONS_WORKER_RUNTIME = "node"
    AzureWebJobsStorage = "UseDevelopmentStorage=true"
  }
}

foreach ($setting in $requiredSettings) {
  $output.Values[$setting] = [string]$swaSettings[$setting]
}

$targetDirectory = Split-Path -Parent $Path
if (-not (Test-Path -LiteralPath $targetDirectory)) {
  New-Item -ItemType Directory -Path $targetDirectory -Force | Out-Null
}

ConvertTo-JsonCompat -InputObject $output -Depth 10 | Set-Content -LiteralPath $Path -Encoding utf8
Write-Host "Wrote local Azure Maps settings to '$Path'."
