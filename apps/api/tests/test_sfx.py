import io
import struct
import wave

from app.core.config import settings
from fastapi.testclient import TestClient


def make_dummy_wav() -> bytes:
    """Generate minimal valid 0.5-second WAV audio bytes."""
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(16000)
        wf.writeframes(struct.pack("<h", 0) * 8000)
    return buf.getvalue()


def get_auth_headers(client: TestClient) -> dict[str, str]:
    login_resp = client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={
            "email": settings.FIRST_USER_EMAIL,
            "password": settings.FIRST_USER_PASSWORD,
        },
    )
    assert login_resp.status_code == 200
    token = login_resp.json()["data"]["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_sfx_crud_flow(client: TestClient):
    headers = get_auth_headers(client)

    # 1. Create a project to test project-scoped sfx
    proj_resp = client.post(
        f"{settings.API_V1_STR}/projects",
        headers=headers,
        json={"title": "SFX Fantasy Novel"},
    )
    assert proj_resp.status_code == 201
    project_id = proj_resp.json()["data"]["id"]

    wav_bytes = make_dummy_wav()

    # 2. Create a global Foley sound (e.g. Explosion)
    create_foley = client.post(
        f"{settings.API_V1_STR}/sfx",
        headers=headers,
        data={
            "name": "Heavy Cannon Blast",
            "category": "foley",
            "is_global": "true",
            "default_volume": "1.0",
        },
        files={
            "audio_file": ("cannon.wav", io.BytesIO(wav_bytes), "audio/wav"),
        },
    )
    assert create_foley.status_code == 200
    foley_data = create_foley.json()["data"]
    assert foley_data["name"] == "Heavy Cannon Blast"
    assert foley_data["category"] == "foley"
    assert foley_data["is_global"] is True
    assert foley_data["project_id"] is None
    assert foley_data["audio_url"] is not None
    assert foley_data["duration_seconds"] == 0.5
    assert foley_data["default_volume"] == 1.0

    foley_id = foley_data["id"]

    # 3. Create a project-scoped Atmosphere sound (e.g. Ocean Waves)
    create_atmo = client.post(
        f"{settings.API_V1_STR}/sfx",
        headers=headers,
        data={
            "name": "Ocean Waves & Wind",
            "category": "atmosphere",
            "is_global": "false",
            "project_id": project_id,
            "default_volume": "0.18",
        },
        files={
            "audio_file": ("waves.wav", io.BytesIO(wav_bytes), "audio/wav"),
        },
    )
    assert create_atmo.status_code == 200
    atmo_data = create_atmo.json()["data"]
    assert atmo_data["name"] == "Ocean Waves & Wind"
    assert atmo_data["category"] == "atmosphere"
    assert atmo_data["is_global"] is False
    assert atmo_data["project_id"] == project_id
    assert atmo_data["default_volume"] == 0.18

    atmo_id = atmo_data["id"]

    # 4. List SFX with category filter = foley
    foley_list_resp = client.get(
        f"{settings.API_V1_STR}/sfx?project_id={project_id}&category=foley",
        headers=headers,
    )
    assert foley_list_resp.status_code == 200
    foley_ids = [item["id"] for item in foley_list_resp.json()["data"]["items"]]
    assert foley_id in foley_ids
    assert atmo_id not in foley_ids

    # 5. List SFX with category filter = atmosphere
    atmo_list_resp = client.get(
        f"{settings.API_V1_STR}/sfx?project_id={project_id}&category=atmosphere",
        headers=headers,
    )
    assert atmo_list_resp.status_code == 200
    atmo_ids = [item["id"] for item in atmo_list_resp.json()["data"]["items"]]
    assert atmo_id in atmo_ids
    assert foley_id not in atmo_ids

    # 6. Verify scoping for a different project
    other_proj_resp = client.post(
        f"{settings.API_V1_STR}/projects",
        headers=headers,
        json={"title": "Different Novel"},
    )
    assert other_proj_resp.status_code == 201
    other_project_id = other_proj_resp.json()["data"]["id"]

    other_list_resp = client.get(
        f"{settings.API_V1_STR}/sfx?project_id={other_project_id}",
        headers=headers,
    )
    assert other_list_resp.status_code == 200
    other_ids = [item["id"] for item in other_list_resp.json()["data"]["items"]]
    assert foley_id in other_ids  # Global sound is included
    assert atmo_id not in other_ids  # Project-scoped sound from novel 1 is NOT included

    # 7. Retrieve single sound by ID
    get_resp = client.get(
        f"{settings.API_V1_STR}/sfx/{foley_id}",
        headers=headers,
    )
    assert get_resp.status_code == 200
    assert get_resp.json()["data"]["id"] == foley_id

    # 8. Update sound metadata
    patch_resp = client.patch(
        f"{settings.API_V1_STR}/sfx/{foley_id}",
        headers=headers,
        data={
            "name": "Heavy Cannon Blast (Remastered)",
            "default_volume": "0.85",
        },
    )
    assert patch_resp.status_code == 200
    updated = patch_resp.json()["data"]
    assert updated["name"] == "Heavy Cannon Blast (Remastered)"
    assert updated["default_volume"] == 0.85

    # 9. Delete sound effects
    del_resp1 = client.delete(f"{settings.API_V1_STR}/sfx/{foley_id}", headers=headers)
    assert del_resp1.status_code == 200
    del_resp2 = client.delete(f"{settings.API_V1_STR}/sfx/{atmo_id}", headers=headers)
    assert del_resp2.status_code == 200

    # Verify deleted
    get_del = client.get(f"{settings.API_V1_STR}/sfx/{foley_id}", headers=headers)
    assert get_del.status_code == 404


def test_sfx_validation_errors(client: TestClient):
    headers = get_auth_headers(client)

    wav_bytes = make_dummy_wav()

    # Missing name
    resp_empty = client.post(
        f"{settings.API_V1_STR}/sfx",
        headers=headers,
        data={"name": "   "},
        files={"audio_file": ("test.wav", io.BytesIO(wav_bytes), "audio/wav")},
    )
    assert resp_empty.status_code == 400

    # Bad audio extension
    resp_bad_ext = client.post(
        f"{settings.API_V1_STR}/sfx",
        headers=headers,
        data={"name": "Bad File"},
        files={"audio_file": ("sound.pdf", io.BytesIO(b"fake pdf"), "application/pdf")},
    )
    assert resp_bad_ext.status_code == 400


def test_segment_sfx_and_atmosphere_integration(client: TestClient):
    headers = get_auth_headers(client)

    # 1. Create a project
    proj_resp = client.post(
        f"{settings.API_V1_STR}/projects",
        headers=headers,
        json={"title": "LitRPG World"},
    )
    assert proj_resp.status_code == 201
    project_id = proj_resp.json()["data"]["id"]

    # 2. Create a chapter with text
    ch_resp = client.post(
        f"{settings.API_V1_STR}/projects/{project_id}/chapters",
        headers=headers,
        json={"title": "Chapter 1: The Dungeon Gate"},
    )
    assert ch_resp.status_code == 201
    chapter_id = ch_resp.json()["data"]["id"]

    text_resp = client.post(
        f"{settings.API_V1_STR}/projects/{project_id}/chapters/{chapter_id}/text",
        headers=headers,
        json={
            "text": "The massive iron doors groaned open with a loud BOOOOM.\n"
                    "Cold ocean wind whipped across the dark stone corridors.\n"
                    "A holographic screen flickered before him."
        },
    )
    assert text_resp.status_code == 200
    segments = text_resp.json()["data"]["segments"]
    assert len(segments) >= 2

    seg1_id = segments[0]["id"]
    seg2_id = segments[1]["id"]

    # 3. Create a character with robotic voice filter (e.g. SYSTEM)
    char_resp = client.post(
        f"{settings.API_V1_STR}/projects/{project_id}/characters",
        headers=headers,
        json={
            "name": "SYSTEM",
            "gender": "narrator",
            "voice_filter_id": "robotic",
        },
    )
    assert char_resp.status_code in (200, 201)
    char_data = char_resp.json()["data"]
    assert char_data["name"] == "SYSTEM"
    assert char_data["voice_filter_id"] == "robotic"
    char_id = char_data["id"]

    # Update character voice filter
    char_update = client.patch(
        f"{settings.API_V1_STR}/projects/{project_id}/characters/{char_id}",
        headers=headers,
        json={"voice_filter_id": "radio"},
    )
    assert char_update.status_code == 200
    assert char_update.json()["data"]["voice_filter_id"] == "radio"

    # 4. Attach a Foley cue to segment 1 (e.g. BOOOOM replacement)
    cue = {
        "id": "cue-test-1",
        "sfx_id": "sfx-dummy-id",
        "sfx_name": "Heavy Cannon Blast",
        "audio_url": "/api/v1/sfx/storage/test.wav",
        "target_text": "BOOOOM",
        "action": "replace",
        "volume": 0.9,
    }
    seg1_patch = client.patch(
        f"{settings.API_V1_STR}/projects/{project_id}/segments/{seg1_id}",
        headers=headers,
        json={
            "sfx_cues": [cue],
            "voice_filter_id": "robotic",
        },
    )
    assert seg1_patch.status_code == 200
    seg1_data = seg1_patch.json()["data"]
    assert len(seg1_data["sfx_cues"]) == 1
    assert seg1_data["sfx_cues"][0]["target_text"] == "BOOOOM"
    assert seg1_data["sfx_cues"][0]["action"] == "replace"
    assert seg1_data["voice_filter_id"] == "robotic"

    # 5. Apply Atmosphere to multiple segments (lines/scenes)
    batch_atmo = client.post(
        f"{settings.API_V1_STR}/projects/{project_id}/segments/batch-atmosphere",
        headers=headers,
        json={
            "segment_ids": [seg1_id, seg2_id],
            "atmosphere_id": "atmo-ocean-waves",
            "atmosphere_name": "Ocean Waves & Wind",
            "atmosphere_volume": 0.15,
        },
    )
    assert batch_atmo.status_code == 200
    updated_segs = batch_atmo.json()["data"]
    assert len(updated_segs) == 2
    for s in updated_segs:
        assert s["atmosphere_id"] == "atmo-ocean-waves"
        assert s["atmosphere_name"] == "Ocean Waves & Wind"
        assert s["atmosphere_volume"] == 0.15

    # 6. Clear Atmosphere across segments
    batch_clear = client.post(
        f"{settings.API_V1_STR}/projects/{project_id}/segments/batch-atmosphere",
        headers=headers,
        json={
            "segment_ids": [seg1_id],
            "atmosphere_id": None,
        },
    )
    assert batch_clear.status_code == 200
    cleared_seg = batch_clear.json()["data"][0]
    assert cleared_seg["atmosphere_id"] is None
    assert cleared_seg["atmosphere_name"] is None


def test_audio_effects_dsp_filters():
    from app.services.audio_effects import (
        apply_voice_filter_wav,
        clean_text_for_foley_replacement,
        build_atmosphere_spans,
        overlay_atmosphere_to_master,
        generate_synthesized_foley_wav,
        generate_synthesized_atmosphere_wav,
    )

    # 1. Test Foley text cleaning
    text = "The hero shouted BOOOOM! and charged forward."
    cues = [{"action": "replace", "target_text": "BOOOOM"}]
    cleaned = clean_text_for_foley_replacement(text, cues)
    assert "BOOOOM" not in cleaned
    assert "The hero shouted" in cleaned
    assert "and charged forward" in cleaned

    # Non-replace action should leave text untouched
    cues_after = [{"action": "after", "target_text": "BOOOOM"}]
    assert clean_text_for_foley_replacement(text, cues_after) == text

    # 2. Test Voice Filter DSP
    dummy_wav = make_dummy_wav()
    for filter_id in ("robotic", "radio", "reverb", "telepathic", "telephone", "megaphone", "whisper"):
        filtered = apply_voice_filter_wav(dummy_wav, filter_id, sample_rate=16000)
        assert len(filtered) > 44
        with wave.open(io.BytesIO(filtered), "rb") as wf:
            assert wf.getnchannels() == 1
            assert wf.getsampwidth() == 2

    # 3. Test procedural Foley & Atmosphere synthesis
    boom_wav = generate_synthesized_foley_wav("Heavy Cannon Blast", duration_ms=500, volume=0.8, sample_rate=16000)
    assert len(boom_wav) > 44

    atmo_wav = generate_synthesized_atmosphere_wav("Ocean Waves & Wind", duration_ms=2000, volume=0.15, sample_rate=16000)
    assert len(atmo_wav) > 44

    # 4. Test Atmosphere scene span grouping and overlay
    segments_timings = [
        {"segment_id": "seg-1", "order_index": 1, "atmosphere_id": "ocean", "atmosphere_name": "Ocean", "volume": 0.2, "start_ms": 0, "end_ms": 1000, "duration_ms": 1000},
        {"segment_id": "seg-2", "order_index": 2, "atmosphere_id": "ocean", "atmosphere_name": "Ocean", "volume": 0.2, "start_ms": 1300, "end_ms": 2500, "duration_ms": 1200},
        {"segment_id": "seg-3", "order_index": 3, "atmosphere_id": None, "start_ms": 2800, "end_ms": 3500, "duration_ms": 700},
    ]
    spans = build_atmosphere_spans(segments_timings)
    assert len(spans) == 1
    assert spans[0]["atmosphere_id"] == "ocean"
    assert spans[0]["start_ms"] == 0
    assert spans[0]["end_ms"] == 2500
    assert len(spans[0]["segment_ids"]) == 2

    # 5. Test Atmosphere overlay onto master audio
    master_wav = make_dummy_wav()
    mixed = overlay_atmosphere_to_master(master_wav, spans, sample_rate=16000)
    assert len(mixed) == len(master_wav)


def test_segment_retake_with_foley_and_filter(client: TestClient):
    headers = get_auth_headers(client)

    # 1. Create novel project & chapter
    proj = client.post(f"{settings.API_V1_STR}/projects", headers=headers, json={"title": "Studio Retake Novel"}).json()["data"]
    p_id = proj["id"]
    ch = client.post(f"{settings.API_V1_STR}/projects/{p_id}/chapters", headers=headers, json={"title": "Chapter One"}).json()["data"]
    ch_id = ch["id"]

    client.post(
        f"{settings.API_V1_STR}/projects/{p_id}/chapters/{ch_id}/text",
        headers=headers,
        json={"text": "The machine whirred.\nSYSTEM: Warning detected."},
    )

    full_ch = client.get(f"{settings.API_V1_STR}/projects/{p_id}/chapters/{ch_id}", headers=headers).json()["data"]
    segs = full_ch["segments"]
    assert len(segs) >= 1
    target_seg = segs[0]

    # 2. Patch segment with robotic filter and Foley cue
    client.patch(
        f"{settings.API_V1_STR}/projects/{p_id}/segments/{target_seg['id']}",
        headers=headers,
        json={
            "voice_filter_id": "robotic",
            "sfx_cues": [{
                "id": "cue-test-foley",
                "sfx_id": "sfx-dummy",
                "name": "Metal Clank",
                "action": "after",
                "volume": 0.8,
            }],
        },
    )

    # 3. Trigger surgical segment take synthesis
    retake_resp = client.post(
        f"{settings.API_V1_STR}/projects/{p_id}/segments/{target_seg['id']}/regenerate-audio",
        headers=headers,
        json={"speed": 1.0},
    )
    assert retake_resp.status_code == 200
    retake_data = retake_resp.json()["data"]
    assert retake_data["audio_url"] is not None
    assert retake_data["segment"]["audio_status"] == "complete"
    assert retake_data["duration_ms"] > 0

