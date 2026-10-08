import pytest
from app.core.config import settings
from app.db.session import get_session_factory
from app.models.chapter import ChapterModel, ScriptSegmentModel
from app.services.tagger import StageBTaggingService
from fastapi.testclient import TestClient


def get_auth_headers(client: TestClient) -> dict[str, str]:
    login_resp = client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={
            "email": settings.FIRST_USER_EMAIL,
            "password": settings.FIRST_USER_PASSWORD,
        },
    )
    token = login_resp.json()["data"]["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_paralinguistic_tag_filtering():
    # 1. Allowed tags pass through
    assert StageBTaggingService.filter_paralinguistic_tag("[laugh]", {}) == "[laugh]"
    assert StageBTaggingService.filter_paralinguistic_tag("[sigh]", {}) == "[sigh]"
    assert StageBTaggingService.filter_paralinguistic_tag("[gasp]", {}) == "[gasp]"
    assert StageBTaggingService.filter_paralinguistic_tag("[groan]", {}) == "[groan]"
    assert StageBTaggingService.filter_paralinguistic_tag("[chuckle]", {}) == "[chuckle]"
    assert StageBTaggingService.filter_paralinguistic_tag("[cough]", {}) == "[cough]"
    assert StageBTaggingService.filter_paralinguistic_tag("[sniff]", {}) == "[sniff]"
    assert StageBTaggingService.filter_paralinguistic_tag("[shush]", {}) == "[shush]"
    assert StageBTaggingService.filter_paralinguistic_tag("[clear throat]", {}) == "[clear throat]"

    # 2. Unauthorized tags rejected
    assert StageBTaggingService.filter_paralinguistic_tag("[cry]", {}) is None
    assert StageBTaggingService.filter_paralinguistic_tag("[yell]", {}) is None
    assert StageBTaggingService.filter_paralinguistic_tag("[angry]", {}) is None

    # 3. Master switch disabled
    settings_disabled = {"paralinguistic_tags_enabled": False}
    assert StageBTaggingService.filter_paralinguistic_tag("[laugh]", settings_disabled) is None
    assert StageBTaggingService.filter_paralinguistic_tag("[sniff]", settings_disabled) is None

    # 4. Granular tag toggle: sniff disabled, laugh enabled
    settings_granular = {
        "paralinguistic_tags_enabled": True,
        "active_paralinguistic_tags": {
            "sniff": False,
            "laugh": True,
        },
    }
    assert StageBTaggingService.filter_paralinguistic_tag("[sniff]", settings_granular) is None
    assert StageBTaggingService.filter_paralinguistic_tag("[laugh]", settings_granular) == "[laugh]"


def test_local_heuristic_attribution_and_fallback():
    # Test segments: 1 non-dialogue, 1 with speaker attribution, 1 anonymous fallback
    seg1 = ScriptSegmentModel(
        id="s1",
        chapter_id="c1",
        text="The carriage stopped in front of the gate.",
        is_dialogue=False,
    )
    seg2 = ScriptSegmentModel(
        id="s2",
        chapter_id="c1",
        text="“We are finally here,” said Mara.",
        is_dialogue=True,
    )
    seg3 = ScriptSegmentModel(
        id="s3",
        chapter_id="c1",
        text="“Halt! Who goes there?”",
        is_dialogue=True,
    )

    decisions = StageBTaggingService.apply_local_heuristic_attribution(
        [seg1, seg2, seg3],
        project_settings={"paralinguistic_tags_enabled": True},
    )

    assert len(decisions) == 3
    # Narration line
    assert decisions[0]["speaker"] == "Narrator"
    assert decisions[0]["gender"] == "neutral"

    # Attributed line: Mara
    assert decisions[1]["speaker"] == "Mara"
    assert decisions[1]["gender"] == "female"

    # Anonymous fallback: strictly default to male and General Male
    assert decisions[2]["speaker"] == "General Male"
    assert decisions[2]["gender"] == "male"


@pytest.mark.asyncio
async def test_stage_b_attribution_endpoint_and_character_sync(client: TestClient):
    headers = get_auth_headers(client)

    # 1. Create project
    proj_res = client.post(
        f"{settings.API_V1_STR}/projects",
        headers=headers,
        json={"title": "Stage B Tagging Pilot", "author": "Arthur Conan"},
    )
    assert proj_res.status_code == 201
    proj_id = proj_res.json()["data"]["id"]

    # 2. Insert chapter and segments directly in test db session
    factory = get_session_factory()
    async with factory() as db:
        chapter = ChapterModel(
            project_id=proj_id,
            chapter_number=1,
            title="Chapter 1: The Investigation",
            order_index=1,
            batch_number=1,
            word_count=200,
        )
        db.add(chapter)
        await db.flush()

        seg1 = ScriptSegmentModel(
            chapter_id=chapter.id,
            order_index=1,
            text="The autumn wind howled across the moors.",
            is_dialogue=False,
        )
        seg2 = ScriptSegmentModel(
            chapter_id=chapter.id,
            order_index=2,
            text="“We must proceed with caution,” said Holmes.",
            is_dialogue=True,
        )
        seg3 = ScriptSegmentModel(
            chapter_id=chapter.id,
            order_index=3,
            text="“Are you certain of this?” Watson asked.",
            is_dialogue=True,
        )
        seg4 = ScriptSegmentModel(
            chapter_id=chapter.id,
            order_index=4,
            text="“Someone is approaching!”",
            is_dialogue=True,
        )
        db.add_all([seg1, seg2, seg3, seg4])
        await db.commit()

    # 3. Call Tagging API
    tag_res = client.post(
        f"{settings.API_V1_STR}/projects/{proj_id}/tag",
        headers=headers,
    )
    assert tag_res.status_code == 200
    summary = tag_res.json()["data"]
    assert summary["project_id"] == proj_id
    assert summary["chapters_tagged"] == 1
    assert summary["total_segments_tagged"] >= 4

    # 4. Verify characters were created and synced
    chars_res = client.get(
        f"{settings.API_V1_STR}/projects/{proj_id}/characters",
        headers=headers,
    )
    assert chars_res.status_code == 200
    char_list = chars_res.json()["data"]["characters"]

    names = {c["name"] for c in char_list}
    assert "Narrator" in names
    # Either Holmes or General fallback will be present
    assert len(char_list) >= 2

    narrator = next(c for c in char_list if c["name"] == "Narrator")
    assert narrator["word_count"] > 0
    assert narrator["role_description"] == "Narration · Entire novel"
