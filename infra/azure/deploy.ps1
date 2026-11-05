<#
.SYNOPSIS
  Deploys LegacyNexus AI to Azure (DEPLOYMENT_PROFILE=cloud): infrastructure, images and app rollout.

.DESCRIPTION
  First run : creates every resource with placeholder images, builds the images in Azure Container
              Registry (no local Docker needed), then rolls them out.
  Later runs: builds new images and redeploys. Existing secrets are reused from Key Vault, never rotated.

.EXAMPLE
  ./deploy.ps1 -ResourceGroup rg-legacynexus-prod -Location westeurope -AdminEmail admin@contoso.com

.EXAMPLE
  # Lowest cost (free-account sizes) with Azure OpenAI gpt-4o-mini + text-embedding-3-small
  ./deploy.ps1 -ResourceGroup rg-legacynexus-dev -Env dev -AdminEmail admin@contoso.com -Sizing free -WithAzureOpenAI

.EXAMPLE
  # Free trial subscriptions block cloud builds (ACR Tasks): build with local Docker and push instead
  ./deploy.ps1 -ResourceGroup rg-legacynexus-dev -Env dev -AdminEmail admin@contoso.com -Sizing free -LocalBuild
#>
param(
  [Parameter(Mandatory = $true)] [string] $ResourceGroup,
  [string] $Location = "westeurope",
  [string] $NamePrefix = "lnx",
  [string] $Env = "prod",
  [Parameter(Mandatory = $true)] [string] $AdminEmail,
  [switch] $AllowSignup,
  [ValidateSet("free", "standard")] [string] $Sizing = "standard",
  [switch] $WithAzureOpenAI,
  [string] $OpenAILocation = "",
  # Build the images with Docker on this machine and push them, instead of building in Azure (az acr build)
  [switch] $LocalBuild,
  # First run only: generate the first administrator's password instead of prompting (non-interactive runs).
  # It is stored only in Key Vault as bootstrap-admin-password.
  [switch] $GenerateAdminPassword,
  # Use a Container Registry that already exists in the resource group instead of creating one
  [string] $ExistingAcrName = "",
  # Region for PostgreSQL only, when -Location does not allow it (free trials often hit this)
  [string] $DbLocation = ""
)
# "Continue", not "Stop": in Windows PowerShell 5.1, "Stop" turns any warning that az or docker writes to
# stderr into a fatal error. Failures are caught with Assert-Ok after each command instead.
$ErrorActionPreference = "Continue"
$root = Resolve-Path (Join-Path $PSScriptRoot "../..")
$deploymentName = "legacynexus-$Env"
$tag = (Get-Date -Format "yyyyMMddHHmm")

# Windows PowerShell does not stop on a failing native command (az, docker), so check each one.
function Assert-Ok([string] $what) {
  if ($LASTEXITCODE -ne 0) { throw "$what failed (exit code $LASTEXITCODE)" }
}

# Check Docker before the long infrastructure step, so a missing Docker fails in seconds, not after 15 minutes.
if ($LocalBuild) {
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw "-LocalBuild needs Docker Desktop installed" }
  docker info *> $null
  if ($LASTEXITCODE -ne 0) { throw "Docker is installed but not running: start Docker Desktop and try again" }
}

function New-Secret([int] $bytes = 36) {
  $b = New-Object byte[] $bytes
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
  return ([Convert]::ToBase64String($b) -replace '[+/=]', 'x')
}

Write-Host "==> Resource group $ResourceGroup ($Location)"
az group create -n $ResourceGroup -l $Location -o none
Assert-Ok "Creating resource group $ResourceGroup"

$me = az ad signed-in-user show --query id -o tsv 2>$null
$principalType = "User"
if (-not $me) { $me = az account show --query user.name -o tsv; $principalType = "ServicePrincipal" }

# Existing deployment? Reuse its Key Vault secrets and registry.
$existing = az deployment group show -g $ResourceGroup -n $deploymentName --query properties.outputs -o json 2>$null | ConvertFrom-Json
$first = -not $existing
$common = @("namePrefix=$NamePrefix", "env=$Env", "bootstrapAdminEmail=$AdminEmail", "allowSignup=$($AllowSignup.IsPresent.ToString().ToLower())",
            "deployerPrincipalId=$me", "deployerPrincipalType=$principalType", "sizing=$Sizing",
            "deployOpenAI=$($WithAzureOpenAI.IsPresent.ToString().ToLower())")
if ($OpenAILocation) { $common += "openAILocation=$OpenAILocation" }
if ($ExistingAcrName) { $common += "existingAcrName=$ExistingAcrName" }
if ($DbLocation) { $common += "dbLocation=$DbLocation" }

if ($first) {
  Write-Host "==> First deployment: generating secrets (stored only in Key Vault)"
  $dbPassword = "Lnx!" + (New-Secret 24)
  $secretKey = New-Secret 48
  if ($GenerateAdminPassword) {
    $adminPlain = "Adm!" + (New-Secret 18)
  } else {
    $adminPassword = Read-Host -Prompt "Password for the first administrator ($AdminEmail)" -AsSecureString
    $adminPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($adminPassword))
  }

  Write-Host "==> Creating infrastructure (10-15 minutes)"
  $out = az deployment group create -g $ResourceGroup -n $deploymentName -f (Join-Path $PSScriptRoot "main.bicep") `
    -p $common "dbAdminPassword=$dbPassword" "appSecretKey=$secretKey" "bootstrapAdminPassword=$adminPlain" `
    --query properties.outputs -o json | ConvertFrom-Json
  Assert-Ok "Infrastructure deployment"
} else {
  $out = $existing
  $dbPassword = az keyvault secret show --vault-name $out.keyVaultName.value -n db-password --query value -o tsv
  Assert-Ok "Reading db-password from Key Vault"
}

$acr = $out.acrName.value
$server = $out.acrLoginServer.value
$apiImage = "$server/legacynexus-api:$tag"
$webImage = "$server/legacynexus-web:$tag"

if ($LocalBuild) {
  Write-Host "==> Building images locally and pushing to $server (tag $tag)"
  az acr login -n $acr
  Assert-Ok "az acr login"
  # Container Apps runs linux/amd64; say so explicitly in case this machine is ARM.
  docker build --platform linux/amd64 -t $apiImage (Join-Path $root "backend")
  Assert-Ok "docker build (api)"
  docker build --platform linux/amd64 -t $webImage (Join-Path $root "frontend")
  Assert-Ok "docker build (web)"
  docker push $apiImage
  Assert-Ok "docker push (api)"
  docker push $webImage
  Assert-Ok "docker push (web)"
} else {
  Write-Host "==> Building images in $acr (tag $tag)"
  az acr build -r $acr -t "legacynexus-api:$tag" (Join-Path $root "backend") -o none
  Assert-Ok "az acr build (api) - on a free trial subscription use -LocalBuild"
  az acr build -r $acr -t "legacynexus-web:$tag" (Join-Path $root "frontend") -o none
  Assert-Ok "az acr build (web)"
}

Write-Host "==> Rolling out images"
$out = az deployment group create -g $ResourceGroup -n $deploymentName -f (Join-Path $PSScriptRoot "main.bicep") `
  -p $common "dbAdminPassword=$dbPassword" "apiImage=$apiImage" "webImage=$webImage" `
  --query properties.outputs -o json | ConvertFrom-Json
Assert-Ok "Rolling out images"

Write-Host ""
Write-Host "LegacyNexus AI is deployed: $($out.webUrl.value)"
Write-Host "Readiness of every backing service: $($out.webUrl.value)/api/health/ready"
if ($first -and $GenerateAdminPassword) {
  Write-Host "Admin password: az keyvault secret show --vault-name $($out.keyVaultName.value) -n bootstrap-admin-password --query value -o tsv"
}
