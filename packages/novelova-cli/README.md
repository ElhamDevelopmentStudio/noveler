# Novelova CLI (`novelova`)

Headless command-line interface and autonomous AI agent automation suite for the Novelova Studio audio production platform.

## Features

- **Full Feature Parity**: Projects, manuscripts, parsing, Stage B character tagging, cast assignment, and pronunciation overrides.
- **AI Agent Operable**: Dual output mode — beautiful Rich terminal styling for humans, and zero-noise, deterministic `--json` output for AI coding agents.
- **Dual Authentication**: Supports standard username/password session tokens, permanent API tokens (`nv_live_...`), and environment variables (`NOVELOVA_API_TOKEN`).
- **Distributed Kaggle Synthesis**: Round-robin chapter dispatch across multi-account GPU lanes (up to 8 concurrent notebooks, max 10 chapters/batch, 30s session cooldown with backoff).
- **Persistent Model Selection**: Chatterbox-Turbo and Kokoro-82m dataset mounting without redundant uploads.
- **Real-Time Pipeline & Downloads**: Kaggle $\to$ R2/RustFS $\to$ Google Drive (token-bucket rate limited) $\to$ `~/Downloads/<Project Name>/` with cover art and full metadata.
