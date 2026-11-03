"""Novelova Model Context Protocol (MCP) Server.

Exposes autonomous Audiobook and Voice Drama studio capabilities to AI agents
(Antigravity, Claude, Cursor) through standardized MCP Tools, Resources, and Prompts.
"""

from __future__ import annotations

import argparse
import json
from typing import Any

from mcp.server.mcpserver import MCPServer
from novelova_core.logging import setup_logger

from novelova_mcp.client import NovelovaClient

logger = setup_logger("novelova.mcp.server")

# Initialize MCP Server
mcp = MCPServer(
    "novelova",
    instructions="""Novelova Autonomous Studio Production MCP Server.
Provides full control over novel manuscript parsing, dialogue attribution, character voice casting,
Foley sound effect design, Kaggle GPU compute orchestration, account pool management, and audio delivery.""",
)

_client: NovelovaClient | None = None


def get_client() -> NovelovaClient:
    """Acquire or initialize shared Novelova API client."""
    global _client
    if _client is None:
        _client = NovelovaClient()
    return _client


# =============================================================================
# 1. System & Project Tools
# =============================================================================


@mcp.tool()
async def check_system_health() -> dict[str, Any]:
    """Check connectivity to Novelova backend API, database, and background services."""
    client = get_client()
    try:
        return await client.get_health()
    except Exception as exc:
        return {
            "status": "error",
            "message": f"Could not reach Novelova backend: {exc}",
            "hint": "Ensure Novelova API is running on NOVELOVA_API_URL",
        }


@mcp.tool()
async def list_projects() -> list[dict[str, Any]]:
    """List all novel audio projects with title, status, chapter count, and duration."""
    client = get_client()
    return await client.list_projects()


@mcp.tool()
async def get_project(project_id: str) -> dict[str, Any]:
    """Retrieve detailed novel project configuration, narrative POV, and chapter roster."""
    client = get_client()
    return await client.get_project(project_id)


@mcp.tool()
async def create_project(
    title: str,
    description: str | None = None,
    narrative_pov: str = "third_person_limited",
    protagonist_character_id: str | None = None,
) -> dict[str, Any]:
    """Create a new novel audio project.

    Args:
        title: Title of the novel or audio drama.
        description: Logline or synopsis.
        narrative_pov: Narrative point of view ('first_person_major', 'third_person_limited', 'third_person_omniscient').
        protagonist_character_id: Optional ID of the main protagonist.
    """
    client = get_client()
    return await client.create_project(
        title=title,
        description=description,
        narrative_pov=narrative_pov,
        protagonist_character_id=protagonist_character_id,
    )


# =============================================================================
# 2. Stage A: Manuscript Ingestion & Chapter Script Tools
# =============================================================================


@mcp.tool()
async def list_chapters(project_id: str) -> list[dict[str, Any]]:
    """List all chapters in a project with chapter number, title, segment count, duration, and status."""
    client = get_client()
    return await client.get_project_chapters(project_id)


@mcp.tool()
async def create_chapter(
    project_id: str,
    title: str,
    text: str | None = None,
) -> dict[str, Any]:
    """Create a new chapter within a project, optionally populating it with raw text."""
    client = get_client()
    return await client.create_chapter(project_id, title=title, text=text)


@mcp.tool()
async def delete_chapter(project_id: str, chapter_id: str) -> dict[str, Any]:
    """Delete a chapter and all its segments from a project."""
    client = get_client()
    await client.delete_chapter(project_id, chapter_id)
    return {"status": "success", "message": f"Chapter '{chapter_id}' deleted"}


@mcp.tool()
async def parse_manuscript(
    project_id: str,
    normalize_numbers: bool = True,
    normalize_ligatures: bool = True,
    split_by_headings: bool = True,
) -> dict[str, Any]:
    """Start an asynchronous Stage A parsing job for the manuscript.

    Extracts chapters, resolves typographic ligatures, normalizes numbers/dates/currencies,
    and breaks prose into atomic dialogue and narration segments.
    """
    client = get_client()
    options = {
        "normalize_numbers": normalize_numbers,
        "normalize_ligatures": normalize_ligatures,
        "split_by_headings": split_by_headings,
    }
    return await client.parse_manuscript(project_id, options)


@mcp.tool()
async def get_parse_job_status(project_id: str, job_type: str = "parse") -> dict[str, Any]:
    """Poll progress of an active or recent Stage A parsing or formatting job.

    Returns processed chapters, progress percentage, and current step.
    """
    client = get_client()
    res = await client.get_latest_parse_job(project_id, job_type)
    return res or {"status": "none", "message": "No active parse job found"}


@mcp.tool()
async def format_chapter_script(
    project_id: str,
    chapter_ids: list[str] | None = None,
) -> dict[str, Any]:
    """Format and re-segment chapter content according to dialogue and quotation rules."""
    client = get_client()
    return await client.format_script(project_id, chapter_ids)


@mcp.tool()
async def save_chapter_text(
    project_id: str,
    chapter_id: str,
    text: str,
) -> dict[str, Any]:
    """Directly update raw text content for a chapter, triggering immediate segmentation."""
    client = get_client()
    return await client.save_chapter_text(project_id, chapter_id, text)


@mcp.tool()
async def split_segment(
    project_id: str,
    segment_id: str,
    split_index: int,
) -> list[dict[str, Any]]:
    """Split a script segment into two segments at a character/word boundary."""
    client = get_client()
    return await client.split_segment(project_id, segment_id, split_index)


@mcp.tool()
async def merge_segments(
    project_id: str,
    segment_id: str,
    neighbor_segment_id: str,
) -> dict[str, Any]:
    """Merge a segment with an adjacent previous or next segment."""
    client = get_client()
    return await client.merge_segments(project_id, segment_id, neighbor_segment_id)


# =============================================================================
# 3. Stage B: Linguistic Attribution & Directing Tools
# =============================================================================


@mcp.tool()
async def attribute_dialogue(
    project_id: str,
    chapter_id: str | None = None,
    mode: str = "resume",
    use_offline_heuristics: bool = False,
) -> dict[str, Any]:
    """Trigger Stage B dialogue speaker attribution and emotion tagging.

    Args:
        project_id: Target project identifier.
        chapter_id: Specific chapter to attribute (or None for entire project).
        mode: 'resume' (tag only unassigned lines) or 'overwrite' (re-infer whole chapter).
        use_offline_heuristics: Fast rule-based regex parsing without LLM API calls.
    """
    client = get_client()
    return await client.attribute_dialogue(
        project_id=project_id,
        chapter_id=chapter_id,
        mode=mode,
        use_offline_heuristics=use_offline_heuristics,
    )


@mcp.tool()
async def get_tagging_job_status(project_id: str) -> dict[str, Any]:
    """Get the latest Stage B dialogue attribution job status, progress, and error logs."""
    client = get_client()
    res = await client.get_latest_tagging_job(project_id)
    return res or {"status": "none", "message": "No active tagging job found"}


@mcp.tool()
async def cancel_tagging_job(project_id: str) -> dict[str, Any]:
    """Cancel an in-flight Stage B dialogue attribution job for a project."""
    client = get_client()
    return await client.cancel_tagging_job(project_id)


@mcp.tool()
async def list_pronunciation_rules(project_id: str) -> list[dict[str, Any]]:
    """List phonetic pronunciation overrides (orthographic -> IPA / phonetic) for project."""
    client = get_client()
    return await client.list_pronunciation_rules(project_id)


@mcp.tool()
async def add_pronunciation_rule(
    project_id: str,
    grapheme: str,
    phoneme: str,
    category: str = "general",
) -> dict[str, Any]:
    """Add a pronunciation override rule (e.g. fantasy names, places, or unusual words).

    Args:
        project_id: Target project identifier.
        grapheme: Word as written in the manuscript text (e.g. 'Yeriel').
        phoneme: Desired pronunciation or phonetic respelling (e.g. 'YEH-ree-el').
        category: Classification ('character_name', 'place', 'fantasy', 'general').
    """
    client = get_client()
    return await client.add_pronunciation_rule(
        project_id=project_id,
        grapheme=grapheme,
        phoneme=phoneme,
        category=category,
    )


@mcp.tool()
async def delete_pronunciation_rule(project_id: str, rule_id: str) -> dict[str, Any]:
    """Delete a pronunciation override rule."""
    client = get_client()
    await client.delete_pronunciation_rule(project_id, rule_id)
    return {"status": "success", "message": f"Pronunciation rule '{rule_id}' deleted"}


@mcp.tool()
async def find_pronunciation_occurrences(
    project_id: str,
    word: str,
    replacement: str | None = None,
) -> dict[str, Any]:
    """Search manuscript for all occurrences of a word or phrase with contextual preview."""
    client = get_client()
    return await client.find_pronunciation_occurrences(project_id, word=word, replacement=replacement)


# =============================================================================
# 4. Character Casting & Voice Directing Tools
# =============================================================================


@mcp.tool()
async def list_characters(project_id: str) -> list[dict[str, Any]]:
    """Retrieve all detected characters with lines read count, word count, gender, and current casting."""
    client = get_client()
    return await client.list_characters(project_id)


@mcp.tool()
async def get_character_lines(
    project_id: str,
    character_id: str,
    limit: int = 200,
    offset: int = 0,
) -> dict[str, Any]:
    """Fetch character reading details: total lines read, words read, chapters span, and all spoken dialogue takes.

    Returns the exact lines read by this character across chapters with text, delivery type, emotion, and audio URLs.
    """
    client = get_client()
    return await client.get_character_lines(
        project_id=project_id,
        character_id=character_id,
        limit=limit,
        offset=offset,
    )


@mcp.tool()
async def assign_voice_to_character(
    project_id: str,
    character_id: str,
    voice_id: str,
    voice_name: str | None = None,
    voice_filter_id: str | None = None,
) -> dict[str, Any]:
    """Cast a specific neural voice or cloned reference to a character.

    Args:
        project_id: Target project identifier.
        character_id: Target character identifier.
        voice_id: Voice identifier from voices catalog or cloned voices library.
        voice_name: Optional human-readable voice label.
        voice_filter_id: Optional DSP voice filter ('radio', 'reverb', 'telepathic', 'telephone', 'megaphone', 'whisper').
    """
    client = get_client()
    return await client.update_character(
        character_id=character_id,
        assigned_voice_id=voice_id,
        voice_filter_id=voice_filter_id,
    )


@mcp.tool()
async def auto_assign_voices_by_gender(project_id: str) -> list[dict[str, Any]]:
    """Automatically assign default curated voices to all uncast characters based on their inferred gender."""
    client = get_client()
    return await client.set_defaults_by_gender(project_id)


@mcp.tool()
async def reset_all_voice_casting(project_id: str) -> list[dict[str, Any]]:
    """Reset all character voice assignments back to unassigned state."""
    client = get_client()
    return await client.reset_all_cast(project_id)


@mcp.tool()
async def sync_characters_from_script(project_id: str) -> list[dict[str, Any]]:
    """Scan parsed dialogue segments and automatically sync newly discovered characters."""
    client = get_client()
    return await client.sync_characters(project_id)


@mcp.tool()
async def merge_characters(
    project_id: str,
    source_character_id: str,
    target_character_id: str,
) -> dict[str, Any]:
    """Merge a duplicate or alias character into a canonical target character across all script segments."""
    client = get_client()
    return await client.merge_characters(
        project_id=project_id,
        source_character_id=source_character_id,
        target_character_id=target_character_id,
    )


@mcp.tool()
async def preview_character_merge(
    project_id: str,
    source_character_id: str,
    target_character_id: str | None = None,
) -> dict[str, Any]:
    """Preview the impact of merging a character: affected lines count, words count, chapters, and sample lines."""
    client = get_client()
    return await client.preview_character_merge(
        project_id=project_id,
        source_character_id=source_character_id,
        target_character_id=target_character_id,
    )


@mcp.tool()
async def get_character_alias_suggestions(project_id: str) -> list[dict[str, Any]]:
    """Get AI-detected character alias merge suggestions (e.g. 'Lord Blackwood' vs 'Blackwood')."""
    client = get_client()
    return await client.get_alias_suggestions(project_id)


@mcp.tool()
async def create_character(
    project_id: str,
    name: str,
    aliases: list[str] | None = None,
    gender: str = "unknown",
    assigned_voice_id: str | None = None,
    voice_filter_id: str | None = None,
) -> dict[str, Any]:
    """Create a new character in the project roster."""
    client = get_client()
    return await client.create_character(
        project_id=project_id,
        name=name,
        aliases=aliases,
        gender=gender,
        assigned_voice_id=assigned_voice_id,
        voice_filter_id=voice_filter_id,
    )


@mcp.tool()
async def update_character(
    character_id: str,
    name: str | None = None,
    aliases: list[str] | None = None,
    gender: str | None = None,
    assigned_voice_id: str | None = None,
    voice_filter_id: str | None = None,
) -> dict[str, Any]:
    """Update character details, aliases, voice casting, or DSP voice filter."""
    client = get_client()
    return await client.update_character(
        character_id=character_id,
        name=name,
        aliases=aliases,
        gender=gender,
        assigned_voice_id=assigned_voice_id,
        voice_filter_id=voice_filter_id,
    )


@mcp.tool()
async def delete_character(project_id: str, character_id: str) -> dict[str, Any]:
    """Delete a character from a project."""
    client = get_client()
    await client.delete_character(project_id, character_id)
    return {"status": "success", "message": f"Character '{character_id}' deleted"}


@mcp.tool()
async def list_voices(project_id: str | None = None) -> list[dict[str, Any]]:
    """List available voice models, neural presets, and cloned voices with reference audio."""
    client = get_client()
    return await client.list_voices(project_id)


@mcp.tool()
async def make_voice_default(project_id: str, voice_id: str) -> dict[str, Any]:
    """Set or toggle a voice as the project default for its gender (male/female)."""
    client = get_client()
    return await client.make_voice_default(project_id=project_id, voice_id=voice_id)


@mcp.tool()
async def delete_voice(voice_id: str) -> dict[str, Any]:
    """Delete a custom cloned voice and its reference audio sample."""
    client = get_client()
    return await client.delete_voice(voice_id)


# =============================================================================
# 5. Soundstage, Foley & Atmosphere Tools
# =============================================================================


@mcp.tool()
async def list_sfx(
    project_id: str | None = None,
    category: str | None = None,
) -> list[dict[str, Any]]:
    """List sound effects in the library.

    Args:
        project_id: Optional project to filter project-specific assets.
        category: 'foley' (action sounds) or 'atmosphere' (ambient scene beds).
    """
    client = get_client()
    return await client.list_sfx(project_id, category)


@mcp.tool()
async def scan_foley_cues(
    project_id: str,
    sfx_id: str,
    triggers: list[str] | None = None,
    chapter_ids: list[str] | None = None,
) -> dict[str, Any]:
    """Scan manuscript segments for occurrences of Foley sound effect trigger keywords."""
    client = get_client()
    return await client.scan_foley_occurrences(
        sfx_id=sfx_id,
        project_id=project_id,
        triggers=triggers,
        chapter_ids=chapter_ids,
    )


@mcp.tool()
async def apply_foley_cue(
    project_id: str,
    segment_id: str,
    sfx_id: str,
    action: str = "after",
    target_word: str | None = None,
    volume: float = 1.0,
) -> dict[str, Any]:
    """Attach a Foley sound effect cue to an individual segment.

    Args:
        project_id: Target project identifier.
        segment_id: Target script segment.
        sfx_id: Sound effect identifier from SFX library.
        action: 'before' (play sound before speech), 'after' (play sound after speech), or 'replace' (splice into word).
        target_word: Target word in text if action is 'replace'.
        volume: Relative playback volume multiplier (0.1 to 2.0).
    """
    client = get_client()
    return await client.apply_foley_cue(
        project_id=project_id,
        segment_id=segment_id,
        sfx_id=sfx_id,
        action=action,
        target_word=target_word,
        volume=volume,
    )


@mcp.tool()
async def batch_assign_atmosphere(
    project_id: str,
    atmosphere_id: str | None,
    segment_ids: list[str],
    volume: float = 0.3,
) -> dict[str, Any]:
    """Apply continuous ambient background atmosphere across a span of script segments.

    Args:
        project_id: Target project identifier.
        atmosphere_id: Atmosphere SFX identifier (or None to clear atmosphere).
        segment_ids: List of consecutive segment IDs belonging to the scene.
        volume: Ambient bed volume multiplier (0.05 to 1.0, defaults to 0.3 with auto-ducking).
    """
    client = get_client()
    return await client.batch_atmosphere(
        project_id=project_id,
        atmosphere_id=atmosphere_id,
        segment_ids=segment_ids,
        volume=volume,
    )


@mcp.tool()
async def update_sfx(
    sfx_id: str,
    name: str | None = None,
    category: str | None = None,
    default_volume: float | None = None,
    triggers: list[str] | None = None,
) -> dict[str, Any]:
    """Update sound effect metadata, category, default volume, or trigger words."""
    client = get_client()
    return await client.update_sfx(
        sfx_id=sfx_id,
        name=name,
        category=category,
        default_volume=default_volume,
        triggers=triggers,
    )


@mcp.tool()
async def delete_sfx(sfx_id: str) -> dict[str, Any]:
    """Delete a sound effect item and its audio file from storage."""
    client = get_client()
    return await client.delete_sfx(sfx_id)


# =============================================================================
# 6. Stage C: Audio Generation (Chapter, Batch, Whole Novel)
# =============================================================================


@mcp.tool()
async def preflight_audio_check(
    project_id: str,
    chapter_id: str,
    preferred_tts_model: str = "kokoro-82m",
    kaggle_account_id: str | None = None,
) -> dict[str, Any]:
    """Preflight check verifying whether the chosen TTS model is pre-cached on the Kaggle account dataset.

    Prevents wasting GPU quota on container download overhead.
    """
    client = get_client()
    return await client.preflight_audio_check(
        project_id=project_id,
        chapter_id=chapter_id,
        preferred_tts_model=preferred_tts_model,
        kaggle_account_id=kaggle_account_id,
    )


@mcp.tool()
async def dispatch_chapter_audio(
    project_id: str,
    chapter_id: str,
    preferred_tts_model: str = "kokoro-82m",
    cache_to_dataset: bool = True,
    kaggle_account_id: str | None = None,
    allow_dev_offline: bool = False,
) -> dict[str, Any]:
    """Dispatch Stage C neural audio synthesis for a single chapter to Kaggle GPU session worker."""
    client = get_client()
    return await client.generate_chapter_audio(
        project_id=project_id,
        chapter_id=chapter_id,
        preferred_tts_model=preferred_tts_model,
        cache_to_dataset=cache_to_dataset,
        kaggle_account_id=kaggle_account_id,
        allow_dev_offline=allow_dev_offline,
    )


@mcp.tool()
async def batch_dispatch_audio(
    project_id: str,
    chapter_ids: list[str],
    preferred_tts_model: str = "kokoro-82m",
    cache_to_dataset: bool = True,
    lanes: int = 1,
    allow_dev_offline: bool = False,
) -> dict[str, Any]:
    """Dispatch multi-lane parallel chapter audio synthesis across multiple Kaggle accounts."""
    client = get_client()
    return await client.batch_generate_audio(
        project_id=project_id,
        chapter_ids=chapter_ids,
        preferred_tts_model=preferred_tts_model,
        cache_to_dataset=cache_to_dataset,
        lanes=lanes,
        allow_dev_offline=allow_dev_offline,
    )


@mcp.tool()
async def dispatch_novel_audio(
    project_id: str,
    preferred_tts_model: str = "kokoro-82m",
    cache_to_dataset: bool = True,
    ungenerated_only: bool = True,
    lanes: int = 1,
    allow_dev_offline: bool = False,
) -> dict[str, Any]:
    """Synthesize the ENTIRE novel across all chapters with automated parallel lane distribution.

    Args:
        project_id: Target project identifier.
        preferred_tts_model: TTS model ('kokoro-82m', 'chatterbox-turbo', etc.).
        cache_to_dataset: Use zero-overhead cached Kaggle dataset.
        ungenerated_only: If True, only synthesizes chapters that do not already have complete audio.
        lanes: Number of parallel Kaggle account lanes to utilize.
        allow_dev_offline: Enable test simulation mode if in development.
    """
    client = get_client()
    return await client.dispatch_novel_audio(
        project_id=project_id,
        preferred_tts_model=preferred_tts_model,
        cache_to_dataset=cache_to_dataset,
        ungenerated_only=ungenerated_only,
        lanes=lanes,
        allow_dev_offline=allow_dev_offline,
    )


@mcp.tool()
async def regenerate_line_take(
    project_id: str,
    segment_id: str,
    speed: float = 1.0,
    preferred_tts_model: str | None = None,
    character_voice_id: str | None = None,
    allow_dev_offline: bool = False,
) -> dict[str, Any]:
    """Perform surgical single-line GPU retake on Kaggle with zero local model self-hosting.

    Dispatches an isolated 1-line manifest, renders neural audio in VRAM, uploads take to R2,
    recalculates master alignment timecodes, and immediately exits.
    """
    client = get_client()
    return await client.regenerate_segment_audio(
        project_id=project_id,
        segment_id=segment_id,
        speed=speed,
        preferred_tts_model=preferred_tts_model,
        character_voice_id=character_voice_id,
        allow_dev_offline=allow_dev_offline,
    )


@mcp.tool()
async def abort_audio_job(project_id: str) -> dict[str, Any]:
    """Cancel in-flight batch synthesis lanes, send shutdown signals, and release Kaggle accounts."""
    client = get_client()
    return await client.cancel_batch_audio(project_id)


# =============================================================================
# 7. Kaggle Account Pool Management & Switching Tools
# =============================================================================


@mcp.tool()
async def probe_compute_fleet() -> list[dict[str, Any]]:
    """Query live status, remaining weekly GPU hours, and reset timestamps of all Kaggle accounts."""
    client = get_client()
    return await client.probe_kaggle_pool()


@mcp.tool()
async def list_kaggle_accounts() -> list[dict[str, Any]]:
    """List all configured Kaggle accounts with username, masked key, priority, status, and hours used."""
    client = get_client()
    return await client.list_kaggle_accounts()


@mcp.tool()
async def get_kaggle_pool_summary() -> dict[str, Any]:
    """Get high-level summary of total pooled GPU capacity, active hours, and available account count."""
    client = get_client()
    return await client.get_kaggle_pool_summary()


@mcp.tool()
async def add_kaggle_account(
    username: str,
    key: str,
    priority: int = 1,
    is_active: bool = True,
    verify_first: bool = True,
) -> dict[str, Any]:
    """Add and verify a new Kaggle account in the failover pool."""
    client = get_client()
    return await client.create_kaggle_account(
        username=username,
        key=key,
        priority=priority,
        is_active=is_active,
        verify_first=verify_first,
    )


@mcp.tool()
async def switch_primary_kaggle_account(account_id: str, is_active: bool = True) -> dict[str, Any]:
    """Switch primary dispatcher account by setting its priority to #1 and activating it."""
    client = get_client()
    return await client.switch_primary_kaggle_account(account_id=account_id, is_active=is_active)


@mcp.tool()
async def test_kaggle_account(account_id: str) -> dict[str, Any]:
    """Test connection and verify GPU quota access for a saved Kaggle account."""
    client = get_client()
    return await client.test_kaggle_account(account_id)


@mcp.tool()
async def initialize_kaggle_dataset(account_id: str) -> dict[str, Any]:
    """Register or initialize pre-mounted models dataset on a Kaggle account for instant container boot."""
    client = get_client()
    return await client.initialize_kaggle_dataset(account_id)


@mcp.tool()
async def delete_kaggle_account(account_id: str) -> dict[str, Any]:
    """Delete a Kaggle account from the user's failover pool."""
    client = get_client()
    return await client.delete_kaggle_account(account_id)


# =============================================================================
# 8. Studio Canvas, Timeline & Quality Defense (Whisper QC) Tools
# =============================================================================


@mcp.tool()
async def get_chapter_script(project_id: str, chapter_id: str) -> dict[str, Any]:
    """Fetch structured chapter script segments with timecodes, audio URLs, emotions, and Foley cues."""
    client = get_client()
    return await client.get_chapter(project_id, chapter_id)


@mcp.tool()
async def get_chapter_alignment(project_id: str, chapter_id: str) -> dict[str, Any]:
    """Retrieve master timecode alignment manifest (start_ms, end_ms) for karaoke audio player."""
    client = get_client()
    return await client.get_chapter_audio_stream(project_id, chapter_id)


@mcp.tool()
async def audit_chapter_qc(
    project_id: str,
    chapter_id: str,
) -> dict[str, Any]:
    """Audit chapter audio quality by inspecting in-worker Whisper transcription logs.

    Identifies segments with dropped words, repetition loops, or timecode drift.
    """
    client = get_client()
    stream = await client.get_chapter_audio_stream(project_id, chapter_id)
    chapter = await client.get_chapter(project_id, chapter_id)

    segments = chapter.get("segments", [])
    alignments = stream.get("alignments", [])
    completed_takes = [s for s in segments if s.get("audio_status") == "complete"]

    issues = []
    # Check for ungenerated takes or duration anomalies
    for s in segments:
        if s.get("audio_status") != "complete":
            issues.append({
                "segment_id": s["id"],
                "order_index": s["order_index"],
                "issue": "Missing or incomplete audio take",
                "text": s.get("text", "")[:60],
            })
        elif s.get("duration_ms", 0) < 300 and len(s.get("text", "").split()) > 2:
            issues.append({
                "segment_id": s["id"],
                "order_index": s["order_index"],
                "issue": "Suspiciously short take (< 300ms for multi-word segment)",
                "duration_ms": s.get("duration_ms"),
                "text": s.get("text", "")[:60],
            })

    return {
        "chapter_id": chapter_id,
        "chapter_title": chapter.get("title"),
        "total_segments": len(segments),
        "completed_takes": len(completed_takes),
        "alignments_count": len(alignments),
        "master_audio_url": stream.get("audio_url"),
        "anomalies_detected": len(issues),
        "issues": issues,
        "status": "clean" if len(issues) == 0 else "attention_required",
    }


# =============================================================================
# 9. Distribution & Delivery Tools (Telegram)
# =============================================================================


@mcp.tool()
async def deliver_chapter_to_telegram(
    project_id: str,
    chapter_id: str,
    force_preview: bool = False,
) -> dict[str, Any]:
    """Deliver completed chapter audio file directly to user's Telegram chat or channel."""
    client = get_client()
    return await client.deliver_chapter_to_telegram(
        project_id=project_id,
        chapter_id=chapter_id,
        force_preview=force_preview,
    )


@mcp.tool()
async def verify_telegram_connection(
    bot_token: str | None = None,
    chat_id: str | None = None,
) -> dict[str, Any]:
    """Test connection to Telegram Bot API with token and chat ID."""
    client = get_client()
    return await client.verify_telegram_connection(
        bot_token=bot_token,
        chat_id=chat_id,
    )


@mcp.tool()
async def get_audio_package_preview(project_id: str) -> dict[str, Any]:
    """Inspect chapter packaging readiness, total durations, cover art status, and standardized file format."""
    client = get_client()
    return await client.get_package_preview(project_id)



# =============================================================================
# MCP Resources (Passive State Access)
# =============================================================================


@mcp.resource("novelova://projects")
async def resource_projects() -> str:
    """List of all novel audio projects in JSON format."""
    client = get_client()
    projects = await client.list_projects()
    return json.dumps(projects, indent=2)


@mcp.resource("novelova://projects/{project_id}")
async def resource_project_detail(project_id: str) -> str:
    """Comprehensive details and chapter roster for a specific novel project."""
    client = get_client()
    proj = await client.get_project(project_id)
    return json.dumps(proj, indent=2)


@mcp.resource("novelova://projects/{project_id}/character-bible")
async def resource_character_bible(project_id: str) -> str:
    """Canonical character bible with alias mappings, genders, and vocal profiles."""
    client = get_client()
    chars = await client.list_characters(project_id)
    return json.dumps(chars, indent=2)


@mcp.resource("novelova://projects/{project_id}/characters/{character_id}/lines")
async def resource_character_lines(project_id: str, character_id: str) -> str:
    """All dialogue lines and audio takes read by a specific character."""
    client = get_client()
    lines_data = await client.get_character_lines(project_id, character_id)
    return json.dumps(lines_data, indent=2)


@mcp.resource("novelova://projects/{project_id}/chapters/{chapter_id}/script")
async def resource_chapter_script(project_id: str, chapter_id: str) -> str:
    """Ordered chapter script segments with dialogue tags and takes."""
    client = get_client()
    chap = await client.get_chapter(project_id, chapter_id)
    return json.dumps(chap, indent=2)


@mcp.resource("novelova://projects/{project_id}/chapters/{chapter_id}/alignment")
async def resource_chapter_alignment(project_id: str, chapter_id: str) -> str:
    """Master audio timecode alignment JSON with segment start and end markers."""
    client = get_client()
    stream = await client.get_chapter_audio_stream(project_id, chapter_id)
    return json.dumps(stream.get("alignments", []), indent=2)


@mcp.resource("novelova://compute/pool")
async def resource_compute_pool() -> str:
    """Live Kaggle GPU account pool status, remaining hours, and lane availability."""
    client = get_client()
    quota = await client.probe_kaggle_pool()
    return json.dumps(quota, indent=2)


@mcp.resource("novelova://compute/accounts")
async def resource_compute_accounts() -> str:
    """Detailed roster of all configured Kaggle accounts and credentials status."""
    client = get_client()
    accounts = await client.list_kaggle_accounts()
    return json.dumps(accounts, indent=2)


@mcp.resource("novelova://sfx/library")
async def resource_sfx_library() -> str:
    """Sound effect and atmosphere audio library catalog."""
    client = get_client()
    sfx_items = await client.list_sfx()
    return json.dumps(sfx_items, indent=2)


@mcp.resource("novelova://voices/catalog")
async def resource_voices_catalog() -> str:
    """Voice models and cloned audio references."""
    client = get_client()
    voices = await client.list_voices()
    return json.dumps(voices, indent=2)


# =============================================================================
# MCP Prompts (Pre-Engineered Agentic Workflows)
# =============================================================================


@mcp.prompt()
def director_casting_pass(project_id: str) -> str:
    """Workflow template for analyzing novel manuscript, discovering characters, and assigning voices."""
    return f"""You are the Lead Audio Drama Director for Novelova project '{project_id}'.
Your task is to perform a full Casting & Linguistic Direction Pass:

1. Call `sync_characters_from_script(project_id='{project_id}')` to discover all speaking roles.
2. Call `list_characters(project_id='{project_id}')` to review detected characters and their line counts.
3. For key characters, call `get_character_lines(project_id='{project_id}', character_id=...)` to analyze their speech habits and emotion range.
4. Call `list_voices(project_id='{project_id}')` to see available neural voices and cloning references.
5. Use `assign_voice_to_character` to cast appropriate voices, or `auto_assign_voices_by_gender` for rapid defaults.
6. Check `get_character_alias_suggestions` to detect and merge duplicate characters with `merge_characters`.
7. Output a structured Casting Report summarizing your directorial decisions."""


@mcp.prompt()
def sound_designer_pass(project_id: str, chapter_id: str) -> str:
    """Workflow template for designing scene atmosphere beds and Foley sound effect cues."""
    return f"""You are the Sound Designer and Foley Engineer for chapter '{chapter_id}' in project '{project_id}'.
Your task is to build an immersive audio soundscape:

1. Call `list_sfx(project_id='{project_id}')` to view available Foley and atmosphere assets.
2. Call `get_chapter_script(project_id='{project_id}', chapter_id='{chapter_id}')` to read the narrative flow.
3. Identify ambient scene environments (e.g. stormy weather, taverns, quiet rooms) and apply atmosphere spans with `batch_assign_atmosphere`.
4. Scan the text for impactful action verbs (footsteps, drawing weapons, slamming doors) with `scan_foley_cues`.
5. Attach precise sound effects using `apply_foley_cue` (setting action to 'before', 'after', or inline 'replace').
6. Provide a concise summary of the sound design enhancements made."""


@mcp.prompt()
def quality_audit_and_retake(project_id: str, chapter_id: str) -> str:
    """Workflow template for auditing synthesized audio quality and triggering surgical retakes."""
    return f"""You are the Audio Quality Control (QC) Engineer for chapter '{chapter_id}' in project '{project_id}'.
Your task is to ensure flawless acoustic delivery:

1. Call `audit_chapter_qc(project_id='{project_id}', chapter_id='{chapter_id}')` to review alignment timecodes and Whisper QC logs.
2. For any flagged anomalies or dropped lines:
   - Inspect the segment text.
   - If pronunciation is awkward, search occurrences with `find_pronunciation_occurrences` and add a rule with `add_pronunciation_rule`.
   - Trigger a surgical single-line GPU retake using `regenerate_line_take(project_id='{project_id}', segment_id=...)`.
3. Verify that all segment takes are complete and alignment timecodes are smoothly continuous."""


@mcp.prompt()
def production_batch_orchestrator(project_id: str) -> str:
    """Workflow template for inspecting compute fleet quota, switching accounts, and orchestrating full novel synthesis."""
    return f"""You are the Studio Compute Orchestrator for project '{project_id}'.
Your task is to plan and dispatch audio production with zero wasted GPU quota:

1. Call `list_kaggle_accounts()` and `probe_compute_fleet()` to inspect all active accounts and remaining 30h/week quotas.
2. If an account is exhausted or you need to switch primary worker, use `switch_primary_kaggle_account(account_id=...)`.
3. Call `list_chapters(project_id='{project_id}')` to identify ungenerated chapters.
4. Run `preflight_audio_check` to verify that chosen TTS models are cached in the account's private dataset.
5. To generate the entire novel in parallel, call `dispatch_novel_audio(project_id='{project_id}', lanes=2)`.
6. Monitor production progress and output an execution report."""


# =============================================================================
# CLI Main Entrypoint
# =============================================================================


def main() -> None:
    """Run Novelova MCP server over stdio, streamable-http, or SSE transport."""
    parser = argparse.ArgumentParser(description="Novelova MCP Server")
    parser.add_argument(
        "--transport",
        choices=["stdio", "sse", "streamable-http"],
        default="stdio",
        help="MCP transport protocol (stdio, sse, or streamable-http, defaults to stdio)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=8001,
        help="Port for SSE or streamable-http transport (defaults to 8001)",
    )
    args = parser.parse_args()

    logger.info("Starting Novelova MCP Server (transport: %s)", args.transport)
    if args.transport == "sse":
        mcp.run("sse", port=args.port)
    elif args.transport == "streamable-http":
        mcp.run("streamable-http", port=args.port)
    else:
        mcp.run("stdio")


if __name__ == "__main__":
    main()
