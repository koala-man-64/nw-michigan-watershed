[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [switch]$RotateClientSecrets
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Import-Module (Join-Path $PSScriptRoot "Common.psm1") -Force -DisableNameChecking
Import-Module (Join-Path (Get-WorkspaceRoot -StartPath $PSScriptRoot) "scripts/infra/Common.psm1") -Force -DisableNameChecking

$repoRoot = Get-WorkspaceRoot -StartPath $PSScriptRoot
$deployScript = Join-Path $repoRoot "scripts/infra/Deploy-AzureMapsStack.ps1"
$testScript = Join-Path $repoRoot "scripts/infra/Test-AzureMapsStack.ps1"
$whatIfMode = [bool]$WhatIfPreference

function Get-EnvironmentConfig {
  param([string]$Environment)

  $path = Join-Path $repoRoot ("scripts/infra/environments/{0}.psd1" -f $Environment)
  if (-not (Test-Path -LiteralPath $path)) {
    throw "Environment configuration file was not found: $path"
  }

  return Import-PowerShellDataFile -LiteralPath $path
}

function Ensure-ResourceGroup {
  param(
    [hashtable]$Config,
    [bool]$WhatIfMode
  )

  $exists = Invoke-Az -Arguments @(
    "group",
    "exists",
    "--name",
    $Config.ResourceGroupName
  )

  if ($exists -eq "true") {
    return
  }

  if ($WhatIfMode) {
    Write-Host "WhatIf: would create resource group '$($Config.ResourceGroupName)' in '$($Config.Location)'."
    return
  }

  $tagArguments = ConvertTo-TagArgumentList -Tags $Config.Tags
  $arguments = @(
    "group",
    "create",
    "--name",
    $Config.ResourceGroupName,
    "--location",
    $Config.Location
  )

  if ($tagArguments.Count -gt 0) {
    $arguments += @("--tags") + $tagArguments
  }

  $null = Invoke-AzJson -Arguments $arguments
}

function Ensure-StaticWebAppExists {
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

function Ensure-LogAnalyticsWorkspace {
  param(
    [hashtable]$Config,
    [bool]$WhatIfMode
  )

  $workspaceName = Get-LogAnalyticsWorkspaceName -ApplicationInsightsName $Config.ApplicationInsightsName
  $workspace = Invoke-AzJson -Arguments @(
    "monitor",
    "log-analytics",
    "workspace",
    "show",
    "--workspace-name",
    $workspaceName,
    "--resource-group",
    $Config.ResourceGroupName
  ) -AllowFailure

  if ($workspace) {
    return $workspace
  }

  if ($WhatIfMode) {
    Write-Host "WhatIf: would create Log Analytics workspace '$workspaceName'."
    return [pscustomobject]@{
      id = "<created-on-apply>"
      name = $workspaceName
    }
  }

  $tagArguments = ConvertTo-TagArgumentList -Tags $Config.Tags
  $arguments = @(
    "monitor",
    "log-analytics",
    "workspace",
    "create",
    "--workspace-name",
    $workspaceName,
    "--resource-group",
    $Config.ResourceGroupName,
    "--location",
    $Config.Location,
    "--sku",
    "PerGB2018",
    "--retention-time",
    "30"
  )

  if ($tagArguments.Count -gt 0) {
    $arguments += @("--tags") + $tagArguments
  }

  return Invoke-AzJson -Arguments $arguments
}

function Ensure-ApplicationInsightsComponent {
  param(
    [hashtable]$Config,
    [object]$Workspace,
    [bool]$WhatIfMode
  )

  $component = Invoke-AzJson -Arguments @(
    "monitor",
    "app-insights",
    "component",
    "show",
    "--app",
    $Config.ApplicationInsightsName,
    "--resource-group",
    $Config.ApplicationInsightsResourceGroupName
  ) -AllowFailure

  if ($component) {
    return $component
  }

  if ($WhatIfMode) {
    Write-Host "WhatIf: would create Application Insights component '$($Config.ApplicationInsightsName)'."
    return [pscustomobject]@{
      name = $Config.ApplicationInsightsName
      workspaceResourceId = $Workspace.id
    }
  }

  $tagArguments = ConvertTo-TagArgumentList -Tags $Config.Tags
  $arguments = @(
    "monitor",
    "app-insights",
    "component",
    "create",
    "--app",
    $Config.ApplicationInsightsName,
    "--resource-group",
    $Config.ApplicationInsightsResourceGroupName,
    "--location",
    $Config.Location,
    "--application-type",
    "web",
    "--kind",
    "web",
    "--workspace",
    $Workspace.id,
    "--ingestion-access",
    "Enabled",
    "--query-access",
    "Enabled"
  )

  if ($tagArguments.Count -gt 0) {
    $arguments += @("--tags") + $tagArguments
  }

  return Invoke-AzJson -Arguments $arguments
}

function Invoke-AzureMapsDeployment {
  param(
    [string]$Environment,
    [switch]$RotateClientSecrets,
    [bool]$WhatIfMode
  )

  if ($WhatIfMode) {
    Write-Host "WhatIf: would invoke '$deployScript -Environment $Environment$(if ($RotateClientSecrets) { ' -RotateClientSecret' })' after prerequisite resources are created."
    return
  }

  $arguments = @(
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    $deployScript,
    "-Environment",
    $Environment
  )

  if ($RotateClientSecrets) {
    $arguments += "-RotateClientSecret"
  }

  $null = & powershell @arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Azure Maps deployment script failed for '$Environment'."
  }

  if (-not $WhatIfMode) {
    $null = & powershell -ExecutionPolicy Bypass -File $testScript -Environment $Environment
    if ($LASTEXITCODE -ne 0) {
      throw "Azure Maps validation script failed for '$Environment'."
    }
  }
}

Ensure-AzCli
Require-AzLogin
Ensure-AzExtensionInstalled -Name "application-insights"

foreach ($environment in @("dev", "prod")) {
  $config = Get-EnvironmentConfig -Environment $environment

  Write-Host ""
  Write-Host "Processing Azure environment '$environment'..."
  Set-Subscription -SubscriptionId $config.SubscriptionId
  Ensure-ProviderRegistered -Namespace "Microsoft.Insights"
  Ensure-ProviderRegistered -Namespace "Microsoft.OperationalInsights"
  Ensure-ProviderRegistered -Namespace "Microsoft.Maps"
  Ensure-ProviderRegistered -Namespace "Microsoft.ManagedIdentity"
  Ensure-ResourceGroup -Config $config -WhatIfMode $whatIfMode
  Ensure-StaticWebAppExists -Config $config
  $workspace = Ensure-LogAnalyticsWorkspace -Config $config -WhatIfMode $whatIfMode
  $null = Ensure-ApplicationInsightsComponent -Config $config -Workspace $workspace -WhatIfMode $whatIfMode
  Invoke-AzureMapsDeployment -Environment $environment -RotateClientSecrets:$RotateClientSecrets -WhatIfMode $whatIfMode
}

Write-Host ""
Write-Host "Azure platform provisioning completed for dev and prod."
