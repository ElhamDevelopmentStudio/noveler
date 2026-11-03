"""Tests for Novelova MCP Server, Client, Tools, Resources, and Prompts."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from novelova_mcp.client import NovelovaClient
from novelova_mcp.server import (
    assign_voice_to_character,
    audit_chapter_qc,
    check_system_health,
    director_casting_pass,
    dispatch_novel_audio,
    get_character_lines,
    mcp,
    production_batch_orchestrator,
    quality_audit_and_retake,
    sound_designer_pass,
    switch_primary_kaggle_account,
)


@pytest.mark.asyncio
async def test_mcp_server_registration() -> None:
    """Verify that all Novelova studio tools, resources, and prompts are registered."""
    tools = await mcp.list_tools()
    tool_names = {t.name for t in tools}

    expected_tools = {
        # System & Project
        "check_system_health",
        "list_projects",
        "get_project",
        "create_project",
        # Stage A & Chapters
        "list_chapters",
        "create_chapter",
        "delete_chapter",
        "parse_manuscript",
        "get_parse_job_status",
        "format_chapter_script",
        "save_chapter_text",
        "split_segment",
        "merge_segments",
        # Stage B Attribution & Pronunciation
        "attribute_dialogue",
        "get_tagging_job_status",
        "cancel_tagging_job",
        "list_pronunciation_rules",
        "add_pronunciation_rule",
        "delete_pronunciation_rule",
        "find_pronunciation_occurrences",
        # Character Profiling & Voice Casting
        "list_characters",
        "get_character_lines",
        "assign_voice_to_character",
        "auto_assign_voices_by_gender",
        "reset_all_voice_casting",
        "sync_characters_from_script",
        "merge_characters",
        "preview_character_merge",
        "get_character_alias_suggestions",
        "create_character",
        "update_character",
        "delete_character",
        "list_voices",
        "make_voice_default",
        "delete_voice",
        # Foley & Atmosphere SFX
        "list_sfx",
        "scan_foley_cues",
        "apply_foley_cue",
        "batch_assign_atmosphere",
        "update_sfx",
        "delete_sfx",
        # Stage C Synthesis & Whole Novel
        "preflight_audio_check",
        "dispatch_chapter_audio",
        "batch_dispatch_audio",
        "dispatch_novel_audio",
        "regenerate_line_take",
        "abort_audio_job",
        # Kaggle Fleet & Account Switching
        "probe_compute_fleet",
        "list_kaggle_accounts",
        "get_kaggle_pool_summary",
        "add_kaggle_account",
        "switch_primary_kaggle_account",
        "test_kaggle_account",
        "initialize_kaggle_dataset",
        "delete_kaggle_account",
        # Studio Canvas & Quality Defense
        "get_chapter_script",
        "get_chapter_alignment",
        "audit_chapter_qc",
        # Distribution
        "deliver_chapter_to_telegram",
        "verify_telegram_connection",
    }

    missing = expected_tools - tool_names
    assert not missing, f"Missing expected MCP tools: {missing}"
    assert len(tools) >= 60

    # Check resources
    resources = await mcp.list_resources()
    resource_uris = {r.uri for r in resources}
    expected_resources = {
        "novelova://projects",
        "novelova://compute/pool",
        "novelova://compute/accounts",
        "novelova://sfx/library",
        "novelova://voices/catalog",
    }
    assert expected_resources.issubset(resource_uris)

    # Check resource templates
    templates = await mcp.list_resource_templates()
    template_uris = {t.uri_template for t in templates}
    expected_templates = {
        "novelova://projects/{project_id}",
        "novelova://projects/{project_id}/character-bible",
        "novelova://projects/{project_id}/characters/{character_id}/lines",
        "novelova://projects/{project_id}/chapters/{chapter_id}/script",
        "novelova://projects/{project_id}/chapters/{chapter_id}/alignment",
    }
    assert expected_templates.issubset(template_uris)

    # Check prompts
    prompts = await mcp.list_prompts()
    prompt_names = {p.name for p in prompts}
    expected_prompts = {
        "director_casting_pass",
        "sound_designer_pass",
        "quality_audit_and_retake",
        "production_batch_orchestrator",
    }
    assert expected_prompts.issubset(prompt_names)


@pytest.mark.asyncio
async def test_client_authentication_and_request() -> None:
    """Test that NovelovaClient authenticates and unpacks API responses."""
    client = NovelovaClient(base_url="http://test-server/api/v1")

    mock_resp_login = MagicMock()
    mock_resp_login.status_code = 200
    mock_resp_login.json.return_value = {
        "data": {"access_token": "mock-jwt-token-xyz"},
        "message": "Login successful",
    }

    mock_resp_projects = MagicMock()
    mock_resp_projects.status_code = 200
    mock_resp_projects.json.return_value = {
        "data": [{"id": "p1", "title": "Test Novel"}],
        "message": "Success",
    }

    mock_http = AsyncMock()
    mock_http.post.return_value = mock_resp_login
    mock_http.request.return_value = mock_resp_projects

    with patch.object(client, "get_http_client", return_value=mock_http):
        token = await client.authenticate()
        assert token == "mock-jwt-token-xyz"
        assert client.token == "mock-jwt-token-xyz"

        projects = await client.list_projects()
        assert len(projects) == 1
        assert projects[0]["title"] == "Test Novel"

    await client.close()


@pytest.mark.asyncio
async def test_get_character_lines_tool() -> None:
    """Test get_character_lines returns lines read, count, and takes for character."""
    mock_client = AsyncMock()
    mock_client.get_character_lines.return_value = {
        "character_id": "char_1",
        "character_name": "Alice",
        "gender": "female",
        "dialogue_count": 42,
        "word_count": 850,
        "chapters_span": "Ch. 1-12",
        "lines": [
            {
                "id": "seg_1",
                "chapter_id": "c1",
                "chapter_number": 1,
                "chapter_title": "Arrival",
                "order_index": 2,
                "text": "We have to leave now.",
                "delivery_type": "dialogue",
                "emotion": "urgent",
                "audio_url": "https://r2/takes/seg_1.wav",
                "duration_ms": 1850,
            }
        ],
    }

    with patch("novelova_mcp.server.get_client", return_value=mock_client):
        res = await get_character_lines(project_id="p1", character_id="char_1")
        assert res["character_name"] == "Alice"
        assert res["dialogue_count"] == 42
        assert len(res["lines"]) == 1
        assert res["lines"][0]["text"] == "We have to leave now."


@pytest.mark.asyncio
async def test_assign_voice_to_character_tool() -> None:
    """Test assigning voice and DSP filter to character."""
    mock_client = AsyncMock()
    mock_client.update_character.return_value = {
        "id": "char_1",
        "name": "Alice",
        "assigned_voice_id": "voice_clara",
        "voice_filter_id": "radio",
    }

    with patch("novelova_mcp.server.get_client", return_value=mock_client):
        res = await assign_voice_to_character(
            project_id="p1",
            character_id="char_1",
            voice_id="voice_clara",
            voice_filter_id="radio",
        )
        assert res["assigned_voice_id"] == "voice_clara"
        assert res["voice_filter_id"] == "radio"


@pytest.mark.asyncio
async def test_dispatch_novel_audio_tool() -> None:
    """Test dispatch_novel_audio identifies ungenerated chapters and dispatches batch."""
    mock_client = AsyncMock()
    mock_client.dispatch_novel_audio.return_value = {
        "status": "dispatched",
        "novel_total_chapters": 10,
        "dispatched_chapters": 4,
        "chapter_ids": ["c7", "c8", "c9", "c10"],
        "batch_result": {"status": "dispatched", "job_id": "job_123"},
    }

    with patch("novelova_mcp.server.get_client", return_value=mock_client):
        res = await dispatch_novel_audio(
            project_id="p1",
            preferred_tts_model="chatterbox-turbo",
            lanes=2,
        )
        assert res["status"] == "dispatched"
        assert res["dispatched_chapters"] == 4
        assert len(res["chapter_ids"]) == 4


@pytest.mark.asyncio
async def test_switch_primary_kaggle_account_tool() -> None:
    """Test switching primary dispatcher Kaggle account."""
    mock_client = AsyncMock()
    mock_client.switch_primary_kaggle_account.return_value = {
        "id": "acc_backup",
        "username": "novelova_gpu_2",
        "priority": 1,
        "is_active": True,
        "status": "available",
    }

    with patch("novelova_mcp.server.get_client", return_value=mock_client):
        res = await switch_primary_kaggle_account(account_id="acc_backup")
        assert res["priority"] == 1
        assert res["is_active"] is True
        assert res["username"] == "novelova_gpu_2"


@pytest.mark.asyncio
async def test_audit_chapter_qc_detection() -> None:
    """Test audit_chapter_qc tool detects incomplete or corrupted takes."""
    mock_client = AsyncMock()
    mock_client.get_chapter.return_value = {
        "id": "c1",
        "title": "Chapter 1",
        "segments": [
            {
                "id": "s1",
                "order_index": 0,
                "text": "Hello world.",
                "audio_status": "complete",
                "duration_ms": 1200,
            },
            {
                "id": "s2",
                "order_index": 1,
                "text": "This line failed to generate.",
                "audio_status": "failed",
                "duration_ms": 0,
            },
            {
                "id": "s3",
                "order_index": 2,
                "text": "Too fast glitch test line that should be longer.",
                "audio_status": "complete",
                "duration_ms": 100,  # abnormally short
            },
        ],
    }
    mock_client.get_chapter_audio_stream.return_value = {
        "audio_url": "https://r2.cloudflarestorage.com/ghostapi/ch1.wav",
        "alignments": [{"segment_id": "s1", "start_ms": 0, "end_ms": 1200}],
    }

    with patch("novelova_mcp.server.get_client", return_value=mock_client):
        qc_result = await audit_chapter_qc(project_id="p1", chapter_id="c1")
        assert qc_result["status"] == "attention_required"
        assert qc_result["anomalies_detected"] == 2
        assert qc_result["issues"][0]["issue"] == "Missing or incomplete audio take"
        assert "Suspiciously short" in qc_result["issues"][1]["issue"]


@pytest.mark.asyncio
async def test_check_system_health() -> None:
    """Test check_system_health returns healthy response or handles down server."""
    mock_client = AsyncMock()
    mock_client.get_health.return_value = {"status": "ok", "app": "novelova"}

    with patch("novelova_mcp.server.get_client", return_value=mock_client):
        res = await check_system_health()
        assert res["status"] == "ok"

    mock_client.get_health.side_effect = ConnectionError("Connection refused")
    with patch("novelova_mcp.server.get_client", return_value=mock_client):
        err_res = await check_system_health()
        assert err_res["status"] == "error"
        assert "Could not reach Novelova backend" in err_res["message"]


def test_mcp_prompt_renderings() -> None:
    """Test that prompt generator templates render actionable directorial instructions."""
    p1 = director_casting_pass("proj_123")
    assert "proj_123" in p1
    assert "list_characters" in p1
    assert "get_character_lines" in p1

    p2 = sound_designer_pass("proj_123", "chap_456")
    assert "chap_456" in p2
    assert "batch_assign_atmosphere" in p2
    assert "apply_foley_cue" in p2

    p3 = quality_audit_and_retake("proj_123", "chap_456")
    assert "audit_chapter_qc" in p3
    assert "regenerate_line_take" in p3

    p4 = production_batch_orchestrator("proj_123")
    assert "probe_compute_fleet" in p4
    assert "switch_primary_kaggle_account" in p4
    assert "dispatch_novel_audio" in p4
