Set-StrictMode -Version Latest

function Write-ScriptSection {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)]
    [string]$Message
  )

  Write-Host ""
  Write-Host "== $Message ==" -ForegroundColor Cyan
}

function Write-ScriptStep {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)]
    [string]$Message
  )

  Write-Host " -> $Message" -ForegroundColor DarkCyan
}

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

  Write-Verbose ("Running GitHub CLI: gh {0}" -f ($Arguments -join " "))

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

  if ($AllowFailure -and $exitCode -ne 0) {
    Write-Verbose ("GitHub CLI returned exit code {0} for allowed-failure call." -f $exitCode)
  } else {
    Write-Verbose ("GitHub CLI completed with exit code {0}." -f $exitCode)
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
    Write-Verbose "Env file not found at '$Path'."
    return $values
  }

  Write-Verbose "Loading env values from '$Path'."

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

  Write-Verbose "Validating GitHub CLI authentication."
  $null = Invoke-Gh -Arguments @("auth", "status")
}

Export-ModuleMember -Function Ensure-GhCli, Ensure-GitHubAuthentication, Get-WorkspaceRoot, Import-LooseEnvFile, Invoke-Gh, Resolve-GitHubRepository, Write-ScriptSection, Write-ScriptStep
