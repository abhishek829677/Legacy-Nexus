<#
.SYNOPSIS
  Brings the LegacyNexus AI Azure environment down (to save cost) or back up, or shows its state.

.DESCRIPTION
  Down : stops the web and api Container Apps, then stops the PostgreSQL server (compute is not billed while
         stopped; storage still is). Azure starts a stopped PostgreSQL server again automatically after 7 days.
  Up   : starts PostgreSQL, waits until it is ready, starts api and web, then checks /api/health/ready.
  Status: shows the state of each part.

  Nothing is deleted. Data, images, secrets and settings are kept.

.EXAMPLE
  ./infra/azure/env-control.ps1 -Action Down
  ./infra/azure/env-control.ps1 -Action Up
  ./infra/azure/env-control.ps1 -Action Status
#>
param(
  [Parameter(Mandatory = $true)] [ValidateSet("Up", "Down", "Status")] [string] $Action,
  [string] $ResourceGroup = "LegacyNexus",
  [string] $NamePrefix = "lnx",
  [string] $Env = "dev"
)
$ErrorActionPreference = "Continue"   # az writes warnings to stderr; failures are checked with Assert-Ok
$apiVersion = "2024-03-01"
$base = "$NamePrefix-$Env".ToLower()
$apps = @("$base-web", "$base-api")   # stop order: web first; start order is reversed

function Assert-Ok([string] $what) {
  if ($LASTEXITCODE -ne 0) { throw "$what failed (exit code $LASTEXITCODE)" }
}

$sub = az account show --query id -o tsv
Assert-Ok "Reading the Azure subscription (run az login first)"
$pg = az postgres flexible-server list -g $ResourceGroup --query "[?starts_with(name, '$base-pg-')].name | [0]" -o tsv
Assert-Ok "Finding the PostgreSQL server"
if (-not $pg) { throw "No PostgreSQL server named $base-pg-* in $ResourceGroup" }

function Invoke-App([string] $app, [string] $verb) {
  $url = "https://management.azure.com/subscriptions/$sub/resourceGroups/$ResourceGroup/providers/Microsoft.App/containerApps/$app/$verb`?api-version=$apiVersion"
  az rest --method post --url $url -o none
  Assert-Ok "$verb $app"
}

function Show-Status {
  az containerapp list -g $ResourceGroup --query "[].{app:name, status:properties.runningStatus}" -o table
  az postgres flexible-server show -g $ResourceGroup -n $pg --query "{database:name, state:state}" -o table
}

switch ($Action) {
  "Down" {
    foreach ($app in $apps) { Write-Host "==> Stopping $app"; Invoke-App $app "stop" }
    Write-Host "==> Stopping PostgreSQL $pg (a few minutes)"
    $state = az postgres flexible-server show -g $ResourceGroup -n $pg --query state -o tsv
    if ($state -ne "Stopped") { az postgres flexible-server stop -g $ResourceGroup -n $pg -o none; Assert-Ok "Stopping $pg" }
    Write-Host ""
    Show-Status
    Write-Host "`nEnvironment is down. Note: Azure restarts a stopped PostgreSQL server automatically after 7 days."
  }
  "Up" {
    Write-Host "==> Starting PostgreSQL $pg (a few minutes)"
    $state = az postgres flexible-server show -g $ResourceGroup -n $pg --query state -o tsv
    if ($state -ne "Ready") { az postgres flexible-server start -g $ResourceGroup -n $pg -o none; Assert-Ok "Starting $pg" }
    [array]::Reverse($apps)
    foreach ($app in $apps) { Write-Host "==> Starting $app"; Invoke-App $app "start" }

    $fqdn = az containerapp show -g $ResourceGroup -n "$base-web" --query properties.configuration.ingress.fqdn -o tsv
    $ready = "https://$fqdn/api/health/ready"
    Write-Host "==> Waiting for $ready"
    $ok = $false
    for ($i = 0; $i -lt 30 -and -not $ok; $i++) {
      try { $r = Invoke-WebRequest $ready -UseBasicParsing -TimeoutSec 60; $ok = $r.StatusCode -eq 200 } catch { Start-Sleep 10 }
    }
    Write-Host ""
    Show-Status
    if ($ok) { Write-Host "`nEnvironment is up: https://$fqdn" }
    else { Write-Warning "Started, but $ready did not answer yet. Check again in a minute or read the api logs." }
  }
  "Status" { Show-Status }
}
