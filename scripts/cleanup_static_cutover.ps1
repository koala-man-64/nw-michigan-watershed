#requires -Version 5.1
<#
.SYNOPSIS
Validates the static-data deployment and removes the retired Blob/API infrastructure.

.DESCRIPTION
This script is meant to run only after the static-data build has been deployed.
It loads configuration from a local `.env` file by default, validates each deployed
Static Web App base URL with `validate_static_data.py`, deletes the legacy Azure
Static Web App app settings, deletes the dedicated storage account(s), and removes
obsolete GitHub Actions repository secrets.

Configuration discovery order:
1. `-EnvFilePath` if provided
2. `<repo>/.env`
3. `<repo>/.env.local`
4. `<repo>/api/.env`

The parser supports both dotenv syntax (`KEY=value`) and the repo's legacy
`KEY: "value"` format.

Recommended minimal `.env`:
  STATIC_CUTOVER_VALIDATION_BASE_URLS=https://<dev>.azurestaticapps.net,https://<prod>.azurestaticapps.net
  STATIC_CUTOVER_GITHUB_TOKEN=<github-token>
  STATIC_CUTOVER_SUBSCRIPTION_ID=<subscription-id>

If the script has Azure access, it can derive the Static Web App names/resource
groups and storage account details from those validation URLs and the live SWA app
settings. Explicit `.env` values still win when present.

GitHub secret cleanup uses the GitHub REST API and requires a token with permission
to delete repository Actions secrets. A classic PAT needs `repo`; a fine-grained
PAT needs repository Secrets write permission.

Use `-WhatIf` first.

.EXAMPLE
.\scripts\cleanup_static_cutover.ps1 -WhatIf

.EXAMPLE
.\scripts\cleanup_static_cutover.ps1 -EnvFilePath .\api\.env -Confirm:$false
#>
[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = "High")]
param(
  [string]$EnvFilePath,

  [string[]]$ValidationBaseUrls = @(),

  [string[]]$StaticWebAppNames = @(),

  [string[]]$StaticWebAppResourceGroups = @(),

  [string[]]$StaticWebAppEnvironmentNames = @(),

  [string[]]$StorageAccountNames = @(),

  [string[]]$StorageAccountResourceGroups = @(),

  [string]$SubscriptionId,

  [string]$GitHubRepository,

  [string]$GitHubToken,

  [string[]]$LegacyStaticWebAppSettingNames = @(
    "STORAGE_ACCOUNT_URL",
    "BLOB_CONN",
    "PUBLIC_BLOB_CONTAINER",
    "PUBLIC_BLOBS",
    "READ_CSV_MEMORY_CACHE_TTL_SEC",
    "READ_CSV_BROWSER_CACHE_MAX_AGE_SEC",
    "READ_CSV_BROWSER_CACHE_SWR_SEC"
  ),

  [string[]]$LegacyGitHubSecretNames = @(
    "REACT_APP_PUBLIC_DATA_BASE_URL_DEV",
    "REACT_APP_PUBLIC_DATA_BASE_URL_PROD"
  ),

  [switch]$SkipValidation,

  [switch]$SkipAzureCleanup,

  [switch]$SkipGitHubSecretCleanup
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function ConvertTo-StringArray {
  param(
    [AllowNull()]
    [object]$Value
  )

  if ($null -eq $Value) {
    return [string[]]@()
  }

  if ($Value -is [System.Array]) {
    return [string[]]@(
      foreach ($item in $Value) {
        $text = [string]$item
        if (-not [string]::IsNullOrWhiteSpace($text)) {
          $text.Trim()
        }
      }
    )
  }

  $raw = [string]$Value
  if ([string]::IsNullOrWhiteSpace($raw)) {
    return [string[]]@()
  }

  $trimmed = $raw.Trim()
  if ($trimmed.StartsWith("[") -and $trimmed.EndsWith("]")) {
    try {
      $json = $trimmed | ConvertFrom-Json -ErrorAction Stop
      return ConvertTo-StringArray -Value $json
    } catch {
    }
  }

  return [string[]]@(
    foreach ($item in ($trimmed -split "[`r`n,]")) {
      if (-not [string]::IsNullOrWhiteSpace($item)) {
        $item.Trim()
      }
    }
  )
}

function ConvertTo-BoolValue {
  param(
    [AllowNull()]
    [string]$Value,

    [Parameter(Mandatory = $true)]
    [string]$SettingName
  )

  if ([string]::IsNullOrWhiteSpace($Value)) {
    return $false
  }

  switch -Regex ($Value.Trim().ToLowerInvariant()) {
    "^(1|true|yes|y|on)$" { return $true }
    "^(0|false|no|n|off)$" { return $false }
    default { throw "Setting '$SettingName' must be a boolean-like value. Received '$Value'." }
  }
}

function Expand-StringArray {
  param(
    [AllowNull()]
    [string[]]$Values,

    [Parameter(Mandatory = $true)]
    [int]$DesiredCount,

    [Parameter(Mandatory = $true)]
    [string]$ParameterName,

    [string]$DefaultValue = ""
  )

  if ($DesiredCount -lt 1) {
    return [string[]]@()
  }

  if ($null -eq $Values -or $Values.Count -eq 0) {
    return [string[]]@(for ($i = 0; $i -lt $DesiredCount; $i++) { $DefaultValue })
  }

  if ($Values.Count -eq $DesiredCount) {
    return [string[]]$Values
  }

  if ($Values.Count -eq 1 -and $DesiredCount -gt 1) {
    return [string[]]@(for ($i = 0; $i -lt $DesiredCount; $i++) { [string]$Values[0] })
  }

  throw "Parameter '$ParameterName' must contain either 1 value or $DesiredCount values. Received $($Values.Count)."
}

function Resolve-PythonCommand {
  $python = Get-Command python -ErrorAction SilentlyContinue
  if ($python) {
    return @{
      FilePath = $python.Source
      PrefixArguments = @()
    }
  }

  $py = Get-Command py -ErrorAction SilentlyContinue
  if ($py) {
    return @{
      FilePath = $py.Source
      PrefixArguments = @("-3")
    }
  }

  throw "Python was not found on PATH. Install Python or ensure 'python' or 'py' is available before running cleanup."
}

function Resolve-GitHubRepository {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RepositoryRoot,

    [string]$RepositoryOverride
  )

  if ($RepositoryOverride) {
    return $RepositoryOverride.Trim()
  }

  $originUrl = git -C $RepositoryRoot remote get-url origin
  if ($LASTEXITCODE -ne 0 -or -not $originUrl) {
    throw "Unable to determine the GitHub repository from the origin remote. Pass -GitHubRepository explicitly."
  }

  $match = [regex]::Match(
    $originUrl.Trim(),
    "github\.com[:/](?<owner>[^/]+)/(?<repo>[^/]+?)(?:\.git)?$"
  )
  if (-not $match.Success) {
    throw "Origin remote '$originUrl' is not a supported GitHub URL. Pass -GitHubRepository explicitly."
  }

  return "$($match.Groups['owner'].Value)/$($match.Groups['repo'].Value)"
}

function Get-HttpStatusCode {
  param($Exception)

  if ($null -eq $Exception -or $null -eq $Exception.Response) {
    return $null
  }

  try {
    return [int]$Exception.Response.StatusCode
  } catch {
    return $null
  }
}

function Resolve-EnvFile {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RepositoryRoot,

    [string]$PathOverride
  )

  $candidates = @()
  if ($PathOverride) {
    $candidates += $PathOverride
  } else {
    $candidates += (Join-Path $RepositoryRoot ".env")
    $candidates += (Join-Path $RepositoryRoot ".env.local")
    $candidates += (Join-Path $RepositoryRoot "api\.env")
  }

  foreach ($candidate in $candidates) {
    if (-not [string]::IsNullOrWhiteSpace($candidate) -and (Test-Path $candidate)) {
      return (Resolve-Path $candidate).Path
    }
  }

  if ($PathOverride) {
    throw "Env file '$PathOverride' was not found."
  }

  return $null
}

function Read-EnvironmentFile {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  $values = @{}
  foreach ($rawLine in [System.IO.File]::ReadAllLines($Path)) {
    $line = $rawLine.Trim()
    if ([string]::IsNullOrWhiteSpace($line) -or $line.StartsWith("#")) {
      continue
    }

    if ($line.StartsWith("export ")) {
      $line = $line.Substring(7).Trim()
    }

    $match = [regex]::Match($line, "^(?<key>[A-Za-z_][A-Za-z0-9_]*)\s*(?:=|:)\s*(?<value>.*)$")
    if (-not $match.Success) {
      continue
    }

    $key = $match.Groups["key"].Value.Trim()
    $value = $match.Groups["value"].Value.Trim()
    if (
      ($value.StartsWith('"') -and $value.EndsWith('"')) -or
      ($value.StartsWith("'") -and $value.EndsWith("'"))
    ) {
      $value = $value.Substring(1, $value.Length - 2)
    }

    $values[$key] = $value
  }

  return $values
}

function Get-ConfigValue {
  param(
    [Parameter(Mandatory = $true)]
    [hashtable]$Config,

    [Parameter(Mandatory = $true)]
    [string[]]$Names
  )

  foreach ($name in $Names) {
    if ($Config.ContainsKey($name) -and -not [string]::IsNullOrWhiteSpace([string]$Config[$name])) {
      return [string]$Config[$name]
    }

    $envValue = [Environment]::GetEnvironmentVariable($name)
    if (-not [string]::IsNullOrWhiteSpace($envValue)) {
      return $envValue
    }
  }

  return $null
}

function Get-ConfiguredString {
  param(
    [AllowNull()]
    [string]$ExplicitValue,

    [Parameter(Mandatory = $true)]
    [hashtable]$Config,

    [Parameter(Mandatory = $true)]
    [string[]]$Names
  )

  if (-not [string]::IsNullOrWhiteSpace($ExplicitValue)) {
    return $ExplicitValue.Trim()
  }

  return Get-ConfigValue -Config $Config -Names $Names
}

function Get-ConfiguredStringArray {
  param(
    [AllowNull()]
    [string[]]$ExplicitValue,

    [Parameter(Mandatory = $true)]
    [hashtable]$Config,

    [Parameter(Mandatory = $true)]
    [string[]]$Names
  )

  if ($null -ne $ExplicitValue -and $ExplicitValue.Count -gt 0) {
    return [string[]]$ExplicitValue
  }

  return ConvertTo-StringArray -Value (Get-ConfigValue -Config $Config -Names $Names)
}

function Get-ConfiguredSwitchValue {
  param(
    [Parameter(Mandatory = $true)]
    [bool]$ExplicitValue,

    [Parameter(Mandatory = $true)]
    [bool]$WasExplicitlyBound,

    [Parameter(Mandatory = $true)]
    [hashtable]$Config,

    [Parameter(Mandatory = $true)]
    [string[]]$Names
  )

  if ($WasExplicitlyBound) {
    return $ExplicitValue
  }

  foreach ($name in $Names) {
    $configuredValue = Get-ConfigValue -Config $Config -Names @($name)
    if (-not [string]::IsNullOrWhiteSpace($configuredValue)) {
      return ConvertTo-BoolValue -Value $configuredValue -SettingName $name
    }
  }

  return $ExplicitValue
}

function Get-AzOutput {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Arguments
  )

  $output = & az @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Azure CLI command failed: az $($Arguments -join ' ')"
  }

  return $output
}

function Get-AzJson {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Arguments
  )

  $output = Get-AzOutput -Arguments $Arguments
  if ([string]::IsNullOrWhiteSpace(($output | Out-String))) {
    return $null
  }

  return ($output | ConvertFrom-Json)
}

function ConvertTo-Hashtable {
  param(
    [AllowNull()]
    [object]$InputObject
  )

  $result = @{}
  if ($null -eq $InputObject) {
    return $result
  }

  if ($InputObject -is [hashtable]) {
    return $InputObject
  }

  foreach ($property in $InputObject.PSObject.Properties) {
    $result[$property.Name] = $property.Value
  }

  return $result
}

function Test-AzureCliReady {
  param(
    [string]$Subscription
  )

  if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
    throw "Azure CLI ('az') was not found on PATH. Install Azure CLI or use -SkipAzureCleanup."
  }

  $accountArgs = @("account", "show", "--output", "none")
  if ($Subscription) {
    $accountArgs += @("--subscription", $Subscription)
  }

  & az @accountArgs
  if ($LASTEXITCODE -ne 0) {
    throw "Azure CLI is not authenticated for the requested subscription. Run 'az login' and retry."
  }
}

function Get-StaticWebAppInventory {
  param(
    [string]$Subscription
  )

  $args = @(
    "staticwebapp", "list",
    "--query", "[].{name:name,resourceGroup:resourceGroup,defaultHostname:defaultHostname}",
    "--output", "json"
  )
  if ($Subscription) {
    $args += @("--subscription", $Subscription)
  }

  $inventory = Get-AzJson -Arguments $args
  if ($null -eq $inventory) {
    return @()
  }

  return @($inventory)
}

function Get-StaticWebAppDefaultHostname {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name,

    [Parameter(Mandatory = $true)]
    [string]$ResourceGroup,

    [string]$Subscription
  )

  $args = @(
    "staticwebapp", "show",
    "--name", $Name,
    "--resource-group", $ResourceGroup,
    "--query", "defaultHostname",
    "--output", "tsv"
  )
  if ($Subscription) {
    $args += @("--subscription", $Subscription)
  }

  $hostname = (Get-AzOutput -Arguments $args | Out-String).Trim()
  if ([string]::IsNullOrWhiteSpace($hostname)) {
    throw "Unable to resolve default hostname for Static Web App '$Name'."
  }

  return $hostname
}

function Get-StaticWebAppAppSettings {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name,

    [Parameter(Mandatory = $true)]
    [string]$ResourceGroup,

    [string]$EnvironmentName,

    [string]$Subscription
  )

  $args = @(
    "staticwebapp", "appsettings", "list",
    "--name", $Name,
    "--resource-group", $ResourceGroup,
    "--output", "json"
  )
  if ($EnvironmentName) {
    $args += @("--environment-name", $EnvironmentName)
  }
  if ($Subscription) {
    $args += @("--subscription", $Subscription)
  }

  $settings = Get-AzJson -Arguments $args
  if ($null -eq $settings) {
    return @{}
  }

  if ($settings -is [hashtable]) {
    return $settings
  }

  if ($settings.PSObject.Properties.Name -contains "properties" -and $settings.properties) {
    return ConvertTo-Hashtable -InputObject $settings.properties
  }

  return ConvertTo-Hashtable -InputObject $settings
}

function Get-StorageAccountNameFromConnectionString {
  param(
    [AllowNull()]
    [string]$ConnectionString
  )

  if ([string]::IsNullOrWhiteSpace($ConnectionString)) {
    return $null
  }

  $match = [regex]::Match($ConnectionString, "(?:^|;)AccountName=(?<name>[^;]+)")
  if ($match.Success) {
    return $match.Groups["name"].Value.Trim()
  }

  return $null
}

function Get-StorageAccountNameFromUrl {
  param(
    [AllowNull()]
    [string]$Url
  )

  if ([string]::IsNullOrWhiteSpace($Url)) {
    return $null
  }

  try {
    $uri = [Uri]$Url
    $segments = $uri.Host.Split(".")
    if ($segments.Count -gt 0) {
      return $segments[0].Trim()
    }
  } catch {
  }

  return $null
}

function Resolve-StorageAccountResourceGroup {
  param(
    [Parameter(Mandatory = $true)]
    [string]$StorageAccountName,

    [string]$Subscription
  )

  $args = @(
    "resource", "list",
    "--name", $StorageAccountName,
    "--resource-type", "Microsoft.Storage/storageAccounts",
    "--query", "[0].resourceGroup",
    "--output", "tsv"
  )
  if ($Subscription) {
    $args += @("--subscription", $Subscription)
  }

  $resourceGroup = (Get-AzOutput -Arguments $args | Out-String).Trim()
  if ([string]::IsNullOrWhiteSpace($resourceGroup)) {
    throw "Unable to resolve the resource group for storage account '$StorageAccountName'."
  }

  return $resourceGroup
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$validatorPath = Join-Path $PSScriptRoot "validate_static_data.py"
if (-not (Test-Path $validatorPath)) {
  throw "Required validator not found at '$validatorPath'."
}

$resolvedEnvFile = Resolve-EnvFile -RepositoryRoot $repoRoot -PathOverride $EnvFilePath
$config = @{}
if ($resolvedEnvFile) {
  $config = Read-EnvironmentFile -Path $resolvedEnvFile
  Write-Host "Loaded cleanup configuration from '$resolvedEnvFile'."
} else {
  Write-Warning "No .env file was found. The script will rely on explicit parameters and existing process environment variables."
}

$skipValidationEnabled = Get-ConfiguredSwitchValue `
  -ExplicitValue $SkipValidation.IsPresent `
  -WasExplicitlyBound $PSBoundParameters.ContainsKey("SkipValidation") `
  -Config $config `
  -Names @("STATIC_CUTOVER_SKIP_VALIDATION")

$skipAzureCleanupEnabled = Get-ConfiguredSwitchValue `
  -ExplicitValue $SkipAzureCleanup.IsPresent `
  -WasExplicitlyBound $PSBoundParameters.ContainsKey("SkipAzureCleanup") `
  -Config $config `
  -Names @("STATIC_CUTOVER_SKIP_AZURE_CLEANUP")

$skipGitHubSecretCleanupEnabled = Get-ConfiguredSwitchValue `
  -ExplicitValue $SkipGitHubSecretCleanup.IsPresent `
  -WasExplicitlyBound $PSBoundParameters.ContainsKey("SkipGitHubSecretCleanup") `
  -Config $config `
  -Names @("STATIC_CUTOVER_SKIP_GITHUB_SECRET_CLEANUP")

$ValidationBaseUrls = @(Get-ConfiguredStringArray -ExplicitValue $ValidationBaseUrls -Config $config -Names @("STATIC_CUTOVER_VALIDATION_BASE_URLS"))
$StaticWebAppNames = @(Get-ConfiguredStringArray -ExplicitValue $StaticWebAppNames -Config $config -Names @("STATIC_CUTOVER_SWA_NAMES", "STATIC_CUTOVER_STATIC_WEB_APP_NAMES"))
$StaticWebAppResourceGroups = @(Get-ConfiguredStringArray -ExplicitValue $StaticWebAppResourceGroups -Config $config -Names @("STATIC_CUTOVER_SWA_RESOURCE_GROUPS", "STATIC_CUTOVER_STATIC_WEB_APP_RESOURCE_GROUPS"))
$StaticWebAppEnvironmentNames = @(Get-ConfiguredStringArray -ExplicitValue $StaticWebAppEnvironmentNames -Config $config -Names @("STATIC_CUTOVER_SWA_ENVIRONMENT_NAMES"))
$StorageAccountNames = @(Get-ConfiguredStringArray -ExplicitValue $StorageAccountNames -Config $config -Names @("STATIC_CUTOVER_STORAGE_ACCOUNT_NAMES"))
$StorageAccountResourceGroups = @(Get-ConfiguredStringArray -ExplicitValue $StorageAccountResourceGroups -Config $config -Names @("STATIC_CUTOVER_STORAGE_ACCOUNT_RESOURCE_GROUPS"))
$storageAccountUrls = @(Get-ConfiguredStringArray -ExplicitValue @() -Config $config -Names @("STATIC_CUTOVER_STORAGE_ACCOUNT_URLS", "STORAGE_ACCOUNT_URL"))
$blobConnections = @(Get-ConfiguredStringArray -ExplicitValue @() -Config $config -Names @("STATIC_CUTOVER_BLOB_CONNECTION_STRINGS", "BLOB_CONN"))
$SubscriptionId = Get-ConfiguredString -ExplicitValue $SubscriptionId -Config $config -Names @("STATIC_CUTOVER_SUBSCRIPTION_ID", "AZURE_SUBSCRIPTION_ID", "ARM_SUBSCRIPTION_ID")
$GitHubRepository = Get-ConfiguredString -ExplicitValue $GitHubRepository -Config $config -Names @("STATIC_CUTOVER_GITHUB_REPOSITORY", "GITHUB_REPOSITORY")
$GitHubToken = Get-ConfiguredString -ExplicitValue $GitHubToken -Config $config -Names @("STATIC_CUTOVER_GITHUB_TOKEN", "GITHUB_TOKEN")
$legacyStaticSettingOverrides = @(Get-ConfiguredStringArray -ExplicitValue @() -Config $config -Names @("STATIC_CUTOVER_LEGACY_SWA_SETTING_NAMES"))
if (@($legacyStaticSettingOverrides).Count -gt 0) {
  $LegacyStaticWebAppSettingNames = $legacyStaticSettingOverrides
}
$legacyGitHubSecretOverrides = @(Get-ConfiguredStringArray -ExplicitValue @() -Config $config -Names @("STATIC_CUTOVER_LEGACY_GITHUB_SECRET_NAMES"))
if (@($legacyGitHubSecretOverrides).Count -gt 0) {
  $LegacyGitHubSecretNames = $legacyGitHubSecretOverrides
}

$countCandidates = @(@(
  $ValidationBaseUrls.Count,
  $StaticWebAppNames.Count,
  $StaticWebAppResourceGroups.Count,
  $StaticWebAppEnvironmentNames.Count,
  $StorageAccountNames.Count,
  $StorageAccountResourceGroups.Count,
  $storageAccountUrls.Count,
  $blobConnections.Count
) | Where-Object { $_ -gt 0 })

$targetCount = 0
if ($countCandidates.Count -gt 0) {
  $targetCount = ($countCandidates | Measure-Object -Maximum).Maximum
}

$needsAzureMetadata = (-not $skipAzureCleanupEnabled) -or ((-not $skipValidationEnabled) -and $ValidationBaseUrls.Count -eq 0)
if ($needsAzureMetadata) {
  Test-AzureCliReady -Subscription $SubscriptionId
}

if ($targetCount -gt 0) {
  $ValidationBaseUrls = @(Expand-StringArray -Values $ValidationBaseUrls -DesiredCount $targetCount -ParameterName "ValidationBaseUrls")
  $StaticWebAppNames = @(Expand-StringArray -Values $StaticWebAppNames -DesiredCount $targetCount -ParameterName "StaticWebAppNames")
  $StaticWebAppResourceGroups = @(Expand-StringArray -Values $StaticWebAppResourceGroups -DesiredCount $targetCount -ParameterName "StaticWebAppResourceGroups")
  $StaticWebAppEnvironmentNames = @(Expand-StringArray -Values $StaticWebAppEnvironmentNames -DesiredCount $targetCount -ParameterName "StaticWebAppEnvironmentNames")
  $StorageAccountNames = @(Expand-StringArray -Values $StorageAccountNames -DesiredCount $targetCount -ParameterName "StorageAccountNames")
  $StorageAccountResourceGroups = @(Expand-StringArray -Values $StorageAccountResourceGroups -DesiredCount $targetCount -ParameterName "StorageAccountResourceGroups")
  $storageAccountUrls = @(Expand-StringArray -Values $storageAccountUrls -DesiredCount $targetCount -ParameterName "STATIC_CUTOVER_STORAGE_ACCOUNT_URLS")
  $blobConnections = @(Expand-StringArray -Values $blobConnections -DesiredCount $targetCount -ParameterName "STATIC_CUTOVER_BLOB_CONNECTION_STRINGS")
}

$staticWebAppInventory = @()
if (-not $skipAzureCleanupEnabled -and $ValidationBaseUrls.Count -gt 0 -and (@($StaticWebAppNames | Where-Object { $_ }).Count -lt $targetCount -or @($StaticWebAppResourceGroups | Where-Object { $_ }).Count -lt $targetCount)) {
  $staticWebAppInventory = Get-StaticWebAppInventory -Subscription $SubscriptionId
}

if (-not $skipAzureCleanupEnabled -and $ValidationBaseUrls.Count -gt 0) {
  for ($i = 0; $i -lt $targetCount; $i++) {
    if (-not [string]::IsNullOrWhiteSpace($StaticWebAppNames[$i]) -and -not [string]::IsNullOrWhiteSpace($StaticWebAppResourceGroups[$i])) {
      continue
    }

    $hostname = ([Uri]$ValidationBaseUrls[$i]).Host
    $matches = @($staticWebAppInventory | Where-Object { $_.defaultHostname -eq $hostname })
    if ($matches.Count -ne 1) {
      throw "Unable to uniquely resolve the Static Web App for '$hostname'. Set STATIC_CUTOVER_SWA_NAMES and STATIC_CUTOVER_SWA_RESOURCE_GROUPS explicitly."
    }

    if ([string]::IsNullOrWhiteSpace($StaticWebAppNames[$i])) {
      $StaticWebAppNames[$i] = [string]$matches[0].name
    }
    if ([string]::IsNullOrWhiteSpace($StaticWebAppResourceGroups[$i])) {
      $StaticWebAppResourceGroups[$i] = [string]$matches[0].resourceGroup
    }
  }
}

if (-not $skipValidationEnabled -and $ValidationBaseUrls.Count -eq 0) {
  if ($targetCount -eq 0 -or @($StaticWebAppNames | Where-Object { $_ }).Count -eq 0 -or @($StaticWebAppResourceGroups | Where-Object { $_ }).Count -eq 0) {
    throw "ValidationBaseUrls are required for validation. Set STATIC_CUTOVER_VALIDATION_BASE_URLS in .env or provide Static Web App names/resource groups so the URLs can be derived."
  }

  $ValidationBaseUrls = @(
    for ($i = 0; $i -lt $targetCount; $i++) {
      $hostname = Get-StaticWebAppDefaultHostname -Name $StaticWebAppNames[$i] -ResourceGroup $StaticWebAppResourceGroups[$i] -Subscription $SubscriptionId
      "https://$hostname"
    }
  )
}

if (-not $skipAzureCleanupEnabled) {
  if ($targetCount -eq 0) {
    throw "No cleanup targets were configured. Populate STATIC_CUTOVER_VALIDATION_BASE_URLS in .env or provide explicit parameters."
  }

  if (@($StaticWebAppNames | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }).Count -ne $targetCount) {
    throw "Static Web App names could not be fully resolved. Set STATIC_CUTOVER_SWA_NAMES in .env or pass -StaticWebAppNames."
  }

  if (@($StaticWebAppResourceGroups | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }).Count -ne $targetCount) {
    throw "Static Web App resource groups could not be fully resolved. Set STATIC_CUTOVER_SWA_RESOURCE_GROUPS in .env or pass -StaticWebAppResourceGroups."
  }
}

if (-not $skipValidationEnabled) {
  $pythonCommand = Resolve-PythonCommand
  for ($i = 0; $i -lt $ValidationBaseUrls.Count; $i++) {
    $baseUrl = $ValidationBaseUrls[$i]
    $swaLabel = if ($i -lt $StaticWebAppNames.Count -and -not [string]::IsNullOrWhiteSpace($StaticWebAppNames[$i])) { $StaticWebAppNames[$i] } else { $baseUrl }
    Write-Host "Validating static deployment for '$swaLabel' at '$baseUrl'..."
    $stdoutPath = [System.IO.Path]::GetTempFileName()
    $stderrPath = [System.IO.Path]::GetTempFileName()
    try {
      $validatorProcess = Start-Process `
        -FilePath $pythonCommand.FilePath `
        -ArgumentList ($pythonCommand.PrefixArguments + @($validatorPath, "--base-url", $baseUrl)) `
        -RedirectStandardOutput $stdoutPath `
        -RedirectStandardError $stderrPath `
        -NoNewWindow `
        -PassThru `
        -Wait
      $validatorExitCode = $validatorProcess.ExitCode
      $validatorOutput = @()
      if (Test-Path $stdoutPath) {
        $validatorOutput += Get-Content -Path $stdoutPath
      }
      if (Test-Path $stderrPath) {
        $validatorOutput += Get-Content -Path $stderrPath
      }
    } finally {
      foreach ($tempPath in @($stdoutPath, $stderrPath)) {
        try {
          if ($tempPath -and [System.IO.File]::Exists($tempPath)) {
            [System.IO.File]::Delete($tempPath)
          }
        } catch {
        }
      }
    }

    if ($validatorExitCode -ne 0) {
      $validationFailure = "Static data validation failed for '$swaLabel' at '$baseUrl'."
      if ($WhatIfPreference) {
        Write-Warning "$validationFailure Dry run will continue, but a live cleanup would abort."
        continue
      }

      if ($validatorOutput) {
        $validatorOutput | ForEach-Object { Write-Host $_ }
      }
      throw "$validationFailure Cleanup aborted."
    }

    if ($validatorOutput) {
      $validatorOutput | ForEach-Object { Write-Host $_ }
    }
  }
}

if (-not $skipAzureCleanupEnabled) {
  $swaSettingsCache = @{}
  $storageResourceGroupCache = @{}
  $resolvedStorageTargets = [System.Collections.Generic.List[object]]::new()
  $seenStorageTargets = @{}
  $seenStaticWebApps = @{}

  for ($i = 0; $i -lt $targetCount; $i++) {
    $swaName = $StaticWebAppNames[$i]
    $resourceGroup = $StaticWebAppResourceGroups[$i]
    $environmentName = $StaticWebAppEnvironmentNames[$i]
    $storageAccountName = $StorageAccountNames[$i]
    $storageResourceGroup = $StorageAccountResourceGroups[$i]

    if ([string]::IsNullOrWhiteSpace($storageAccountName)) {
      $storageAccountName = Get-StorageAccountNameFromUrl -Url $storageAccountUrls[$i]
    }
    if ([string]::IsNullOrWhiteSpace($storageAccountName)) {
      $storageAccountName = Get-StorageAccountNameFromConnectionString -ConnectionString $blobConnections[$i]
    }
    if ([string]::IsNullOrWhiteSpace($storageAccountName)) {
      $settingsCacheKey = "$swaName|$resourceGroup|$environmentName"
      if (-not $swaSettingsCache.ContainsKey($settingsCacheKey)) {
        $swaSettingsCache[$settingsCacheKey] = Get-StaticWebAppAppSettings -Name $swaName -ResourceGroup $resourceGroup -EnvironmentName $environmentName -Subscription $SubscriptionId
      }
      $appSettings = $swaSettingsCache[$settingsCacheKey]
      $storageAccountName = Get-StorageAccountNameFromUrl -Url $appSettings["STORAGE_ACCOUNT_URL"]
      if ([string]::IsNullOrWhiteSpace($storageAccountName)) {
        $storageAccountName = Get-StorageAccountNameFromConnectionString -ConnectionString $appSettings["BLOB_CONN"]
      }
    }

    if ([string]::IsNullOrWhiteSpace($storageResourceGroup) -and -not [string]::IsNullOrWhiteSpace($storageAccountName)) {
      if (-not $storageResourceGroupCache.ContainsKey($storageAccountName)) {
        $storageResourceGroupCache[$storageAccountName] = Resolve-StorageAccountResourceGroup -StorageAccountName $storageAccountName -Subscription $SubscriptionId
      }
      $storageResourceGroup = [string]$storageResourceGroupCache[$storageAccountName]
    }

    if ($PSCmdlet.ShouldProcess("$swaName ($resourceGroup)", "Delete legacy Static Web App app settings")) {
      $swaKey = "$swaName|$resourceGroup|$environmentName"
      if (-not $seenStaticWebApps.ContainsKey($swaKey)) {
        $seenStaticWebApps[$swaKey] = $true
        $deleteSettingsArgs = @(
          "staticwebapp", "appsettings", "delete",
          "--name", $swaName,
          "--resource-group", $resourceGroup,
          "--setting-names"
        )
        $deleteSettingsArgs += $LegacyStaticWebAppSettingNames
        if ($environmentName) {
          $deleteSettingsArgs += @("--environment-name", $environmentName)
        }
        if ($SubscriptionId) {
          $deleteSettingsArgs += @("--subscription", $SubscriptionId)
        }
        $deleteSettingsArgs += "--only-show-errors"

        & az @deleteSettingsArgs | Out-Null
        if ($LASTEXITCODE -ne 0) {
          throw "Failed to delete legacy app settings for Static Web App '$swaName'."
        }
      }
    }

    if ([string]::IsNullOrWhiteSpace($storageAccountName) -and [string]::IsNullOrWhiteSpace($storageResourceGroup)) {
      Write-Warning "No storage account could be resolved for '$swaName'. Storage deletion will be skipped for this target."
      continue
    }

    if ([string]::IsNullOrWhiteSpace($storageAccountName) -or [string]::IsNullOrWhiteSpace($storageResourceGroup)) {
      throw "Storage account metadata for '$swaName' is incomplete. Set STATIC_CUTOVER_STORAGE_ACCOUNT_NAMES and STATIC_CUTOVER_STORAGE_ACCOUNT_RESOURCE_GROUPS explicitly."
    }

    $storageKey = "$storageAccountName|$storageResourceGroup"
    if (-not $seenStorageTargets.ContainsKey($storageKey)) {
      $seenStorageTargets[$storageKey] = $true
      $resolvedStorageTargets.Add([pscustomobject]@{
          Name = $storageAccountName
          ResourceGroup = $storageResourceGroup
        })
    }
  }

  foreach ($storageTarget in $resolvedStorageTargets) {
    if ($PSCmdlet.ShouldProcess("$($storageTarget.Name) ($($storageTarget.ResourceGroup))", "Delete dedicated storage account")) {
      $deleteStorageArgs = @(
        "storage", "account", "delete",
        "--name", $storageTarget.Name,
        "--resource-group", $storageTarget.ResourceGroup,
        "--yes",
        "--only-show-errors"
      )
      if ($SubscriptionId) {
        $deleteStorageArgs += @("--subscription", $SubscriptionId)
      }

      & az @deleteStorageArgs | Out-Null
      if ($LASTEXITCODE -ne 0) {
        throw "Failed to delete storage account '$($storageTarget.Name)'."
      }
    }
  }
}

if (-not $skipGitHubSecretCleanupEnabled) {
  if (-not $GitHubToken) {
    throw "GitHubToken is required for repository secret cleanup. Set STATIC_CUTOVER_GITHUB_TOKEN in .env, pass -GitHubToken, or set the GITHUB_TOKEN environment variable."
  }

  $resolvedRepository = Resolve-GitHubRepository -RepositoryRoot $repoRoot -RepositoryOverride $GitHubRepository
  $headers = @{
    Accept                 = "application/vnd.github+json"
    Authorization          = "Bearer $GitHubToken"
    "X-GitHub-Api-Version" = "2022-11-28"
    "User-Agent"           = "nwmiws-static-cutover-cleanup"
  }

  foreach ($secretName in $LegacyGitHubSecretNames) {
    $escapedSecretName = [Uri]::EscapeDataString($secretName)
    $uri = "https://api.github.com/repos/$resolvedRepository/actions/secrets/$escapedSecretName"

    if ($PSCmdlet.ShouldProcess("$resolvedRepository/$secretName", "Delete GitHub Actions repository secret")) {
      try {
        $response = Invoke-WebRequest -Method Delete -Uri $uri -Headers $headers -ErrorAction Stop
        if ($response.StatusCode -ne 204) {
          throw "GitHub returned HTTP $($response.StatusCode) while deleting '$secretName'."
        }
      } catch {
        $statusCode = Get-HttpStatusCode -Exception $_.Exception
        if ($statusCode -eq 404) {
          Write-Warning "GitHub secret '$secretName' was not found in '$resolvedRepository'; skipping."
          continue
        }

        throw "Failed to delete GitHub secret '$secretName' from '$resolvedRepository'. $($_.Exception.Message)"
      }
    }
  }
}

Write-Host "Static cutover cleanup completed."
