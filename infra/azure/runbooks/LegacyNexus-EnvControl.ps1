<#
.SYNOPSIS
  Azure Automation runbook: brings the LegacyNexus AI environment up or down on a schedule.

.DESCRIPTION
  Same steps as infra/azure/env-control.ps1, but runs inside Azure with the Automation account's managed
  identity (Contributor on the resource group), so no laptop has to be on.
    Down  : stop web and api Container Apps, then stop PostgreSQL.
    Up    : start PostgreSQL, wait until it is ready, then start api and web.
    Status: report the state of each part (changes nothing; used to test the setup).
  Schedules and setup: infra/azure/schedule-setup.ps1
#>
param(
  [Parameter(Mandatory = $true)] [ValidateSet("Up", "Down", "Status")] [string] $Action,
  [string] $ResourceGroup = "LegacyNexus",
  [string] $NamePrefix = "lnx",
  [string] $Env = "dev"
)
$ErrorActionPreference = "Stop"
$appsApi = "2024-03-01"
$pgApi = "2023-12-01-preview"

Connect-AzAccount -Identity | Out-Null
$sub = (Get-AzContext).Subscription.Id
$base = "$NamePrefix-$Env".ToLower()
$rg = "/subscriptions/$sub/resourceGroups/$ResourceGroup"

function Invoke-Arm([string] $method, [string] $path) {
  $r = Invoke-AzRestMethod -Method $method -Path $path
  if ($r.StatusCode -ge 300) { throw "$method $path failed: HTTP $($r.StatusCode) $($r.Content)" }
  if ($r.Content) { return $r.Content | ConvertFrom-Json }
}

$pgName = (Invoke-Arm GET "$rg/providers/Microsoft.DBforPostgreSQL/flexibleServers?api-version=$pgApi").value |
  Where-Object { $_.name -like "$base-pg-*" } | Select-Object -First 1 -ExpandProperty name
if (-not $pgName) { throw "No PostgreSQL server named $base-pg-* in $ResourceGroup" }
$pgPath = "$rg/providers/Microsoft.DBforPostgreSQL/flexibleServers/$pgName"
$apps = @("$base-web", "$base-api")   # stop order: web first; start order is reversed

function Get-PgState { (Invoke-Arm GET "$pgPath`?api-version=$pgApi").properties.state }
function Get-AppState([string] $app) {
  (Invoke-Arm GET "$rg/providers/Microsoft.App/containerApps/$app`?api-version=$appsApi").properties.runningStatus
}
function Set-App([string] $app, [string] $verb) {
  Write-Output "$verb $app"
  Invoke-Arm POST "$rg/providers/Microsoft.App/containerApps/$app/$verb`?api-version=$appsApi" | Out-Null
}
function Wait-Pg([string] $want, [int] $minutes = 20) {
  $deadline = (Get-Date).AddMinutes($minutes)
  while ((Get-PgState) -ne $want) {
    if ((Get-Date) -gt $deadline) { throw "PostgreSQL did not reach '$want' within $minutes minutes" }
    Start-Sleep -Seconds 20
  }
}
function Show-Status {
  foreach ($app in $apps) { Write-Output ("{0}: {1}" -f $app, (Get-AppState $app)) }
  Write-Output ("{0}: {1}" -f $pgName, (Get-PgState))
}

switch ($Action) {
  "Down" {
    foreach ($app in $apps) { Set-App $app "stop" }
    if ((Get-PgState) -ne "Stopped") {
      Write-Output "stop $pgName"
      Invoke-Arm POST "$pgPath/stop?api-version=$pgApi" | Out-Null
      Wait-Pg "Stopped"
    }
  }
  "Up" {
    if ((Get-PgState) -ne "Ready") {
      Write-Output "start $pgName"
      Invoke-Arm POST "$pgPath/start?api-version=$pgApi" | Out-Null
      Wait-Pg "Ready"
    }
    [array]::Reverse($apps)
    foreach ($app in $apps) { Set-App $app "start" }
  }
}
Show-Status
