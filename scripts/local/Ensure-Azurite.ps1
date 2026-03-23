[CmdletBinding()]
param(
  [string]$HostAddress = "127.0.0.1",

  [ValidateRange(1, 65535)]
  [int]$BlobPort = 10000,

  [ValidateRange(1, 65535)]
  [int]$QueuePort = 10001,

  [ValidateRange(1, 65535)]
  [int]$TablePort = 10002,

  [string]$Location
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Import-Module (Join-Path $PSScriptRoot "..\common\Repo.Common.psm1") -Force -DisableNameChecking -Verbose:$false

function Test-TcpPortListening {
  param(
    [Parameter(Mandatory)]
    [string]$HostAddress,

    [Parameter(Mandatory)]
    [int]$Port
  )

  $client = [System.Net.Sockets.TcpClient]::new()
  try {
    $result = $client.BeginConnect($HostAddress, $Port, $null, $null)
    if (-not $result.AsyncWaitHandle.WaitOne(500)) {
      return $false
    }

    $client.EndConnect($result)
    return $true
  } catch {
    return $false
  } finally {
    $client.Dispose()
  }
}

$repoRoot = Get-WorkspaceRoot -StartPath $PSScriptRoot
if (-not $Location) {
  $Location = Join-Path $repoRoot ".azurite"
}

$ports = [ordered]@{
  blob = $BlobPort
  queue = $QueuePort
  table = $TablePort
}

Write-ScriptSection "Ensuring Azurite"

$listeningServices = @(
  $ports.GetEnumerator() |
    ForEach-Object {
      [pscustomobject]@{
        Name = [string]$_.Key
        Port = [int]$_.Value
        IsListening = Test-TcpPortListening -HostAddress $HostAddress -Port ([int]$_.Value)
      }
    }
)

$activeServices = @($listeningServices | Where-Object { $_.IsListening })
if ($activeServices.Count -eq $listeningServices.Count) {
  Write-ScriptStep (
    "Azurite services already listening at {0}." -f
    (@($activeServices | ForEach-Object { "http://{0}:{1}" -f $HostAddress, $_.Port }) -join ", ")
  )
  return
}

if ($activeServices.Count -gt 0) {
  $activeSummary = @($activeServices | ForEach-Object { "{0}:{1}" -f $_.Name, $_.Port }) -join ", "
  throw (
    "Partial Azurite port usage detected ({0}). Stop the conflicting process or start a complete Azurite instance before retrying."
  ) -f $activeSummary
}

Write-ScriptStep "Starting Azurite with workspace '$Location'."
$null = New-Item -ItemType Directory -Path $Location -Force

$azuriteArgs = @(
  "azurite",
  "--location",
  $Location,
  "--blobHost",
  $HostAddress,
  "--queueHost",
  $HostAddress,
  "--tableHost",
  $HostAddress
)

& npx @azuriteArgs
exit $LASTEXITCODE
