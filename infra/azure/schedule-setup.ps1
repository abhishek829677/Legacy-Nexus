<#
.SYNOPSIS
  Sets up the automatic up/down schedule for LegacyNexus AI on Azure (Azure Automation, runs in the cloud).

.DESCRIPTION
  Creates (or updates) an Automation account with a managed identity, gives it Contributor on the resource
  group, publishes runbooks/LegacyNexus-EnvControl.ps1 and links it to two weekly schedules:
    start at -StartAt and stop at -StopAt on -Days (default Monday to Saturday, India time).
  Days not listed get no start, so the app stays down (default: Sunday).
  Safe to run again: it replaces the schedules with the values given.

.EXAMPLE
  ./infra/azure/schedule-setup.ps1
  ./infra/azure/schedule-setup.ps1 -StartAt 08:30 -StopAt 21:00 -Days Monday,Tuesday,Wednesday,Thursday,Friday
  ./infra/azure/schedule-setup.ps1 -Remove     # delete the schedules (the app is no longer started or stopped)
#>
param(
  [string] $ResourceGroup = "LegacyNexus",
  [string] $NamePrefix = "lnx",
  [string] $Env = "dev",
  [string] $StartAt = "09:00",
  [string] $StopAt = "20:00",
  [string[]] $Days = @("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"),
  [string] $TimeZone = "Asia/Kolkata",
  [switch] $Remove
)
$ErrorActionPreference = "Continue"   # az writes warnings to stderr; failures are checked with Assert-Ok
$api = "2023-11-01"
$base = "$NamePrefix-$Env".ToLower()
$accountName = "$base-scheduler"
$runbook = "LegacyNexus-EnvControl"
$tmp = Join-Path ([IO.Path]::GetTempPath()) "lnx-schedule"
New-Item -ItemType Directory -Force $tmp | Out-Null

function Assert-Ok([string] $what) {
  if ($LASTEXITCODE -ne 0) { throw "$what failed (exit code $LASTEXITCODE)" }
}
function Invoke-Json([string] $method, [string] $url, $body) {
  $file = Join-Path $tmp "body.json"
  ($body | ConvertTo-Json -Depth 10) | Set-Content $file -Encoding ascii
  $out = az rest --method $method --url $url --body "@$file" -o json
  Assert-Ok "$method $url"
  if ($out) { return $out | ConvertFrom-Json }
}

$sub = az account show --query id -o tsv
Assert-Ok "Reading the Azure subscription (run az login first)"
$location = az group show -n $ResourceGroup --query location -o tsv
Assert-Ok "Reading resource group $ResourceGroup"
$acct = "https://management.azure.com/subscriptions/$sub/resourceGroups/$ResourceGroup/providers/Microsoft.Automation/automationAccounts/$accountName"

# Remove the existing links first, so re-running never doubles the start/stop jobs.
$links = az rest --method get --url "$acct/jobSchedules?api-version=$api" --query "value[?properties.runbook.name=='$runbook'].properties.jobScheduleId" -o tsv 2>$null
foreach ($id in ($links -split "`n" | Where-Object { $_ })) {
  az rest --method delete --url "$acct/jobSchedules/$($id.Trim())?api-version=$api" -o none
}
if ($Remove) {
  foreach ($s in "$base-start", "$base-stop") { az rest --method delete --url "$acct/schedules/$s`?api-version=$api" -o none 2>$null }
  Write-Host "Schedules removed. The app is no longer started or stopped automatically."
  return
}

Write-Host "==> Automation account $accountName"
$account = Invoke-Json put "$acct`?api-version=$api" @{
  location = $location; identity = @{ type = "SystemAssigned" }; properties = @{ sku = @{ name = "Basic" } }
}
$principal = $account.identity.principalId

Write-Host "==> Contributor on $ResourceGroup for the account's managed identity"
$scope = "/subscriptions/$sub/resourceGroups/$ResourceGroup"
$has = az role assignment list --assignee $principal --scope $scope --role Contributor --query "length(@)" -o tsv 2>$null
if ($has -ne "1") {
  for ($i = 0; $i -lt 6; $i++) {   # a new identity can take a minute to be visible to role assignments
    az role assignment create --assignee-object-id $principal --assignee-principal-type ServicePrincipal `
      --role Contributor --scope $scope -o none 2>$null
    if ($LASTEXITCODE -eq 0) { break }
    Start-Sleep -Seconds 15
  }
  Assert-Ok "Granting Contributor"
}

Write-Host "==> Runbook $runbook"
Invoke-Json put "$acct/runbooks/$runbook`?api-version=$api" @{
  location = $location; properties = @{ runbookType = "PowerShell72"; logProgress = $false; logVerbose = $false
    description = "Brings LegacyNexus up or down (infra/azure/runbooks/LegacyNexus-EnvControl.ps1)" }
} | Out-Null
az rest --method put --url "$acct/runbooks/$runbook/draft/content?api-version=$api" `
  --headers "Content-Type=text/powershell" --body "@$(Join-Path $PSScriptRoot 'runbooks/LegacyNexus-EnvControl.ps1')" -o none
Assert-Ok "Uploading the runbook"
az rest --method post --url "$acct/runbooks/$runbook/publish?api-version=$api" -o none
Assert-Ok "Publishing the runbook"

# First run: the next occurrence of each time that is at least 10 minutes away (Azure requires a future start).
function Next-Start([string] $hhmm) {
  $tz = [TimeZoneInfo]::FindSystemTimeZoneById($(if ($IsWindows -or $env:OS -eq "Windows_NT") { "India Standard Time" } else { $TimeZone }))
  $now = [TimeZoneInfo]::ConvertTime([DateTimeOffset]::UtcNow, $tz)
  $t = [TimeSpan]::Parse($hhmm)
  $at = [DateTimeOffset]::new($now.Date.Add($t), $now.Offset)
  if ($at -lt $now.AddMinutes(10)) { $at = $at.AddDays(1) }
  return $at.ToString("yyyy-MM-ddTHH:mm:sszzz")
}

foreach ($s in @(@{ name = "$base-start"; at = $StartAt; action = "Up" }, @{ name = "$base-stop"; at = $StopAt; action = "Down" })) {
  Write-Host "==> Schedule $($s.name): $($s.action) at $($s.at) on $($Days -join ', ') ($TimeZone)"
  Invoke-Json put "$acct/schedules/$($s.name)?api-version=$api" @{
    properties = @{ startTime = (Next-Start $s.at); frequency = "Week"; interval = 1; timeZone = $TimeZone
      advancedSchedule = @{ weekDays = $Days }; description = "LegacyNexus $($s.action)" }
  } | Out-Null
  Invoke-Json put "$acct/jobSchedules/$([guid]::NewGuid())?api-version=$api" @{
    properties = @{ schedule = @{ name = $s.name }; runbook = @{ name = $runbook }
      parameters = @{ Action = $s.action; ResourceGroup = $ResourceGroup; NamePrefix = $NamePrefix; Env = $Env } }
  } | Out-Null
}

Write-Host ""
Write-Host "Done. LegacyNexus starts at $StartAt and stops at $StopAt on $($Days -join ', ') ($TimeZone)."
Write-Host "Runs and their output: Azure portal > $accountName > Jobs"
