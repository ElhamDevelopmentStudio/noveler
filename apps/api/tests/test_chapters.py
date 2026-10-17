from app.core.config import settings
from fastapi.testclient import TestClient


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


def test_parse_project_and_fetch_chapters(client: TestClient):
    headers = get_auth_headers(client)

    # 1. Upload manuscript file
    manuscript_text = b"""Chapter 1
The cold came down from the ridge earlier than anyone remembered.
"You should not be out here without gloves, Mara," her sister June called from the porch.
"The frost reached the fourth row before noon."

Chapter 2
The orchard house had seven rooms, but only two stayed warm once November settled in.
"The gate latch is frozen again," Elias said, unbuttoning his heavy sheepskin coat.
"It has been frozen since Tuesday," Mara answered without looking up from the parchment.

Chapter 3
By morning, the rain had drawn a new map over the orchard.
"Is this the map from thirty-four?" Dr. Rowan Bell asked.
"It is the only map we have," Mara said softly.
"""

    upload_resp = client.post(
        f"{settings.API_V1_STR}/attachments/upload",
        files={"file": ("test_manuscript.txt", manuscript_text, "text/plain")},
        headers=headers,
    )
    assert upload_resp.status_code == 200
    attachment_id = upload_resp.json()["data"]["id"]

    # 2. Create a project in ready_to_parse state with manuscript attached
    create_resp = client.post(
        f"{settings.API_V1_STR}/projects",
        json={
            "title": "Real Manuscript Test Project",
            "author": "Mara Voss",
            "status": "ready_to_parse",
            "source": "TXT",
            "manuscript_attachment_id": attachment_id,
        },
        headers=headers,
    )
    assert create_resp.status_code == 201
    project_id = create_resp.json()["data"]["id"]

    # 3. Trigger parse with 6 configuration options
    parse_resp = client.post(
        f"{settings.API_V1_STR}/projects/{project_id}/parse",
        json={
            "remove_whitespace": True,
            "normalize_paragraphs": True,
            "separate_sentence_wise": True,
            "detect_chapter_headings": True,
            "preserve_italics": True,
            "fix_punctuation_spacing": True,
        },
        headers=headers,
    )
    assert parse_resp.status_code == 200
    parse_data = parse_resp.json()["data"]
    assert parse_data["project_id"] == project_id
    assert parse_data["total_chapters"] == 3
    assert parse_data["total_words"] > 50
    assert parse_data["status"] == "in_production"

    # 4. Fetch chapter summaries list
    chapters_resp = client.get(
        f"{settings.API_V1_STR}/projects/{project_id}/chapters",
        headers=headers,
    )
    assert chapters_resp.status_code == 200
    chapters = chapters_resp.json()["data"]
    assert len(chapters) == 3

    first_chap = chapters[0]
    assert "id" in first_chap
    assert first_chap["word_count"] > 0
    assert first_chap["estimated_duration_seconds"] > 0
    assert first_chap["status"] == "parsed"

    # 5. Fetch single chapter detail with script segments
    first_chap_id = first_chap["id"]
    detail_resp = client.get(
        f"{settings.API_V1_STR}/projects/{project_id}/chapters/{first_chap_id}",
        headers=headers,
    )
    assert detail_resp.status_code == 200
    detail = detail_resp.json()["data"]
    assert detail["id"] == first_chap_id
    assert "segments" in detail
    assert len(detail["segments"]) > 0

    # Ensure segments identify dialogue vs narration
    segments = detail["segments"]
    assert any(s["is_dialogue"] for s in segments)
    assert any(not s["is_dialogue"] for s in segments)

    # 6. Test updating segment (speaker, emotion, delivery_type)
    target_seg = segments[0]
    seg_id = target_seg["id"]
    update_resp = client.patch(
        f"{settings.API_V1_STR}/projects/{project_id}/segments/{seg_id}",
        json={
            "speaker": "June",
            "speaker_gender": "female",
            "delivery_type": "dialogue",
            "emotion": "[sigh]",
            "text": "Updated line of dialogue.",
        },
        headers=headers,
    )
    assert update_resp.status_code == 200
    updated_data = update_resp.json()["data"]
    assert updated_data["speaker"] == "June"
    assert updated_data["speaker_gender"] == "female"
    assert updated_data["delivery_type"] == "dialogue"
    assert updated_data["emotion"] == "[sigh]"
    assert updated_data["text"] == "Updated line of dialogue."

    # Clear emotion
    clear_resp = client.patch(
        f"{settings.API_V1_STR}/projects/{project_id}/segments/{seg_id}",
        json={"emotion": None},
        headers=headers,
    )
    assert clear_resp.status_code == 200
    assert clear_resp.json()["data"]["emotion"] is None

    # 7. Test splitting segment
    text_to_split = updated_data["text"]  # "Updated line of dialogue." (len 25)
    split_idx = 12  # splits at "Updated line" and " of dialogue."
    split_resp = client.post(
        f"{settings.API_V1_STR}/projects/{project_id}/segments/{seg_id}/split",
        json={"split_index": split_idx},
        headers=headers,
    )
    assert split_resp.status_code == 200
    split_data = split_resp.json()["data"]
    assert len(split_data) == 2
    left_seg = split_data[0]
    right_seg = split_data[1]
    assert left_seg["id"] == seg_id
    assert left_seg["text"] == text_to_split[:split_idx].rstrip()
    assert right_seg["text"] == text_to_split[split_idx:].lstrip()
    assert right_seg["order_index"] == left_seg["order_index"] + 1

    # 8. Test merging segment (merge right_seg back into left_seg with direction='next' on left)
    merge_resp = client.post(
        f"{settings.API_V1_STR}/projects/{project_id}/segments/{left_seg['id']}/merge",
        json={"direction": "next"},
        headers=headers,
    )
    assert merge_resp.status_code == 200
    merged_data = merge_resp.json()["data"]
    assert merged_data["id"] == left_seg["id"]
    assert "Updated line" in merged_data["text"]
    assert "of dialogue." in merged_data["text"]


def test_split_segment_continuation_and_delivery_reclassification(client: TestClient):
    """Verify Issue #2: Splitting dialogue from narration reclassifies delivery and does not corrupt continuation flags."""
    headers = get_auth_headers(client)

    # 1. Create a project and chapter with a starts_phrase segment containing fused quote + speech tag
    create_resp = client.post(
        f"{settings.API_V1_STR}/projects",
        json={"title": "Continuation Split Project", "author": "Tester"},
        headers=headers,
    )
    assert create_resp.status_code == 201
    project_id = create_resp.json()["data"]["id"]

    from app.db.session import get_session_factory
    from app.models.chapter import ChapterModel, ScriptSegmentModel
    import uuid

    factory = get_session_factory()
    turn_id = str(uuid.uuid4())
    async def seed():
        async with factory() as db:
            ch = ChapterModel(
                id=str(uuid.uuid4()),
                project_id=project_id,
                chapter_number=1,
                title="Split Test Chapter",
                order_index=0,
                batch_number=1,
                word_count=50,
            )
            db.add(ch)
            await db.flush()

            seg = ScriptSegmentModel(
                id=str(uuid.uuid4()),
                chapter_id=ch.id,
                order_index=0,
                text='"I will find him," Mara whispered softly.',
                is_dialogue=True,
                delivery_type="dialogue",
                continuation_type="starts_phrase",
                parent_turn_id=turn_id,
                speaker="Mara",
                speaker_gender="female",
            )
            db.add(seg)
            await db.commit()
            return seg.id

    import asyncio
    seg_id = asyncio.run(seed())

    # Split between `"I will find him,"` (len 19) and `Mara whispered softly.`
    split_resp = client.post(
        f"{settings.API_V1_STR}/projects/{project_id}/segments/{seg_id}/split",
        json={"split_index": 19},
        headers=headers,
    )
    assert split_resp.status_code == 200
    split_data = split_resp.json()["data"]
    assert len(split_data) == 2

    left = split_data[0]
    right = split_data[1]

    # Left is dialogue
    assert left["text"] == '"I will find him,"'
    assert left["is_dialogue"] is True
    assert left["delivery_type"] == "dialogue"
    assert left["speaker"] == "Mara"
    assert left["continuation_type"] == "starts_phrase"
    assert left["parent_turn_id"] == turn_id

    # Right is narration beat - must NOT be dialogue and must NOT duplicate starts_phrase!
    assert "Mara whispered softly." in right["text"]
    assert right["is_dialogue"] is False
    assert right["delivery_type"] == "narration"
    assert right["speaker"] == "Narrator"
    assert right["continuation_type"] == "none"
    assert right["parent_turn_id"] is None


def test_format_project_script_in_place(client: TestClient):
    headers = get_auth_headers(client)

    manuscript = b"""Chapter 1
Mara counted 4 books on the wooden shelf.
"There are only 3 left now," Mara whispered softly.
"""
    upload_resp = client.post(
        f"{settings.API_V1_STR}/attachments/upload",
        files={"file": ("format_test.txt", manuscript, "text/plain")},
        headers=headers,
    )
    attachment_id = upload_resp.json()["data"]["id"]

    create_resp = client.post(
        f"{settings.API_V1_STR}/projects",
        json={
            "title": "Format In Place Test",
            "status": "ready_to_parse",
            "source": "TXT",
            "manuscript_attachment_id": attachment_id,
        },
        headers=headers,
    )
    assert create_resp.status_code == 201
    project_id = create_resp.json()["data"]["id"]

    # Parse initial manuscript without number expansion
    parse_resp = client.post(
        f"{settings.API_V1_STR}/projects/{project_id}/parse",
        json={"speak_unambiguous_numbers": False},
        headers=headers,
    )
    assert parse_resp.status_code == 200

    # Get chapters
    chaps_resp = client.get(
        f"{settings.API_V1_STR}/projects/{project_id}/chapters",
        headers=headers,
    )
    chaps = chaps_resp.json()["data"]
    chap_id = chaps[0]["id"]

    # Get segments
    detail_resp = client.get(
        f"{settings.API_V1_STR}/projects/{project_id}/chapters/{chap_id}",
        headers=headers,
    )
    segments = detail_resp.json()["data"]["segments"]
    assert len(segments) >= 2

    # Tag the dialogue segment with custom speaker
    dialogue_seg = [s for s in segments if "left now" in s["text"]][0]
    client.patch(
        f"{settings.API_V1_STR}/projects/{project_id}/segments/{dialogue_seg['id']}",
        json={
            "speaker": "Mara",
            "speaker_gender": "female",
            "emotion": "[whisper]",
        },
        headers=headers,
    )

    # Call format in-place
    format_resp = client.post(
        f"{settings.API_V1_STR}/projects/{project_id}/format",
        json={
            "speak_unambiguous_numbers": True,
            "fix_punctuation_spacing": True,
        },
        headers=headers,
    )
    assert format_resp.status_code == 200
    format_data = format_resp.json()["data"]
    assert format_data["formatted_segments_count"] >= 1

    # Verify updated segments
    detail_resp2 = client.get(
        f"{settings.API_V1_STR}/projects/{project_id}/chapters/{chap_id}",
        headers=headers,
    )
    segments2 = detail_resp2.json()["data"]["segments"]

    # Check that number 4 became "four"
    narration_seg = [s for s in segments2 if s["id"] != dialogue_seg["id"]][0]
    assert "four" in narration_seg["text"].lower()

    # Crucially verify speaker, gender, emotion and ID were preserved!
    updated_dialogue = [s for s in segments2 if s["id"] == dialogue_seg["id"]][0]
    assert updated_dialogue["speaker"] == "Mara"
    assert updated_dialogue["speaker_gender"] == "female"
    assert updated_dialogue["emotion"] == "[whisper]"
    assert "three" in updated_dialogue["text"].lower()


def test_reparse_with_preserved_tags(client: TestClient):
    headers = get_auth_headers(client)

    manuscript = b"""Chapter 1
"It is quiet out here," Mara said.
"Too quiet," answered Liam.
"""
    upload_resp = client.post(
        f"{settings.API_V1_STR}/attachments/upload",
        files={"file": ("reparse_test.txt", manuscript, "text/plain")},
        headers=headers,
    )
    attachment_id = upload_resp.json()["data"]["id"]

    create_resp = client.post(
        f"{settings.API_V1_STR}/projects",
        json={
            "title": "Reparse Preserved Test",
            "status": "ready_to_parse",
            "source": "TXT",
            "manuscript_attachment_id": attachment_id,
        },
        headers=headers,
    )
    assert create_resp.status_code == 201
    project_id = create_resp.json()["data"]["id"]

    client.post(
        f"{settings.API_V1_STR}/projects/{project_id}/parse",
        headers=headers,
    )

    chaps_resp = client.get(
        f"{settings.API_V1_STR}/projects/{project_id}/chapters",
        headers=headers,
    )
    chap_id = chaps_resp.json()["data"][0]["id"]
    detail_resp = client.get(
        f"{settings.API_V1_STR}/projects/{project_id}/chapters/{chap_id}",
        headers=headers,
    )
    segments = detail_resp.json()["data"]["segments"]

    # Tag Mara
    mara_seg = [s for s in segments if "quiet out here" in s["text"]][0]
    client.patch(
        f"{settings.API_V1_STR}/projects/{project_id}/segments/{mara_seg['id']}",
        json={"speaker": "Mara", "speaker_gender": "female"},
        headers=headers,
    )

    # Re-parse with preserve_existing_tags=True
    reparse_resp = client.post(
        f"{settings.API_V1_STR}/projects/{project_id}/parse",
        json={"preserve_existing_tags": True},
        headers=headers,
    )
    assert reparse_resp.status_code == 200

    # Fetch new segments and verify Mara's attribution was preserved
    chaps_resp2 = client.get(
        f"{settings.API_V1_STR}/projects/{project_id}/chapters",
        headers=headers,
    )
    chap_id2 = chaps_resp2.json()["data"][0]["id"]
    detail_resp2 = client.get(
        f"{settings.API_V1_STR}/projects/{project_id}/chapters/{chap_id2}",
        headers=headers,
    )
    segments2 = detail_resp2.json()["data"]["segments"]
    mara_restored = [s for s in segments2 if "quiet out here" in s["text"]][0]
    assert mara_restored["speaker"] == "Mara"
    assert mara_restored["speaker_gender"] == "female"


def test_get_chapter_audio_stream(client: TestClient):
    headers = get_auth_headers(client)

    # 1. Create project
    create_resp = client.post(
        f"{settings.API_V1_STR}/projects",
        json={"title": "Audio Stream Test Project", "status": "in_production"},
        headers=headers,
    )
    assert create_resp.status_code == 201
    project_id = create_resp.json()["data"]["id"]

    # 2. Create chapter
    chap_resp = client.post(
        f"{settings.API_V1_STR}/projects/{project_id}/chapters",
        json={"title": "Prologue: Audio Stream"},
        headers=headers,
    )
    assert chap_resp.status_code == 201
    chap_id = chap_resp.json()["data"]["id"]

    # 3. Save text into segments
    save_text_resp = client.post(
        f"{settings.API_V1_STR}/projects/{project_id}/chapters/{chap_id}/text",
        json={
            "text": "I am an Earthling from a civilized society.\n\"Oh dear, Mr. Seo. My mother sent this for you.\"\n\"Thank you.\""
        },
        headers=headers,
    )
    assert save_text_resp.status_code == 200

    # 4. Get chapter audio stream
    audio_resp = client.get(
        f"{settings.API_V1_STR}/projects/{project_id}/chapters/{chap_id}/audio-stream",
        headers=headers,
    )
    assert audio_resp.status_code == 200
    data = audio_resp.json()["data"]
    assert data["chapter_id"] == chap_id
    assert data["total_duration_seconds"] > 0
    assert len(data["alignments"]) == 3
    a0 = data["alignments"][0]
    a1 = data["alignments"][1]
    a2 = data["alignments"][2]
    assert a0["start_ms"] == 0
    assert a0["end_ms"] > 0
    assert a1["start_ms"] >= a0["end_ms"]
    assert a2["start_ms"] >= a1["end_ms"]


def test_generate_audio_kaggle_edge_cases(client: TestClient):
    headers = get_auth_headers(client)

    # 1. Create project & chapter with segments
    proj = client.post(
        f"{settings.API_V1_STR}/projects",
        json={"title": "Audio Edge Cases Project", "status": "in_production"},
        headers=headers,
    ).json()["data"]
    p_id = proj["id"]

    chap = client.post(
        f"{settings.API_V1_STR}/projects/{p_id}/chapters",
        json={"title": "Chapter 1: Edge Cases"},
        headers=headers,
    ).json()["data"]
    c_id = chap["id"]

    # Try generating with empty chapter -> 400
    empty_gen = client.post(
        f"{settings.API_V1_STR}/projects/{p_id}/chapters/{c_id}/generate-audio",
        headers=headers,
    )
    assert empty_gen.status_code == 400

    # Add text
    client.post(
        f"{settings.API_V1_STR}/projects/{p_id}/chapters/{c_id}/text",
        json={"text": "Line one.\nLine two."},
        headers=headers,
    )

    # 2. Case: No Kaggle account configured -> 400 NO_KAGGLE_ACCOUNTS
    no_acc_resp = client.post(
        f"{settings.API_V1_STR}/projects/{p_id}/chapters/{c_id}/generate-audio",
        headers=headers,
    )
    assert no_acc_resp.status_code == 400
    assert "NO_KAGGLE_ACCOUNTS" in no_acc_resp.text or "No Kaggle account" in no_acc_resp.text

    # 3. Add Kaggle account directly
    add_acc = client.post(
        f"{settings.API_V1_STR}/profile/kaggle/accounts",
        json={
            "username": "test_exhausted_user",
            "key": "KGAT_testdummytoken000000000000",
            "priority": 1,
            "verify_first": False,
        },
        headers=headers,
    ).json()["data"]
    acc_id = add_acc["id"]

    client.put(
        f"{settings.API_V1_STR}/profile/kaggle/accounts/{acc_id}",
        json={"priority": 1, "is_active": True, "verify_first": False},
        headers=headers,
    )
    gen_resp = client.post(
        f"{settings.API_V1_STR}/projects/{p_id}/chapters/{c_id}/generate-audio",
        headers=headers,
    )
    assert gen_resp.status_code == 200
    gen_data = gen_resp.json()["data"]
    assert gen_data["status"] == "in_production"
    assert gen_data["kaggle_account_used"] == "test_exhausted_user"

    # Reset chapter audio
    reset_resp = client.post(
        f"{settings.API_V1_STR}/projects/{p_id}/chapters/{c_id}/reset-audio",
        headers=headers,
    )
    assert reset_resp.status_code == 200
    assert reset_resp.json()["data"]["status"] == "parsed"
    assert reset_resp.json()["data"]["audio_url"] is None


def test_regenerate_segment_audio_surgical_retake(client: TestClient):
    headers = get_auth_headers(client)

    # 1. Create project & chapter with text
    proj = client.post(
        f"{settings.API_V1_STR}/projects",
        json={"title": "Surgical Retake Project", "status": "in_production"},
        headers=headers,
    ).json()["data"]
    p_id = proj["id"]

    chap = client.post(
        f"{settings.API_V1_STR}/projects/{p_id}/chapters",
        json={"title": "Chapter 1: Retake Scene"},
        headers=headers,
    ).json()["data"]
    c_id = chap["id"]

    # Save chapter script
    client.post(
        f"{settings.API_V1_STR}/projects/{p_id}/chapters/{c_id}/text",
        json={"text": "Alice sighed.\n\"We must press forward,\" she whispered.\nBob nodded."},
        headers=headers,
    )

    # Fetch chapter segments
    c_detail = client.get(
        f"{settings.API_V1_STR}/projects/{p_id}/chapters/{c_id}",
        headers=headers,
    ).json()["data"]
    segments = c_detail["segments"]
    assert len(segments) >= 3

    target_seg = segments[1]  # The dialogue segment
    seg_id = target_seg["id"]

    # 2. Trigger surgical retake
    retake_resp = client.post(
        f"{settings.API_V1_STR}/projects/{p_id}/segments/{seg_id}/regenerate-audio",
        json={"speed": 1.1},
        headers=headers,
    )
    assert retake_resp.status_code == 200
    retake_data = retake_resp.json()["data"]
    assert retake_data["chapter_id"] == c_id
    assert retake_data["audio_url"] is not None
    assert retake_data["audio_url"].startswith("http") or "/api/v1/attachments/" in retake_data["audio_url"]
    assert retake_data["duration_ms"] > 0
    assert retake_data["segment"]["audio_status"] == "complete"
    assert retake_data["segment"]["audio_url"] == retake_data["audio_url"]

    # 3. Check audio stream reflects the new alignment and take URL
    stream_resp = client.get(
        f"{settings.API_V1_STR}/projects/{p_id}/chapters/{c_id}/audio-stream",
        headers=headers,
    )
    assert stream_resp.status_code == 200
    stream_data = stream_resp.json()["data"]
    alignments = stream_data["alignments"]
    matching_alignment = next((a for a in alignments if a["segment_id"] == seg_id), None)
    assert matching_alignment is not None
    assert matching_alignment["audio_url"] == retake_data["audio_url"]
    assert matching_alignment["duration_ms"] == retake_data["duration_ms"]

    # 4. 404 on nonexistent segment
    bad_resp = client.post(
        f"{settings.API_V1_STR}/projects/{p_id}/segments/00000000-0000-0000-0000-000000000000/regenerate-audio",
        json={},
        headers=headers,
    )
    assert bad_resp.status_code == 404


def test_batch_audio_lane_dispatcher_and_cancellation(client: TestClient):
    headers = get_auth_headers(client)

    # 1. Setup 2 Kaggle accounts in pool
    resp_alpha = client.post(
        f"{settings.API_V1_STR}/profile/kaggle/accounts",
        json={
            "username": "batch_lane_acc_alpha",
            "key": "KGAT_testdummy_alpha",
            "priority": 1,
            "verify_first": False,
        },
        headers=headers,
    )
    assert resp_alpha.status_code == 200

    resp_beta = client.post(
        f"{settings.API_V1_STR}/profile/kaggle/accounts",
        json={
            "username": "batch_lane_acc_beta",
            "key": "KGAT_testdummy_beta",
            "priority": 2,
            "verify_first": False,
        },
        headers=headers,
    )
    assert resp_beta.status_code == 200

    # 2. Create project with 3 chapters
    proj_resp = client.post(
        f"{settings.API_V1_STR}/projects",
        json={"title": "Multi-Lane Batch Test Project", "status": "in_production"},
        headers=headers,
    )
    assert proj_resp.status_code == 201
    p_id = proj_resp.json()["data"]["id"]

    for i in range(1, 4):
        c_resp = client.post(
            f"{settings.API_V1_STR}/projects/{p_id}/chapters",
            json={"title": f"Chapter {i}: The Crossing"},
            headers=headers,
        )
        assert c_resp.status_code == 201
        c_id = c_resp.json()["data"]["id"]
        client.post(
            f"{settings.API_V1_STR}/projects/{p_id}/chapters/{c_id}/text",
            json={"text": f"Chapter {i} begins here.\n\"Are we ready?\" asked Mara.\n\"Yes,\" replied June."},
            headers=headers,
        )

    # 3. Dispatch batch audio
    batch_resp = client.post(
        f"{settings.API_V1_STR}/projects/{p_id}/generate-batch-audio",
        json={
            "allow_dev_offline": True,
            "preferred_tts_model": "kokoro-82m",
        },
        headers=headers,
    )
    assert batch_resp.status_code == 200
    batch_data = batch_resp.json()["data"]
    assert batch_data["project_id"] == p_id
    assert batch_data["total_chapters"] == 3
    assert len(batch_data["lanes"]) >= 2
    assert "Dispatched batch synthesis" in batch_data["message"]

    # Verify lane assignments
    lane_0 = batch_data["lanes"][0]
    lane_1 = batch_data["lanes"][1]
    assert lane_0["lane_index"] == 0
    assert lane_1["lane_index"] == 1
    assert lane_0["status"] == "running"
    assert sum(len(l["chapter_ids"]) for l in batch_data["lanes"]) == 3

    # 4. Check batch audio status endpoint
    status_resp = client.get(
        f"{settings.API_V1_STR}/projects/{p_id}/batch-audio-status",
        headers=headers,
    )
    assert status_resp.status_code == 200
    status_data = status_resp.json()["data"]
    assert status_data["total_chapters"] == 3
    assert len(status_data["lanes"]) >= 2

    # 5. Cancel batch audio
    cancel_resp = client.post(
        f"{settings.API_V1_STR}/projects/{p_id}/cancel-batch-audio",
        headers=headers,
    )
    assert cancel_resp.status_code == 200
    cancel_data = cancel_resp.json()["data"]
    assert cancel_data["success"] is True
    assert "cancelled" in cancel_data["message"].lower()

    # 6. Verify chapters reset
    status_resp_after = client.get(
        f"{settings.API_V1_STR}/projects/{p_id}/batch-audio-status",
        headers=headers,
    )
    assert status_resp_after.status_code == 200
    assert status_resp_after.json()["data"]["is_active"] is False






