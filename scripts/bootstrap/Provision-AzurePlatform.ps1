[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [switch]$RotateClientSecrets
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$previousVerbosePreference = $VerbosePreference
try {
  $VerbosePreference = "SilentlyContinue"
  Import-Module (Join-Path $PSScriptRoot "..\common\Repo.Common.psm1") -Force -DisableNameChecking
  Import-Module (Join-Path $PSScriptRoot "..\common\Az.Common.psm1") -Force -DisableNameChecking
} finally {
  $VerbosePreference = $previousVerbosePreference
}

$repoRoot = Get-WorkspaceRoot -StartPath $PSScriptRoot
$deployScript = Join-Path $repoRoot "scripts/azuremaps/Deploy-AzureMapsStack.ps1"
$testScript = Join-Path $repoRoot "scripts/azuremaps/Test-AzureMapsStack.ps1"
$whatIfMode = [bool]$WhatIfPreference

function Get-EnvironmentConfig {
  param([string]$Environment)

  $path = Join-Path $repoRoot ("scripts/environments/{0}.psd1" -f $Environment)
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
    Write-ScriptStep "Resource group '$($Config.ResourceGroupName)' already exists."
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

function Get-StaticWebAppLocation {
  param([hashtable]$Config)

  if (
    $Config.ContainsKey("StaticWebAppLocation") -and
    -not [string]::IsNullOrWhiteSpace([string]$Config.StaticWebAppLocation)
  ) {
    return [string]$Config.StaticWebAppLocation
  }

  return [string]$Config.Location
}

function Get-StaticWebAppSku {
  param([hashtable]$Config)

  if (
    $Config.ContainsKey("StaticWebAppSku") -and
    -not [string]::IsNullOrWhiteSpace([string]$Config.StaticWebAppSku)
  ) {
    return [string]$Config.StaticWebAppSku
  }

  return "Free"
}

function Get-StaticWebApp {
  param([hashtable]$Config)

  return Invoke-AzJson -Arguments @(
    "staticwebapp",
    "show",
    "--name",
    $Config.StaticWebAppName,
    "--resource-group",
    $Config.StaticWebAppResourceGroupName
  ) -AllowFailure
}

function Ensure-StaticWebApp {
  param(
    [hashtable]$Config,
    [bool]$WhatIfMode
  )

  Write-ScriptStep "Ensuring Static Web App '$($Config.StaticWebAppName)'."
  $staticWebApp = Get-StaticWebApp -Config $Config
  if ($staticWebApp) {
    Write-ScriptStep "Static Web App '$($Config.StaticWebAppName)' already exists."
    return $staticWebApp
  }

  $location = Get-StaticWebAppLocation -Config $Config
  $sku = Get-StaticWebAppSku -Config $Config

  if ($WhatIfMode) {
    Write-Host "WhatIf: would create Static Web App '$($Config.StaticWebAppName)' in '$location' with SKU '$sku'."
    return [pscustomobject]@{
      name = $Config.StaticWebAppName
      resourceGroup = $Config.StaticWebAppResourceGroupName
      location = $location
      sku = [pscustomobject]@{
        name = $sku
      }
    }
  }

  Write-Host "Creating Static Web App '$($Config.StaticWebAppName)' in '$location' with SKU '$sku'..."
  $tagArguments = ConvertTo-TagArgumentList -Tags $Config.Tags
  $arguments = @(
    "staticwebapp",
    "create",
    "--name",
    $Config.StaticWebAppName,
    "--resource-group",
    $Config.StaticWebAppResourceGroupName,
    "--location",
    $location,
    "--sku",
    $sku
  )

  if ($tagArguments.Count -gt 0) {
    $arguments += @("--tags") + $tagArguments
  }

  return Invoke-AzJson -Arguments $arguments
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
    Write-ScriptStep "Log Analytics workspace '$workspaceName' already exists."
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
    Write-ScriptStep "Application Insights '$($Config.ApplicationInsightsName)' already exists."
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

  Write-ScriptStep "Running Azure Maps deployment for '$Environment'."
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

  if ($VerbosePreference -eq "Continue") {
    $arguments += "-Verbose"
  }

  $null = & powershell @arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Azure Maps deployment script failed for '$Environment'."
  }

  if (-not $WhatIfMode) {
    $validationArguments = @(
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      $testScript,
      "-Environment",
      $Environment
    )
    if ($VerbosePreference -eq "Continue") {
      $validationArguments += "-Verbose"
    }
    Write-ScriptStep "Running Azure Maps validation for '$Environment'."
    $null = & powershell @validationArguments
    if ($LASTEXITCODE -ne 0) {
      throw "Azure Maps validation script failed for '$Environment'."
    }
  }
}

Write-ScriptSection "Azure platform bootstrap"
Write-ScriptStep "Ensuring Azure CLI prerequisites and authentication."
Ensure-AzCli
Require-AzLogin
Ensure-AzExtensionInstalled -Name "application-insights"

foreach ($environment in @("sbx", "dev", "prod")) {
  Write-ScriptSection "Environment: $environment"
  Write-ScriptStep "Loading environment configuration."
  $config = Get-EnvironmentConfig -Environment $environment

  Write-ScriptStep "Target resource group: $($config.ResourceGroupName)"
  Write-ScriptStep "Target Static Web App: $($config.StaticWebAppName)"
  Write-ScriptStep "Switching Azure subscription to '$($config.SubscriptionId)'."
  Set-Subscription -SubscriptionId $config.SubscriptionId

  Write-ScriptStep "Ensuring required Azure resource providers are registered."
  Ensure-ProviderRegistered -Namespace "Microsoft.Insights"
  Ensure-ProviderRegistered -Namespace "Microsoft.OperationalInsights"
  Ensure-ProviderRegistered -Namespace "Microsoft.Maps"
  Ensure-ProviderRegistered -Namespace "Microsoft.ManagedIdentity"
  Ensure-ProviderRegistered -Namespace "Microsoft.Web"

  Write-ScriptStep "Ensuring resource group '$($config.ResourceGroupName)'."
  Ensure-ResourceGroup -Config $config -WhatIfMode $whatIfMode

  $null = Ensure-StaticWebApp -Config $config -WhatIfMode $whatIfMode

  Write-ScriptStep "Ensuring Log Analytics workspace for '$($config.ApplicationInsightsName)'."
  $workspace = Ensure-LogAnalyticsWorkspace -Config $config -WhatIfMode $whatIfMode

  Write-ScriptStep "Ensuring Application Insights '$($config.ApplicationInsightsName)'."
  $null = Ensure-ApplicationInsightsComponent -Config $config -Workspace $workspace -WhatIfMode $whatIfMode

  Invoke-AzureMapsDeployment -Environment $environment -RotateClientSecrets:$RotateClientSecrets -WhatIfMode $whatIfMode
}

Write-ScriptSection "Completed"
Write-Host "Azure platform provisioning completed for sbx, dev, and prod."
