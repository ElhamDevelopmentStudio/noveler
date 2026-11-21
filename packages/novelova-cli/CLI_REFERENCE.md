# Novelova CLI & AI Agent Command Reference

The `novelova` CLI provides 100% feature parity with the GUI and is purpose-built for both human operators and autonomous AI agents.

## Quick Execution

- **Standalone Binary**: `./dist/novelova [command]`
- **Monorepo / Turborepo**: `pnpm cli [command]`
- **Python / UV**: `uv run novelova [command]`

---

## Authentication & Identity

### 1. API Token Authentication (Recommended for AI Agents)
Set your token via environment variable or CLI argument:
```bash
export NOVELOVA_API_TOKEN="nv_live_..."
export NOVELOVA_API_BASE_URL="http://localhost:8000/api/v1"

# Or login via CLI:
novelova auth login --token nv_live_...
```

### 2. User Credentials Login
```bash
novelova auth login --email user@example.com --password secret
```

### 3. Check Status (Machine-Readable JSON)
```bash
novelova auth status --json
```
```json
{
  "authenticated": true,
  "token_type": "API Token (nv_live_...)",
  "api_url": "http://localhost:8000/api/v1",
  "user": {
    "id": "usr_...",
    "name": "Production Agent",
    "email": "agent@novelova.app",
    "role": "admin"
  },
  "active_project_id": "prj_..."
}
```

---

## Project Lifecycle Management

### List Projects
```bash
novelova projects list --limit 20 --json
```

### Create Project
```bash
novelova projects create --title "Shadow Slave" --author "Guiltythree" --genre "LitRPG" --cover ./cover.jpg --json
```

### Select Active Project
```bash
novelova projects select <project_id> --json
```
*Note: Setting an active project allows you to omit `--project <id>` in all subsequent chapter, cast, and synthesis commands.*

### Show Project Details
```bash
novelova projects show [project_id] --json
```

### Delete Project
```bash
novelova projects delete <project_id> --force --json
```

---

## Manuscript Ingestion & Stage A Parsing

### Upload & Parse Manuscript
```bash
novelova manuscripts upload ./manuscript.txt --sentence-wise --json
```

### Import from Web Novel URL
```bash
novelova manuscripts import-url "https://royalroad.com/fiction/..." --json
```

### Inspect Raw Manuscript Content
```bash
novelova manuscripts content --offset 0 --limit 5000 --json
```

---

## Chapters & Stage B Dialogue Tagging

### List Chapters
```bash
novelova chapters list --limit 100 --json
```

### Show Chapter Details & Script Segments
```bash
novelova chapters show <chapter_id> --limit-segments 50 --json
```

### Trigger Stage B Dialogue & Character Attribution
```bash
# Tag all un-tagged chapters with real-time watch:
novelova chapters tag --watch

# Tag specific chapter range:
novelova chapters tag --start 1 --end 25 --json

# Fast offline heuristic attribution:
novelova chapters tag --offline --json
```

### Check Tagging Job Progress
```bash
novelova chapters tag-status --json
```

---

## Dramatis Personae & Voice Casting

### List Cast & Aliases
```bash
novelova cast list --json
```

### Assign Character Voice
```bash
novelova cast assign "Sunny" --voice "af_sarah" --json
```

### Merge Duplicate Character Names / Aliases
```bash
novelova cast merge "Sunless" "Sunny" --json
```

### Auto-Cast Voices by Inferred Gender
```bash
novelova cast auto-cast --json
```

---

## Pronunciation Overrides

### List Rules
```bash
novelova pronunciation list --json
```

### Add Pronunciation Rule
```bash
novelova pronunciation add "Mjolnir" "Me-yol-neer" --json
```

### Find Occurrences Across Manuscript
```bash
novelova pronunciation find "Mjolnir" --replacement "Me-yol-neer" --json
```

### Delete Rule
```bash
novelova pronunciation delete <rule_id> --json
```

---

## Kaggle Multi-Account GPU Pool

### List Configured Accounts
```bash
novelova kaggle list --json
```

### Add Kaggle Account
```bash
novelova kaggle add --username "user_gpu_1" --key "KGAT_..." --priority 1 --json
```

### Test Account Credentials
```bash
novelova kaggle test <account_id> --json
```

### Check Overall GPU Pool Capacity & Available Hours
```bash
novelova kaggle status --json
```

---

## Distributed Synthesis & Real-Time Download Pipeline

### Launch Multi-Account Synthesis
```bash
# Launch across up to 8 parallel lanes (max 10 chapters/batch, persistent model):
novelova synthesize run --lanes 8 --batch-size 10 --model chatterbox-turbo --persistent-model

# With real-time streaming downloads to ~/Downloads/<Project Name>/:
novelova synthesize run --download-realtime
```

### Check Synthesis Pool Status
```bash
novelova synthesize status --json
```

### Cancel Active Synthesis
```bash
novelova synthesize cancel --json
```
