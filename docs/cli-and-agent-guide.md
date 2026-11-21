# Novelova CLI & AI Agent Architecture & Operations Manual

The **Novelova CLI** (`novelova`) and **Model Context Protocol Server** (`novelova-mcp`) provide 100% feature parity with the Novelova Studio web application. Designed from the ground up for both human creative directors and autonomous AI agents, it provides full control over novel projects, manuscript parsing, AI dialogue attribution, character voice casting, pronunciation dictionaries, and multi-account distributed GPU synthesis.

---

## 1. Architectural Overview

```
                                  +-----------------------------+
                                  | Autonomous AI Agents        |
                                  | (Claude, Antigravity, etc.) |
                                  +--------------+--------------+
                                                 |
                   JSON Stdio MCP / JSON-RPC     |     CLI subprocess (--json)
                                                 v
+-------------------------------+  +-------------+--------------+
| Human Creative Director       |  | novelova-mcp               |
| (Interactive Terminal / Shell)|  | (Model Context Protocol)   |
+---------------+---------------+  +-------------+--------------+
                |                                |
                | Rich ANSI tables / spinners    | Internal client
                +--------------->+<--------------+
                                 |
                         +-------v-------+
                         | novelova CLI  |
                         +-------+-------+
                                 | HTTPS / REST (JWT / API Token)
                                 v
                 +---------------+---------------+
                 | Novelova API Server (FastAPI) |
                 +---------------+---------------+
                                 |
        +------------------------+------------------------+
        |                        |                        |
+-------v-------+        +-------v-------+        +-------v-------+
| PostgreSQL    |        | RustFS / S3   |        | Kaggle Multi- |
| Database      |        | Object Store  |        | GPU Cluster   |
+---------------+        +---------------+        +-------+-------+
                                                          |
                                           Audio Artifacts (Takes & Stems)
                                                          |
                                                          v
                                                  +-------+-------+
                                                  | Cloudflare R2 |
                                                  +-------+-------+
                                                          |
                                          Token-Bucket Transfer
                                                          v
                                                  +-------+-------+
                                                  | Google Drive  |
                                                  +---------------+
```

### Key Capabilities
- **Human & AI Dual Mode**:
  - **Human Mode**: Colored status trees, Rich progress spinners, interactive selection, and formatted markdown rendering.
  - **Machine Mode (`--json`)**: Deterministic, schema-validated JSON outputs on stdout, with exit codes adhering strictly to UNIX standards (`0` for success, non-zero for actionable errors).
- **Dual Authentication**:
  - Short-lived JWT sessions via email/password credentials (`novelova auth login`).
  - High-entropy, long-lived Developer API Tokens (`nv_live_...`) with configurable permissions and rate limits.
- **Distributed Kaggle Synthesis**:
  - Multi-account scheduler supporting up to 8 concurrent GPU notebooks across accounts.
  - Round-robin chapter distribution with a maximum of 10 chapters per notebook batch.
  - Automatic 30-second cooldown backoff for concurrent session limits.
- **Persistent Model Selection**:
  - Seamless dataset mounting for Chatterbox-Turbo and Kokoro-82m without repeated uploads.
- **Real-Time Pipeline**:
  - Kaggle $\to$ Cloudflare R2 $\to$ Google Drive (token-bucket rate limited) $\to$ Local Downloads (`--download-realtime`).

---

## 2. Configuration & State Management

The CLI stores persistent state and active project pointers locally in standard user configuration directories:

- **Configuration File**: `~/.novelova/config.json`
- **Credentials Vault**: `~/.novelova/credentials.json`
- **Download Root**: `~/Downloads/<Project Name>/`

### Configuration Precedence Order
1. CLI Flag (e.g. `--project <id>`, `--token <token>`)
2. Environment Variable (`NOVELOVA_API_TOKEN`, `NOVELOVA_API_BASE_URL`)
3. Stored Config File (`~/.novelova/config.json` & `~/.novelova/credentials.json`)
4. Monorepo / Localhost Default (`http://localhost:8000/api/v1`)

### Environment Variables
| Variable | Description | Example |
| :--- | :--- | :--- |
| `NOVELOVA_API_BASE_URL` | Base endpoint of the Novelova API | `https://api.novelova.app/api/v1` |
| `NOVELOVA_API_TOKEN` | Bearer API token for non-interactive execution | `nv_live_9f81a7...` |
| `NOVELOVA_PROJECT_ID` | Default project ID for all contextual commands | `1c5f74ce-957a-4e53-beb9-33029a87c5a5` |

---

## 3. Command Reference

### 3.1 Authentication (`novelova auth`)

```bash
# Interactive email/password login
novelova auth login --email admin@novelova.app --password SecretPassword123!

# Token-based authentication (recommended for headless agents)
novelova auth login --token nv_live_abc123...

# Check authentication state (JSON mode)
novelova auth status --json

# Clear active session
novelova auth logout
```

### 3.2 Project Management (`novelova projects`)

```bash
# List existing projects
novelova projects list --limit 20 --json

# Create a project with cover art and full metadata
novelova projects create \
  --title "Shadow Slave" \
  --author "GuiltyThree" \
  --publisher "elhamdev" \
  --genre "Dark Fantasy / LitRPG" \
  --language "en" \
  --publication-date "2026-11-21" \
  --created-date "2026-11-21" \
  --cover /path/to/cover.jpg \
  --json

# Select active project context (omits --project in future calls)
novelova projects select <project_id> --json

# Show project details and chapter counts
novelova projects show [project_id] --json

# Delete project
novelova projects delete <project_id> --force --json
```

### 3.3 Manuscript Ingestion & Stage A Parsing (`novelova manuscripts`)

```bash
# Upload manuscript text file with sentence-level segmentation
novelova manuscripts upload ./manuscript.txt --sentence-wise --json

# Import directly from Web Novel URL (e.g. RoyalRoad)
novelova manuscripts import-url "https://royalroad.com/fiction/..." --json

# Inspect raw manuscript text buffer
novelova manuscripts content --offset 0 --limit 2000 --json
```

### 3.4 Chapters & Stage B Dialogue Tagging (`novelova chapters`)

```bash
# List all parsed chapters
novelova chapters list --json

# Inspect chapter segments, speaker attributions, and emotions
novelova chapters show <chapter_id> --limit-segments 50 --json

# Trigger Stage B character dialogue attribution
novelova chapters tag --json

# Fast offline heuristic tagging (ideal for test and high-speed runs)
novelova chapters tag --offline --json

# Monitor tagging progress
novelova chapters tag-status --json
```

### 3.5 Character Casting & Aliases (`novelova cast`)

```bash
# List discovered characters, dialogue counts, and active voices
novelova cast list --json

# Manually assign character voice
novelova cast assign "Sunny" --voice "af_sky" --json

# Merge alias into canonical character
novelova cast merge "Sunless" "Sunny" --json

# Auto-cast all characters based on detected gender
novelova cast auto-cast --json
```

### 3.6 Pronunciation Overrides (`novelova pronunciation`)

```bash
# List phonetic rules
novelova pronunciation list --json

# Add phonetic replacement
novelova pronunciation add "Sunless" "Sun-less" --json

# Find all occurrences of a term across manuscript segments
novelova pronunciation find "Mjolnir" --replacement "Me-yol-neer" --json

# Remove phonetic rule
novelova pronunciation delete <rule_id> --json
```

### 3.7 Kaggle Multi-Account GPU Pool (`novelova kaggle`)

```bash
# List registered Kaggle accounts
novelova kaggle list --json

# Register new Kaggle GPU account with credentials
novelova kaggle add --username "novelova_gpu_1" --key "KGAT_abc..." --priority 1 --json

# Test account connectivity and quota
novelova kaggle test <account_id> --json

# View GPU cluster capacity, active lanes, and remaining hours
novelova kaggle status --json
```

### 3.8 Distributed Synthesis (`novelova synthesize`)

```bash
# Launch multi-lane synthesis with persistent model dataset mounting
novelova synthesize run \
  --model chatterbox-turbo \
  --persistent-model \
  --batch-size 10 \
  --lanes 8 \
  --json

# Launch synthesis with real-time streaming downloads to ~/Downloads/<Project Name>/
novelova synthesize run --download-realtime

# Query real-time lane progress
novelova synthesize status --json

# Cancel ongoing synthesis
novelova synthesize cancel --json
```

---

## 4. Model Context Protocol (MCP) Server

Novelova includes a standard **Model Context Protocol (MCP)** server (`@novelova/mcp` / `packages/novelova-mcp`) enabling direct, tool-based integration into AI agent harnesses like Claude Desktop, Cursor, Antigravity, and OpenCode.

### Claude Desktop Configuration
Add the following to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "novelova": {
      "command": "novelova",
      "args": ["mcp"],
      "env": {
        "NOVELOVA_API_BASE_URL": "https://api.novelova.app/api/v1",
        "NOVELOVA_API_TOKEN": "nv_live_YOUR_API_TOKEN_HERE"
      }
    }
  }
}
```

### Exposed MCP Tools
- `novelova_create_project`: Create project with metadata and cover image.
- `novelova_upload_manuscript`: Upload text manuscript and trigger Stage A sentence parsing.
- `novelova_tag_chapters`: Trigger Stage B character dialogue attribution.
- `novelova_add_pronunciation`: Register phonetic pronunciation dictionary overrides.
- `novelova_auto_cast`: Automatically assign voice models to characters by gender.
- `novelova_synthesize`: Execute multi-lane distributed Kaggle synthesis with optional real-time downloads.
- `novelova_synthesis_status`: Query active GPU lane status, audio progress, and completed chapters.
