# Deploying LegacyNexus AI to Azure

This guide covers what you need, which Azure resources are created, and how to deploy step by step. It is
written for an Azure **free trial** subscription, with the Docker images built locally (Rancher Desktop or
Docker Desktop) and pushed to Azure Container Registry.

For the design behind these choices, see [infra/azure/README.md](infra/azure/README.md).

---

## 1. Architecture

```
Browser
   │  HTTPS
   ▼
web  (Container App, public)          nginx + React UI, forwards /api/* to the API
   │  internal HTTPS
   ▼
api  (Container App, internal)        FastAPI backend
   │
   ├──► PostgreSQL Flexible Server (pgvector)
   │       ├─ database legacynexus         platform data, code graph, Code Q&A + vectors
   │       └─ database legacynexus_docqa   Document Q&A + vectors
   ├──► Azure Files share  (/app/data)     uploaded code, caches
   ├──► Key Vault                          secrets (read through a managed identity)
   └──► Service Bus queue "analysis-jobs"
              │
              ▼
         worker (Container Apps Job)       runs analysis / indexing jobs, scales 0..N on queue length
```

The same two images run locally (`docker compose`) and on Azure. Only configuration differs, and on Azure
all configuration is set by the Bicep template. **No connection strings or passwords go into the images.**

---

## 2. Requirements

### 2.1 Azure account

| Requirement | Details |
|---|---|
| Azure subscription | Free trial ($200 credit for 30 days + 12 months of selected free services) or Pay-As-You-Go |
| Permissions | **Owner** on the subscription, or **Contributor + User Access Administrator** (the template assigns roles to the app's managed identity) |
| Region | One where PostgreSQL Flexible Server is offered to your subscription, e.g. `centralindia`, `southindia`, `eastus`, `westeurope` |

> **Free trial notes**
> - Cloud image builds (`az acr build`, ACR Tasks) are blocked on free-credit subscriptions. Use `-LocalBuild`
>   (section 5), which builds on your machine and pushes the images.
> - After 30 days the trial must be upgraded to Pay-As-You-Go or all resources are disabled. Upgrading keeps
>   the remaining credit and the 12-month free services.
> - Azure OpenAI may be unavailable or have no quota on a trial. It is optional (section 7).

### 2.2 Tools on your machine

| Tool | Version | Used for | Check |
|---|---|---|---|
| Azure CLI | 2.60+ | Signing in, creating resources | `az version` |
| Bicep (via Azure CLI) | latest | Infrastructure template | `az bicep install` |
| Rancher Desktop **or** Docker Desktop | any recent | Building and pushing images | `docker info` |
| PowerShell | 5.1+ (Windows) | Running `deploy.ps1` | `$PSVersionTable` |

Rancher Desktop settings:

- **Preferences → Container Engine:** `dockerd (moby)`. `containerd` does not provide the `docker` command.
- **Preferences → Kubernetes:** can be turned off (not needed, saves memory).
- Keep it running for the whole deployment.

### 2.3 Project files used

| File | Purpose |
|---|---|
| [backend/Dockerfile](backend/Dockerfile) | API + worker image (Python 3.12, FastAPI, port 8000) |
| [frontend/Dockerfile](frontend/Dockerfile) | Web image (React build served by nginx, port 80) |
| [frontend/nginx.conf](frontend/nginx.conf) | Forwards `/api/*` to `BACKEND_URL` |
| [infra/azure/main.bicep](infra/azure/main.bicep) | Every Azure resource and all app settings |
| [infra/azure/deploy.ps1](infra/azure/deploy.ps1) | Creates resources, builds/pushes images, rolls out |

---

## 3. Azure resources created

All resources go into one resource group. Names below are for `-NamePrefix lnx -Env dev`; `<suffix>` is a
short unique string generated from the resource group.

| # | Resource | Name | Free-trial size (`-Sizing free`) | Purpose |
|---|---|---|---|---|
| 1 | Resource group | `rg-legacynexus-dev` | – | Holds everything; delete it to remove all |
| 2 | User-assigned managed identity | `lnx-dev-id` | – | Lets the apps pull images, read secrets and use the queue without keys |
| 3 | Log Analytics workspace | `lnx-dev-logs` | PerGB2018, 30-day retention | Container logs |
| 4 | Container Registry | `lnxdevacr<suffix>` | Basic | Stores the `legacynexus-api` and `legacynexus-web` images |
| 5 | Key Vault | `lnxdevkv<suffix>` | Standard, RBAC | Secrets: `secret-key`, `db-password`, `bootstrap-admin-password` (+ `ai-api-key` with Azure OpenAI) |
| 6 | PostgreSQL Flexible Server | `lnx-dev-pg-<suffix>` | Burstable **B1ms**, 32 GB, PostgreSQL 16, pgvector enabled | Two databases: `legacynexus`, `legacynexus_docqa` |
| 7 | Service Bus namespace + queue | `lnx-dev-sb-<suffix>` / `analysis-jobs` | Basic | Background job queue (dead-letter after 5 attempts) |
| 8 | Storage account + file share | `lnxdevst<suffix>` / `legacynexus-data` | Standard LRS | Mounted at `/app/data` in api and worker |
| 9 | Container Apps environment | `lnx-dev-env` | Consumption | Hosts the apps below |
| 10 | Container App **web** | `lnx-dev-web` | 0.5 vCPU / 1 GiB, 0–3 replicas | Public website |
| 11 | Container App **api** | `lnx-dev-api` | 1 vCPU / 2 GiB, 0–5 replicas | Internal API |
| 12 | Container Apps Job **worker** | `lnx-dev-worker` | 2 vCPU / 4 GiB, 0–10 executions | Processes queued analysis/indexing jobs |
| 13 | Azure OpenAI (optional) | `lnxdevoai<suffix>` | S0; `gpt-4o-mini`, `text-embedding-3-small` | Only with `-WithAzureOpenAI` |

Role assignments created for the managed identity: **AcrPull** (registry), **Key Vault Secrets User**,
**Azure Service Bus Data Sender** and **Data Receiver**. The person deploying gets **Key Vault Secrets
Officer** so the script can read secrets on later runs.

### Approximate cost on the free sizing

| Resource | Cost |
|---|---|
| PostgreSQL B1ms + 32 GB | Free for 12 months on a free account (750 hours/month) |
| Container Apps (web, api, worker) | Covered by the monthly free grant at light use; apps scale to zero when idle |
| Container Registry Basic | About US$5/month |
| Service Bus Basic, Key Vault, Storage | A few cents/month |
| Log Analytics | Free up to 5 GB/month |
| Azure OpenAI | Pay per token |

Check current prices with the Azure pricing calculator. Set a budget alert (section 9).

---

## 4. Configuration (set automatically)

The template sets these environment variables on the api and worker; the app reads them in
[backend/app/config.py](backend/app/config.py). You do **not** edit `.env` files or Dockerfiles for Azure.

| Area | Variables | Value source |
|---|---|---|
| Profile | `DEPLOYMENT_PROFILE=cloud`, `ENVIRONMENT=production` | Fixed |
| App secret | `SECRET_KEY` | Key Vault `secret-key` (generated on first run) |
| Main database | `DB_HOST`, `DB_NAME=legacynexus`, `DB_USER`, `DB_PASSWORD`, `DB_SSLMODE=require` | PostgreSQL server; password from Key Vault |
| Document Q&A database | `DOCQA_DB_NAME=legacynexus_docqa` | Same server |
| Vectors | `VECTOR_STORE=pgvector`, `DOCQA_VECTOR_STORE=pgvector` | Fixed |
| Files | `STORAGE_DIR=/app/data/storage` | Azure Files mount |
| Job queue | `JOB_BACKEND=servicebus`, `SERVICEBUS_NAMESPACE`, `SERVICEBUS_QUEUE=analysis-jobs`, `AZURE_CLIENT_ID` | Service Bus + managed identity (no keys) |
| URLs | `CORS_ORIGINS`, `APP_BASE_URL` | Web app address |
| First admin | `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD` | Script parameter; password from Key Vault |
| Sign-up | `ALLOW_SIGNUP` | `false` unless `-AllowSignup` |
| AI (optional) | `AI_*`, `EMBEDDING_*` | Only with `-WithAzureOpenAI` |
| Web → API | `BACKEND_URL` (web app) | API's internal address |

To add more settings (e.g. SMTP for password-reset emails, upload limits), add entries to `backendEnv` in
[infra/azure/main.bicep](infra/azure/main.bicep) and redeploy.

---

## 5. Deployment steps

Run everything in PowerShell from the project root (`C:\legacynexus`).

### Step 1: Sign in to Azure

```powershell
az login
az account show --query "{name:name, user:user.name}" -o table
```

Confirm the subscription type (should be `FreeTrial_...` or `PayAsYouGo_...`):

```powershell
az rest --method get --url "https://management.azure.com/subscriptions/$(az account show --query id -o tsv)?api-version=2022-12-01" --query "subscriptionPolicies.quotaId" -o tsv
```

If you have several subscriptions: `az account set --subscription "<name or id>"`.

### Step 2: One-time preparation

```powershell
az bicep install
foreach ($p in 'Microsoft.App','Microsoft.ContainerRegistry','Microsoft.DBforPostgreSQL','Microsoft.KeyVault',
               'Microsoft.ServiceBus','Microsoft.Storage','Microsoft.OperationalInsights','Microsoft.ManagedIdentity',
               'Microsoft.CognitiveServices') { az provider register -n $p }
```

### Step 3: Check Docker

```powershell
docker info --format '{{.ServerVersion}} {{.OSType}}/{{.Architecture}}'
```

Expect a version and `linux/x86_64`. If `docker` is not recognised, restart VS Code / the terminal after
installing Rancher Desktop.

### Step 4: Deploy

```powershell
Set-ExecutionPolicy -Scope Process Bypass
./infra/azure/deploy.ps1 -ResourceGroup rg-legacynexus-dev -Env dev -Location centralindia `
  -AdminEmail <your-email> -Sizing free -LocalBuild -GenerateAdminPassword
```

| Parameter | Meaning |
|---|---|
| `-ResourceGroup` | Resource group to create/use |
| `-Env` | Label in resource names (`dev`, `test`, `prod`) |
| `-Location` | Azure region |
| `-AdminEmail` | First administrator's sign-in email |
| `-Sizing free` | Smallest sizes that fit free-account grants |
| `-LocalBuild` | Build images with local Docker and push (required on free trials) |
| `-GenerateAdminPassword` | Generate the admin password and store it in Key Vault (omit to type one) |
| `-WithAzureOpenAI` | Optional: create Azure OpenAI with chat + embedding models |
| `-OpenAILocation` | Optional: region for Azure OpenAI if your main region lacks the models |
| `-AllowSignup` | Optional: allow self sign-up (default is invite-only) |

What the script does:

1. Creates the resource group.
2. **First run only:** generates secrets and creates all resources with placeholder images (10–15 min).
3. Signs in to the registry, builds both images (`linux/amd64`) and pushes them (5–10 min).
4. Updates the Container Apps to the new images.
5. Prints the web address.

### Step 5: Verify

1. Open `https://<web-address>/api/health/ready`. Every component should show `"ok": true`:
   `database`, `vectors`, `docqa_database`, `docqa_vectors`, `storage`, `jobs`.
2. Get the admin password:
   ```powershell
   az keyvault secret show --vault-name <key-vault-name> -n bootstrap-admin-password --query value -o tsv
   ```
   (The script prints this command with the vault name filled in.)
3. Open `https://<web-address>` and sign in with the admin email and that password.

The first request after idle time can take 10–30 seconds while the apps start (they scale to zero).

---

## 6. Updating the application

After code changes, run the same command as in step 4. It builds new images with a new tag, pushes them and
rolls them out. Secrets are reused from Key Vault and never rotated; data is kept.

---

## 7. AI model setup

Without `-WithAzureOpenAI`, configure the model in the app after deployment:

- **Settings → AI models:** choose a provider (Azure OpenAI, OpenAI, Anthropic, Gemini, OpenAI-compatible)
  and enter its key.
- **Settings → Semantic search / embeddings:** choose the embedding provider and model.

For Azure OpenAI entered manually: Endpoint `https://<name>.openai.azure.com`, Deployment (e.g.
`gpt-4o-mini` / `text-embedding-3-small`), API version `2024-10-21`, API key.

Alternatively, rerun the deploy with `-WithAzureOpenAI`. Those values are applied only while nothing is set
in Settings, so an administrator's choice is never overwritten.

---

## 8. Troubleshooting

| Problem | Fix |
|---|---|
| `location is restricted` / PostgreSQL not available | Use another `-Location` (e.g. `eastus`, `southindia`) with a new resource group |
| `TasksOperationsNotAllowed` / ACR build blocked | Add `-LocalBuild` |
| `-LocalBuild needs Docker Desktop installed` | Install Rancher/Docker Desktop and restart the terminal |
| `Docker is installed but not running` | Start Rancher Desktop and wait until it is ready |
| Quota error for Container Apps or vCPUs | Try another region, or request a quota increase in the portal |
| Azure OpenAI deployment fails | Rerun without `-WithAzureOpenAI`; set a provider in Settings |
| Script blocked by execution policy | `Set-ExecutionPolicy -Scope Process Bypass` |
| `/api/health/ready` shows a component not ok | Check logs (below) |
| Sign-in fails 5 times | Account is locked for 15 minutes |

View logs:

```powershell
az containerapp logs show -g rg-legacynexus-dev -n lnx-dev-api --follow
az containerapp logs show -g rg-legacynexus-dev -n lnx-dev-web --follow
az containerapp job execution list -g rg-legacynexus-dev -n lnx-dev-worker -o table
```

---

## 9. Cost control and clean-up

- Portal → **Cost Management → Budgets**: create a small monthly budget (e.g. US$10) with an email alert.
- Stop paying for everything by deleting the resource group:
  ```powershell
  az group delete -n rg-legacynexus-dev --yes
  ```
  Key Vault is soft-deleted for 30 days. To reuse the same name sooner:
  `az keyvault purge -n <key-vault-name>`.

---

## 10. Production hardening (later)

- Private networking: VNet-integrated Container Apps environment, PostgreSQL private access, private
  endpoints for Key Vault, Storage and Service Bus.
- Entra ID (OIDC) sign-in in front of the web app.
- PostgreSQL General Purpose tier with high availability and zone redundancy.
- Application Insights for tracing.
