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


