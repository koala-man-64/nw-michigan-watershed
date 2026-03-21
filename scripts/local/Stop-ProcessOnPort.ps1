[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [ValidateRange(1, 65535)]
  [int]$Port = 9091
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Import-Module (Join-Path $PSScriptRoot "..\common\Repo.Common.psm1") -Force -DisableNameChecking -Verbose:$false

function Add-ProcessId {
  param(
    [System.Collections.Generic.HashSet[int]]$ProcessIds,

    [int]$ProcessId
  )

  if ($ProcessId -gt 0) {
    [void]$ProcessIds.Add($ProcessId)
  }
}

function Get-ProcessIdsForPort {
  param(
    [Parameter(Mandatory)]
    [int]$Port
  )

  $processIds = [System.Collections.Generic.HashSet[int]]::new()

  if (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue) {
    foreach ($connection in @(Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue)) {
      Add-ProcessId -ProcessIds $processIds -ProcessId $connection.OwningProcess
    }
  }

  if (Get-Command Get-NetUDPEndpoint -ErrorAction SilentlyContinue) {
    foreach ($endpoint in @(Get-NetUDPEndpoint -LocalPort $Port -ErrorAction SilentlyContinue)) {
      Add-ProcessId -ProcessIds $processIds -ProcessId $endpoint.OwningProcess
    }
  }

  if ($processIds.Count -eq 0) {
    foreach ($line in @(netstat -ano | Select-String -Pattern (":{0}\s" -f $Port))) {
      if ($line.ToString() -match "\s+(?<ProcessId>\d+)\s*$") {
        Add-ProcessId -ProcessIds $processIds -ProcessId ([int]$matches.ProcessId)
      }
    }
  }

  return @($processIds | Sort-Object)
}

function Get-ProcessesForPort {
  param(
    [Parameter(Mandatory)]
    [int]$Port
  )

  $processes = foreach ($processId in Get-ProcessIdsForPort -Port $Port) {
    Get-Process -Id $processId -ErrorAction SilentlyContinue
  }

  return @($processes | Sort-Object Id -Unique)
}

Write-ScriptSection "Stopping processes on port $Port"

$processes = @(Get-ProcessesForPort -Port $Port)
if ($processes.Count -eq 0) {
  Write-ScriptStep "No processes are using port $Port."
  return
}

$processLabel = if ($processes.Count -eq 1) { "1 process" } else { "$($processes.Count) processes" }
$processSummary = $processes | ForEach-Object { "{0} [{1}]" -f $_.ProcessName, $_.Id }
Write-ScriptStep ("Found {0}: {1}" -f $processLabel, ($processSummary -join ", "))

foreach ($process in $processes) {
  if ($PSCmdlet.ShouldProcess("port $Port", "Stop process $($process.ProcessName) [$($process.Id)]")) {
    Stop-Process -Id $process.Id -Force -ErrorAction Stop
    Write-ScriptStep ("Stopped {0} [{1}]." -f $process.ProcessName, $process.Id)
  }
}

Start-Sleep -Milliseconds 250
$remainingProcesses = @(Get-ProcessesForPort -Port $Port)
if ($remainingProcesses.Count -gt 0) {
  $remainingSummary = $remainingProcesses | ForEach-Object { "{0} [{1}]" -f $_.ProcessName, $_.Id }
  throw "Port $Port is still in use after the stop attempt: $($remainingSummary -join ', ')"
}

Write-ScriptStep "Port $Port is free."
