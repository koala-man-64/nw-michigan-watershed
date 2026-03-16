Set-StrictMode -Version Latest

function Get-WorkspaceRoot {
  [CmdletBinding()]
  param(
    [string]$StartPath = $PSScriptRoot
  )

  return Split-Path -Parent (Split-Path -Parent $StartPath)
}

function Ensure-GhCli {
  if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    throw "GitHub CLI is required but was not found on PATH."
  }
}

function Invoke-Gh {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)]
    [string[]]$Arguments,

    [switch]$AllowFailure
  )

  $previousErrorActionPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = "Continue"
    $output = & gh @Arguments 2>&1
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }

  if (-not $AllowFailure -and $exitCode -ne 0) {
    $renderedOutput = ($output | Out-String).Trim()
    throw "GitHub CLI command failed: gh $($Arguments -join ' ')`n$renderedOutput"
  }

  return ($output | Out-String).Trim()
}

function Import-LooseEnvFile {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)]
    [string]$Path
  )

  $values = @{}
  if (-not (Test-Path -LiteralPath $Path)) {
    return $values
  }

  foreach ($line in Get-Content -LiteralPath $Path) {
    $trimmedLine = $line.Trim()
    if (-not $trimmedLine -or $trimmedLine.StartsWith("#")) {
      continue
    }

    if ($trimmedLine -notmatch '^\s*([A-Za-z0-9_]+)\s*[:=]\s*(.*)\s*$') {
      continue
    }

    $key = $matches[1]
    $value = $matches[2].Trim()
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

function Resolve-GitHubRepository {
  [CmdletBinding()]
  param(
    [string]$RemoteName = "origin"
  )

  $remoteUrl = (& git remote get-url $RemoteName 2>$null).Trim()
  if (-not $remoteUrl) {
    throw "Unable to resolve git remote '$RemoteName'."
  }

  if ($remoteUrl -match 'github\.com[:/](?<owner>[^/]+)/(?<repo>[^/.]+?)(?:\.git)?$') {
    return "$($matches.owner)/$($matches.repo)"
  }

  throw "Unable to parse GitHub repository slug from remote URL '$remoteUrl'."
}

function Ensure-GitHubAuthentication {
  [CmdletBinding()]
  param(
    [hashtable]$EnvValues = @{}
  )

  if (-not $env:GH_TOKEN -and -not $env:GITHUB_TOKEN -and $EnvValues.ContainsKey("STATIC_CUTOVER_GITHUB_TOKEN")) {
    $env:GH_TOKEN = [string]$EnvValues.STATIC_CUTOVER_GITHUB_TOKEN
  }

  $null = Invoke-Gh -Arguments @("auth", "status")
}

function Ensure-AzExtensionInstalled {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)]
    [string]$Name
  )

  $null = & az extension show --name $Name --only-show-errors 2>$null
  if ($LASTEXITCODE -eq 0) {
    return
  }

  Write-Host "Installing Azure CLI extension '$Name'..."
  $null = & az extension add --name $Name --upgrade --only-show-errors
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to install Azure CLI extension '$Name'."
  }
}

function Get-LogAnalyticsWorkspaceName {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)]
    [string]$ApplicationInsightsName
  )

  if ($ApplicationInsightsName -match '^appi-(.+)$') {
    return "log-$($matches[1])"
  }

  return "$ApplicationInsightsName-law"
}

function ConvertTo-TagArgumentList {
  [CmdletBinding()]
  param(
    [hashtable]$Tags
  )

  if ($null -eq $Tags -or $Tags.Count -eq 0) {
    return @()
  }

  return @($Tags.GetEnumerator() | Sort-Object Key | ForEach-Object { "{0}={1}" -f $_.Key, $_.Value })
}

function Get-StorageAccountNameFromConnectionString {
  [CmdletBinding()]
  param(
    [AllowEmptyString()]
    [string]$ConnectionString
  )

  if ([string]::IsNullOrWhiteSpace($ConnectionString)) {
    return $null
  }

  if ($ConnectionString -match 'AccountName=([^;]+)') {
    return [string]$matches[1]
  }

  return $null
}

Export-ModuleMember -Function ConvertTo-TagArgumentList, Ensure-AzExtensionInstalled, Ensure-GhCli, Ensure-GitHubAuthentication, Get-LogAnalyticsWorkspaceName, Get-StorageAccountNameFromConnectionString, Get-WorkspaceRoot, Import-LooseEnvFile, Invoke-Gh, Resolve-GitHubRepository
