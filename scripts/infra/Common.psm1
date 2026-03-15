Set-StrictMode -Version Latest

function Ensure-AzCli {
  if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
    throw "Azure CLI is required but was not found on PATH."
  }
}

function Invoke-Az {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)]
    [string[]]$Arguments,

    [switch]$AllowFailure
  )

  $output = & az @Arguments 2>&1
  if (-not $AllowFailure -and $LASTEXITCODE -ne 0) {
    $renderedOutput = ($output | Out-String).Trim()
    throw "Azure CLI command failed: az $($Arguments -join ' ')`n$renderedOutput"
  }

  return ($output | Out-String).Trim()
}

function Invoke-AzJson {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)]
    [string[]]$Arguments,

    [switch]$AllowFailure
  )

  $effectiveArguments = @($Arguments)
  if (-not ($effectiveArguments -contains "--output") -and -not ($effectiveArguments -contains "-o")) {
    $effectiveArguments += @("--output", "json")
  }

  $json = Invoke-Az -Arguments $effectiveArguments -AllowFailure:$AllowFailure
  if ([string]::IsNullOrWhiteSpace($json)) {
    return $null
  }

  return $json | ConvertFrom-Json -Depth 20
}

function Require-AzLogin {
  try {
    $null = Invoke-AzJson -Arguments @("account", "show")
  } catch {
    throw "Azure CLI is not logged in. Run 'az login' and retry."
  }
}

function Ensure-ProviderRegistered {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)]
    [string]$Namespace
  )

  $provider = Invoke-AzJson -Arguments @("provider", "show", "--namespace", $Namespace)
  if ($provider.registrationState -eq "Registered") {
    return
  }

  Write-Host "Registering Azure resource provider '$Namespace'..."
  $null = Invoke-Az -Arguments @("provider", "register", "--namespace", $Namespace, "--wait")
}

function Ensure-BicepAvailable {
  try {
    $null = Invoke-Az -Arguments @("bicep", "version")
  } catch {
    Write-Host "Installing Azure CLI Bicep support..."
    $null = Invoke-Az -Arguments @("bicep", "install")
  }
}

function Set-Subscription {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)]
    [string]$SubscriptionId
  )

  $null = Invoke-Az -Arguments @("account", "set", "--subscription", $SubscriptionId)
}

function Mask-Secret {
  [CmdletBinding()]
  param(
    [AllowEmptyString()]
    [string]$Secret
  )

  if ([string]::IsNullOrEmpty($Secret)) {
    return "<empty>"
  }

  if ($Secret.Length -le 4) {
    return "*" * $Secret.Length
  }

  return ("*" * ($Secret.Length - 4)) + $Secret.Substring($Secret.Length - 4)
}

function New-TemporaryJsonFile {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)]
    [object]$InputObject
  )

  $path = Join-Path ([System.IO.Path]::GetTempPath()) ("nwmiws-" + [System.Guid]::NewGuid() + ".json")
  $InputObject | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $path -Encoding utf8
  return $path
}

Export-ModuleMember -Function Ensure-AzCli, Ensure-BicepAvailable, Ensure-ProviderRegistered, Invoke-Az, Invoke-AzJson, Mask-Secret, New-TemporaryJsonFile, Require-AzLogin, Set-Subscription
