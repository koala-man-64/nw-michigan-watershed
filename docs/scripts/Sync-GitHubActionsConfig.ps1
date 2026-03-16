[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [string]$Repository,
  [string]$EnvFilePath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Import-Module (Join-Path $PSScriptRoot "Common.psm1") -Force -DisableNameChecking
Import-Module (Join-Path (Get-WorkspaceRoot -StartPath $PSScriptRoot) "scripts/infra/Common.psm1") -Force -DisableNameChecking

$repoRoot = Get-WorkspaceRoot -StartPath $PSScriptRoot
$whatIfMode = [bool]$WhatIfPreference

if (-not $EnvFilePath) {
  $EnvFilePath = Join-Path $repoRoot "api/.env"
}

function Get-EnvironmentConfig {
  param([string]$Environment)

  $path = Join-Path $repoRoot ("scripts/infra/environments/{0}.psd1" -f $Environment)
  if (-not (Test-Path -LiteralPath $path)) {
    throw "Environment configuration file was not found: $path"
  }

  return Import-PowerShellDataFile -LiteralPath $path
}

function Get-WorkflowSecretNames {
  param(
    [string]$WorkflowPath,
    [string]$ConnectionStringFallback,
    [string]$StaticWebAppTokenFallback
  )

  $content = Get-Content -Raw -LiteralPath $WorkflowPath
  $connectionStringMatch = [regex]::Match(
    $content,
    'REACT_APP_APPLICATIONINSIGHTS_CONNECTION_STRING:\s*\$\{\{\s*secrets\.([A-Z0-9_]+)\s*\}\}'
  )
  $staticWebAppMatches = [regex]::Matches(
    $content,
    'azure_static_web_apps_api_token:\s*\$\{\{\s*secrets\.([A-Z0-9_]+)\s*\}\}'
  )

  $staticWebAppSecretName = $StaticWebAppTokenFallback
  if ($staticWebAppMatches.Count -gt 0) {
    $staticWebAppSecretName = [string]$staticWebAppMatches[0].Groups[1].Value
  }

  return @{
    ConnectionStringSecretName = if ($connectionStringMatch.Success) {
      [string]$connectionStringMatch.Groups[1].Value
    } else {
      $ConnectionStringFallback
    }
    StaticWebAppTokenSecretName = $staticWebAppSecretName
  }
}

function Get-ApplicationInsightsConnectionString {
  param([hashtable]$Config)

  return Invoke-Az -Arguments @(
    "monitor",
    "app-insights",
    "component",
    "show",
    "--app",
    $Config.ApplicationInsightsName,
    "--resource-group",
    $Config.ApplicationInsightsResourceGroupName,
    "--query",
    "connectionString",
    "--output",
    "tsv"
  )
}

function Get-StaticWebAppDeploymentToken {
  param([hashtable]$Config)

  return Invoke-Az -Arguments @(
    "staticwebapp",
    "secrets",
    "list",
    "--name",
    $Config.StaticWebAppName,
    "--resource-group",
    $Config.StaticWebAppResourceGroupName,
    "--query",
    "properties.apiKey",
    "--output",
    "tsv"
  )
}

function Set-RepositorySecret {
  param(
    [string]$Repo,
    [string]$Name,
    [string]$Value,
    [bool]$WhatIfMode
  )

  if ([string]::IsNullOrWhiteSpace($Value)) {
    throw "Secret '$Name' resolved to an empty value."
  }

  if ($WhatIfMode) {
    Write-Host "WhatIf: would set repository secret '$Name' on '$Repo'."
    return
  }

  $null = Invoke-Gh -Arguments @(
    "secret",
    "set",
    $Name,
    "--repo",
    $Repo,
    "--body",
    $Value
  )
}

function Remove-RepositorySecret {
  param(
    [string]$Repo,
    [string]$Name,
    [bool]$WhatIfMode
  )

  if ($WhatIfMode) {
    Write-Host "WhatIf: would delete repository secret '$Name' from '$Repo'."
    return
  }

  $null = Invoke-Gh -Arguments @(
    "secret",
    "delete",
    $Name,
    "--repo",
    $Repo
  )
}

function Set-RepositoryVariable {
  param(
    [string]$Repo,
    [string]$Name,
    [string]$Value,
    [bool]$WhatIfMode
  )

  if ($null -eq $Value) {
    $Value = ""
  }

  if ($WhatIfMode) {
    Write-Host "WhatIf: would set repository variable '$Name' on '$Repo' to '$Value'."
    return
  }

  $null = Invoke-Gh -Arguments @(
    "variable",
    "set",
    $Name,
    "--repo",
    $Repo,
    "--body",
    $Value
  )
}

function Remove-RepositoryVariable {
  param(
    [string]$Repo,
    [string]$Name,
    [bool]$WhatIfMode
  )

  if ($WhatIfMode) {
    Write-Host "WhatIf: would delete repository variable '$Name' from '$Repo'."
    return
  }

  $null = Invoke-Gh -Arguments @(
    "variable",
    "delete",
    $Name,
    "--repo",
    $Repo
  )
}

function Get-RepositorySecretNames {
  param([string]$Repo)

  $results = Invoke-Gh -Arguments @(
    "secret",
    "list",
    "--repo",
    $Repo,
    "--json",
    "name"
  )

  if ([string]::IsNullOrWhiteSpace($results)) {
    return @()
  }

  return @((ConvertFrom-Json $results) | ForEach-Object { [string]$_.name })
}

function Get-RepositoryVariableNames {
  param([string]$Repo)

  $results = Invoke-Gh -Arguments @(
    "variable",
    "list",
    "--repo",
    $Repo,
    "--json",
    "name"
  )

  if ([string]::IsNullOrWhiteSpace($results)) {
    return @()
  }

  return @((ConvertFrom-Json $results) | ForEach-Object { [string]$_.name })
}

function Test-ManagedSecretName {
  param([string]$Name)

  return (
    $Name -like "REACT_APP_APPLICATIONINSIGHTS_CONNECTION_STRING_*" -or
    $Name -like "AZURE_STATIC_WEB_APPS_API_TOKEN_*"
  )
}

function Get-NonEmptyHashtable {
  param([System.Collections.Specialized.OrderedDictionary]$Values)

  $filtered = [ordered]@{}
  foreach ($entry in $Values.GetEnumerator()) {
    if (-not [string]::IsNullOrWhiteSpace([string]$entry.Value)) {
      $filtered[[string]$entry.Key] = [string]$entry.Value
    }
  }

  return $filtered
}

$envValues = Import-LooseEnvFile -Path $EnvFilePath
$devConfig = Get-EnvironmentConfig -Environment "dev"
$prodConfig = Get-EnvironmentConfig -Environment "prod"

Ensure-GhCli
Ensure-GitHubAuthentication -EnvValues $envValues
Ensure-AzCli
Require-AzLogin
Ensure-AzExtensionInstalled -Name "application-insights"

if (-not $Repository) {
  $Repository = Resolve-GitHubRepository
}

$devWorkflowSecrets = Get-WorkflowSecretNames `
  -WorkflowPath (Join-Path $repoRoot ".github/workflows/build-deploy-nwmiws-swa-dev.yml") `
  -ConnectionStringFallback "REACT_APP_APPLICATIONINSIGHTS_CONNECTION_STRING_DEV" `
  -StaticWebAppTokenFallback "AZURE_STATIC_WEB_APPS_API_TOKEN_NWMIWS_DEV"

$prodWorkflowSecrets = Get-WorkflowSecretNames `
  -WorkflowPath (Join-Path $repoRoot ".github/workflows/build-deploy-nwmiws-swa-prod.yml") `
  -ConnectionStringFallback "REACT_APP_APPLICATIONINSIGHTS_CONNECTION_STRING_PROD" `
  -StaticWebAppTokenFallback "AZURE_STATIC_WEB_APPS_API_TOKEN_NWMIWS_PROD"

$devSubscriptionId = [string]$devConfig.SubscriptionId
$prodSubscriptionId = [string]$prodConfig.SubscriptionId

Set-Subscription -SubscriptionId $devSubscriptionId
$devConnectionString = Get-ApplicationInsightsConnectionString -Config $devConfig
$devStaticWebAppToken = Get-StaticWebAppDeploymentToken -Config $devConfig

Set-Subscription -SubscriptionId $prodSubscriptionId
$prodConnectionString = Get-ApplicationInsightsConnectionString -Config $prodConfig
$prodStaticWebAppToken = Get-StaticWebAppDeploymentToken -Config $prodConfig

$desiredSecrets = [ordered]@{
  $devWorkflowSecrets.ConnectionStringSecretName = $devConnectionString
  $prodWorkflowSecrets.ConnectionStringSecretName = $prodConnectionString
  $devWorkflowSecrets.StaticWebAppTokenSecretName = $devStaticWebAppToken
  $prodWorkflowSecrets.StaticWebAppTokenSecretName = $prodStaticWebAppToken
}

$desiredVariables = [ordered]@{
  NWMIWS_AZURE_SUBSCRIPTION_ID = [string]$devConfig.SubscriptionId
  NWMIWS_AZURE_TENANT_ID = [string]$devConfig.TenantId
  NWMIWS_RESOURCE_GROUP = [string]$devConfig.ResourceGroupName
  NWMIWS_STORAGE_ACCOUNT = [string](Get-StorageAccountNameFromConnectionString -ConnectionString $envValues.BLOB_CONN)
  NWMIWS_STATIC_WEB_APP_DEV = [string]$devConfig.StaticWebAppName
  NWMIWS_STATIC_WEB_APP_PROD = [string]$prodConfig.StaticWebAppName
  NWMIWS_APP_INSIGHTS_DEV = [string]$devConfig.ApplicationInsightsName
  NWMIWS_APP_INSIGHTS_PROD = [string]$prodConfig.ApplicationInsightsName
  NWMIWS_LOG_ANALYTICS_DEV = [string](Get-LogAnalyticsWorkspaceName -ApplicationInsightsName $devConfig.ApplicationInsightsName)
  NWMIWS_LOG_ANALYTICS_PROD = [string](Get-LogAnalyticsWorkspaceName -ApplicationInsightsName $prodConfig.ApplicationInsightsName)
  NWMIWS_AZURE_MAPS_ACCOUNT_DEV = [string]$devConfig.AzureMapsAccountName
  NWMIWS_AZURE_MAPS_ACCOUNT_PROD = [string]$prodConfig.AzureMapsAccountName
  NWMIWS_ALLOWED_ORIGINS_DEV = [string](@($devConfig.AllowedOrigins) -join ",")
  NWMIWS_ALLOWED_ORIGINS_PROD = [string](@($prodConfig.AllowedOrigins) -join ",")
  NWMIWS_VALIDATION_BASE_URLS = [string]$envValues.STATIC_CUTOVER_VALIDATION_BASE_URLS
}

$secrets = Get-NonEmptyHashtable -Values $desiredSecrets
$variables = Get-NonEmptyHashtable -Values $desiredVariables

$existingSecretNames = Get-RepositorySecretNames -Repo $Repository
$existingVariableNames = Get-RepositoryVariableNames -Repo $Repository
$desiredSecretNames = @($secrets.Keys)
$desiredVariableNames = @($variables.Keys)

$staleSecretNames = @(
  $existingSecretNames |
    Where-Object { (Test-ManagedSecretName -Name $_) -and $_ -notin $desiredSecretNames } |
    Sort-Object -Unique
)

$staleVariableNames = @(
  $existingVariableNames |
    Where-Object { $_ -like "NWMIWS_*" -and $_ -notin $desiredVariableNames } |
    Sort-Object -Unique
)

foreach ($secret in $secrets.GetEnumerator()) {
  Set-RepositorySecret -Repo $Repository -Name $secret.Key -Value ([string]$secret.Value) -WhatIfMode $whatIfMode
}

foreach ($variable in $variables.GetEnumerator()) {
  Set-RepositoryVariable -Repo $Repository -Name $variable.Key -Value ([string]$variable.Value) -WhatIfMode $whatIfMode
}

foreach ($secretName in $staleSecretNames) {
  Remove-RepositorySecret -Repo $Repository -Name $secretName -WhatIfMode $whatIfMode
}

foreach ($variableName in $staleVariableNames) {
  Remove-RepositoryVariable -Repo $Repository -Name $variableName -WhatIfMode $whatIfMode
}

Write-Host ""
Write-Host "GitHub Actions bootstrap summary"
Write-Host "  Repository:    $Repository"
Write-Host "  Secrets:       $($secrets.Count)"
Write-Host "  Variables:     $($variables.Count)"
Write-Host "  Secrets pruned:$($staleSecretNames.Count)"
Write-Host "  Vars pruned:   $($staleVariableNames.Count)"
Write-Host "  Env file used: $EnvFilePath"
