# Novelova MCP Server

Production-grade Model Context Protocol (MCP) server providing LLM agents (Antigravity, Claude Desktop, Cursor) with full autonomous control over the **Novelova Audiobook & Voice Drama Studio Engine**.

---

## Capabilities

1. **Stage A (Ingestion & Normalization)**:
   - Asynchronous manuscript parsing (`.epub`, `.txt`, `.docx`)
   - Ligature resolution and protected number/currency expansion
   - Chapter script formatting and segment splitting
2. **Stage B (Dialogue Attribution & Linguistic Direction)**:
   - Character dialogue attribution (DeepSeek LLM or offline heuristics)
   - Paralinguistic emotion tag parsing (`[sigh]`, `[gasp]`, `[laugh]`)
   - Phonetic pronunciation dictionary management (orthographic -> IPA/SSML)
3. **Soundstage & Foley / SFX**:
   - Automated Foley trigger scanning across novel chapters
   - Spliced inline word replacements and sound cues
   - Continuous scene atmosphere bed mixing with automated dialogue ducking
   - DSP voice filter presets (`radio`, `reverb`, `telepathic`, `telephone`, `megaphone`, `whisper`)
4. **Stage C (Kaggle GPU Fleet & Audio Synthesis)**:
   - Zero-overhead Kaggle dataset model caching (`noveler-models`)
   - Multi-account quota pooling (30h/week free GPU tracking & failover)
   - In-worker Whisper speech-to-text automated QC
   - Sub-second surgical single-line GPU retakes with 0 quota waste
5. **Studio Canvas & Delivery**:
   - Millisecond timecode alignment (`alignment.json`) for karaoke playback
   - Telegram Bot audio delivery (`/sendAudio` with ID3 tags & cover art)

---

## Configuration

In `~/.gemini/config/mcp_config.json` or Claude Desktop configuration:

```json
{
  "mcpServers": {
    "novelova": {
      "command": "uv",
      "args": ["run", "--package", "novelova-mcp", "novelova-mcp"],
      "env": {
        "NOVELOVA_API_URL": "http://127.0.0.1:8000/api/v1",
        "NOVELOVA_EMAIL": "elhamullah.hossaini@gmail.com",
        "NOVELOVA_PASSWORD": "Admin123!"
      }
    }
  }
}
```
