# Novelova CLI & Remote Deployment Guide

This guide provides end-to-end instructions for deploying, installing, and configuring the **Novelova CLI** (`novelova`) on remote devices—including developer workstations, cloud servers, headless CI/CD runners, and autonomous AI agent execution environments.

---

## 1. Distribution Strategies Overview

Depending on your remote environment's access constraints, you can choose from three primary distribution methods:

| Strategy | Ideal Use Case | Dependencies on Remote Device | Installation Speed |
| :--- | :--- | :--- | :--- |
| **Method 1: Standalone Binary (Recommended)** | Developer laptops, remote servers, AI agent sandboxes | None (Zero Python or external runtime needed) | **< 5 seconds** |
| **Method 2: One-Line Installer Script** | Quick setup via SSH or remote shells | `curl`, `bash` | **< 10 seconds** |
| **Method 3: `uv tool` or `pipx`** | Python developer machines, automated scripts | Python 3.10+ & `uv` or `pipx` | **< 15 seconds** |
| **Method 4: Minimal Docker Container** | Kubernetes, AWS ECS, cloud agent sandboxes | Docker / Podman | **Instant pull** |

---

## 2. Method 1: Standalone Single-Binary Deployment (Recommended)

The standalone binary bundles Python 3.12, Typer, Rich, HTTPX, and all core Novelova schemas into a single self-contained executable.

### 2.1 Compiling Multi-Platform Binaries
To build the binaries for remote distribution, run the compilation script from the root of the Novelova repository:

```bash
# Compile for current host architecture (creates dist/novelova)
pnpm build:cli
# Or directly via uv:
uv run python packages/novelova-cli/scripts/build_binary.py
```

### 2.2 Automated Cross-Platform GitHub Release Workflow
The included GitHub Actions workflow ([`.github/workflows/release-cli.yml`](file:///.github/workflows/release-cli.yml)) automatically cross-compiles binaries for every platform on tag pushes (`v*` or `cli-v*`):

- **Linux x86_64**: `novelova-linux-x64`
- **macOS Apple Silicon**: `novelova-darwin-arm64` (M1/M2/M3/M4)
- **macOS Intel**: `novelova-darwin-x64`
- **Windows x64**: `novelova-windows-x64.exe`

### 2.3 Manual Copy to Remote Device via SCP / SSH
If you have SSH access to your remote machine:

```bash
# 1. Copy the precompiled binary to the remote server
scp ./dist/novelova user@remote-host:/tmp/novelova

# 2. SSH into the remote machine and move to system PATH
ssh user@remote-host "sudo mv /tmp/novelova /usr/local/bin/novelova && sudo chmod +x /usr/local/bin/novelova"

# 3. Verify installation
ssh user@remote-host "novelova --help"
```

---

## 3. Method 2: One-Line Remote Installer

On any remote machine running Linux or macOS, install the CLI with a single command:

```bash
# Installs directly from GitHub release or custom repository
curl -fsSL https://raw.githubusercontent.com/novelova/novelova/main/packages/novelova-cli/scripts/install.sh | bash
```

### Custom Installation Directory (Non-Root)
If the remote environment does not have `sudo` or root permissions (e.g. shared HPC or restricted agent sandbox):

```bash
INSTALL_DIR=$HOME/.local/bin curl -fsSL https://raw.githubusercontent.com/novelova/novelova/main/packages/novelova-cli/scripts/install.sh | bash
```

Ensure `$HOME/.local/bin` is in your `PATH`:
```bash
export PATH="$HOME/.local/bin:$PATH"
```

---

## 4. Method 3: Installation via `uv tool` or `pipx`

If the remote machine has `uv` or `pipx` installed:

### Using `uv` (Fastest Python Tool Manager):
```bash
# Direct install from Git repository
uv tool install "git+https://github.com/novelova/novelova.git#subdirectory=packages/novelova-cli"

# Or from local clone
uv tool install ./packages/novelova-cli
```

### Using `pipx`:
```bash
pipx install "git+https://github.com/novelova/novelova.git#subdirectory=packages/novelova-cli"
```

To update an existing installation:
```bash
uv tool upgrade novelova
# Or
pipx upgrade novelova
```

---

## 5. Method 4: Docker Container for Cloud Agents & CI/CD

For cloud agent execution environments (such as Kubernetes pods, AWS Fargate, or GitHub Actions runners), use the minimal container:

### Build Container
```bash
docker build -f Dockerfile.cli -t novelova:latest .
```

### Run Containerized CLI
```bash
docker run --rm \
  -e NOVELOVA_API_BASE_URL="https://api.novelova.app/api/v1" \
  -e NOVELOVA_API_TOKEN="nv_live_YOUR_TOKEN" \
  -v $(pwd)/downloads:/home/novelova/Downloads \
  novelova:latest synthesize status --json
```

---

## 6. Configuring Remote Backend Connectivity

When the CLI runs remotely, it needs to communicate with your central FastAPI backend over HTTPS.

### 6.1 Backend Reverse Proxy Setup (Nginx Example)
Expose the FastAPI backend (`http://localhost:8000`) securely over TLS:

```nginx
server {
    server_name api.novelova.app;

    client_max_body_size 500M; # Required for large manuscript & audio uploads

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket support for real-time progress feeds
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    listen 443 ssl http2;
    ssl_certificate /etc/letsencrypt/live/api.novelova.app/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.novelova.app/privkey.pem;
}
```

### 6.2 Setting Remote API Target
On the remote machine, configure the endpoint:

```bash
# Option A: System-wide environment variable (recommended for CI/CD and AI agents)
export NOVELOVA_API_BASE_URL="https://api.novelova.app/api/v1"

# Option B: Persist in CLI config
novelova config set api_url "https://api.novelova.app/api/v1"
```

---

## 7. Remote Authentication Setup

### 7.1 Interactive Authentication (Developer Workstations)
On remote machines with interactive terminal access:

```bash
novelova auth login --email developer@novelova.app --password "YourStrongPassword!"
```

### 7.2 Non-Interactive Authentication (Autonomous AI Agents & CI/CD)
Autonomous agents cannot perform interactive password logins. Use high-entropy Developer API Tokens:

1. **Generate Token in Web GUI**:
   Navigate to **Profile Settings $\to$ Developer Settings $\to$ Generate API Token**.
   Configure name, optional expiration, and scope.
2. **Or Generate via CLI on Authorized Machine**:
   ```bash
   novelova auth token --create --name "Remote-Agent-Cluster-1" --json
   ```
3. **Inject Token on Remote Device**:
   ```bash
   # In remote environment or .env file:
   export NOVELOVA_API_TOKEN="nv_live_7b92f4e3c98..."
   ```

---

## 8. Verification Checklist for Remote Installation

Run this 4-step sanity check on any freshly deployed remote machine:

### Step 1: Verify Binary Execution
```bash
novelova --version
```
*Expected*: Returns CLI version (e.g. `novelova 0.1.0`).

### Step 2: Verify Network Reachability & Backend Health
```bash
curl -fsSL "${NOVELOVA_API_BASE_URL:-http://localhost:8000/api/v1}/health"
```
*Expected*: `{"status":"ok"}`.

### Step 3: Verify Authentication Context
```bash
novelova auth status --json
```
*Expected*:
```json
{
  "authenticated": true,
  "api_url": "https://api.novelova.app/api/v1",
  "user": {
    "email": "user@novelova.app"
  }
}
```

### Step 4: Verify Project Discovery
```bash
novelova projects list --limit 1 --json
```
*Expected*: Clean JSON array of projects with status code 0.

---

## 9. Troubleshooting & Common Remote Issues

| Symptom | Probable Cause | Resolution |
| :--- | :--- | :--- |
| `Permission denied` on execution | Missing executable flag | Run `chmod +x /path/to/novelova`. |
| `Connection refused` | API server unreachable or port blocked | Verify firewall (`ufw allow 443`) and ensure `NOVELOVA_API_BASE_URL` points to public domain rather than `localhost`. |
| `HTTP 401 Unauthorized` | Invalid or expired token | Refresh token or re-run `novelova auth login`. Verify `NOVELOVA_API_TOKEN` matches `nv_live_...`. |
| `GLIBC version not found` (Linux) | Binary built on newer Linux kernel than remote target | Use GitHub Actions runner (`ubuntu-22.04` produces compatible glibc 2.35) or deploy via Docker / `uv tool`. |
| `Operation timed out` on Kaggle dispatch | Remote machine network latency | CLI automatically retries with exponential backoff; check Kaggle pool status with `novelova kaggle status`. |
