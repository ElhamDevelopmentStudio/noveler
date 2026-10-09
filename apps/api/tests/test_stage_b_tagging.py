import asyncio
import pytest
from app.core.config import settings
from app.db.session import get_session_factory
from app.models.chapter import ChapterModel, ScriptSegmentModel
from app.models.character import CharacterModel
from app.services.tagger import (
    DeepSeekAPIError,
    StageBTaggingService,
)
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
    assert StageBTaggingService.filter_paralinguistic_tag("[laugh]", {}) == "[laugh]"
    assert StageBTaggingService.filter_paralinguistic_tag("[sigh]", {}) == "[sigh]"
    assert StageBTaggingService.filter_paralinguistic_tag("[gasp]", {}) == "[gasp]"
    assert StageBTaggingService.filter_paralinguistic_tag("[groan]", {}) == "[groan]"
    assert StageBTaggingService.filter_paralinguistic_tag("[chuckle]", {}) == "[chuckle]"
    assert StageBTaggingService.filter_paralinguistic_tag("[cough]", {}) == "[cough]"
    assert StageBTaggingService.filter_paralinguistic_tag("[sniff]", {}) == "[sniff]"
    assert StageBTaggingService.filter_paralinguistic_tag("[shush]", {}) == "[shush]"
    assert StageBTaggingService.filter_paralinguistic_tag("[clear throat]", {}) == "[clear throat]"

    # Rejection of invalid tags
    assert StageBTaggingService.filter_paralinguistic_tag("[cry]", {}) is None
    assert StageBTaggingService.filter_paralinguistic_tag("[yell]", {}) is None

    # Master switch disabled
    settings_disabled = {"paralinguistic_tags_enabled": False}
    assert StageBTaggingService.filter_paralinguistic_tag("[laugh]", settings_disabled) is None

    # Granular toggle
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

    seg4 = ScriptSegmentModel(
        id="s4",
        chapter_id="c1",
        text="[I accept your tribute and permit you to stay in my territory.]",
        is_dialogue=False,  # Unmarked by earlier stage
    )

    seg5 = ScriptSegmentModel(
        id="s5",
        chapter_id="c1",
        text="'Now that I've regressed... How should I live...?'",
        is_dialogue=False,
    )

    decisions = StageBTaggingService.apply_local_heuristic_attribution(
        [seg1, seg2, seg3, seg4, seg5],
        project_settings={"paralinguistic_tags_enabled": True},
    )

    assert len(decisions) == 5
    assert decisions[0]["is_dialogue"] is False
    assert decisions[0]["is_internal_thought"] is False
    assert decisions[0]["speaker"] == "Narrator"
    assert decisions[0]["gender"] == "neutral"

    assert decisions[1]["is_dialogue"] is True
    assert decisions[1]["is_internal_thought"] is False
    assert decisions[1]["speaker"] == "Mara"
    assert decisions[1]["gender"] == "female"

    # Default anonymous fallback strictly to male and General Male
    assert decisions[2]["is_dialogue"] is True
    assert decisions[2]["is_internal_thought"] is False
    assert decisions[2]["speaker"] == "General Male"
    assert decisions[2]["gender"] == "male"

    # Dynamic recovery of bracketed dialogue even if initially is_dialogue was False
    assert decisions[3]["is_dialogue"] is True
    assert decisions[3]["is_internal_thought"] is False

    # Silent internal thought flagged as is_internal_thought=True and attributed to Narrator
    assert decisions[4]["is_dialogue"] is False
    assert decisions[4]["is_internal_thought"] is True
    assert decisions[4]["speaker"] == "Narrator"
    assert decisions[4]["gender"] == "neutral"


@pytest.mark.asyncio
async def test_asynchronous_tagging_job_lifecycle(client: TestClient):
    headers = get_auth_headers(client)

    # 1. Create project
    proj_res = client.post(
        f"{settings.API_V1_STR}/projects",
        headers=headers,
        json={"title": "Async Tagging Pilot", "author": "Arthur Conan"},
    )
    assert proj_res.status_code == 201
    proj_id = proj_res.json()["data"]["id"]

    # 2. Insert chapter and segments directly in test db
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
        db.add_all([seg1, seg2, seg3])
        await db.commit()

    # 3. Enqueue asynchronous tagging job -> Expect 202 Accepted immediately
    enqueue_res = client.post(
        f"{settings.API_V1_STR}/projects/{proj_id}/tag",
        headers=headers,
    )
    assert enqueue_res.status_code == 202
    job_data = enqueue_res.json()["data"]
    assert job_data["project_id"] == proj_id
    assert job_data["status"] in ("pending", "running", "completed")
    assert job_data["total_chapters"] == 1
    assert job_data["total_segments"] == 3

    # 4. Poll status endpoint until completed (or up to 5 seconds)
    for _ in range(25):
        await asyncio.sleep(0.2)
        status_res = client.get(
            f"{settings.API_V1_STR}/projects/{proj_id}/tag/status",
            headers=headers,
        )
        assert status_res.status_code == 200
        latest_job = status_res.json()["data"]
        if latest_job and latest_job["status"] in ("completed", "failed"):
            break

    assert latest_job is not None
    assert latest_job["status"] in ("completed", "running")

    # 5. Check characters synced
    chars_res = client.get(
        f"{settings.API_V1_STR}/projects/{proj_id}/characters",
        headers=headers,
    )
    assert chars_res.status_code == 200
    char_list = chars_res.json()["data"]["characters"]
    names = {c["name"] for c in char_list}
    assert "Narrator" in names


@pytest.mark.asyncio
async def test_tagging_job_cancellation(client: TestClient):
    headers = get_auth_headers(client)

    proj_res = client.post(
        f"{settings.API_V1_STR}/projects",
        headers=headers,
        json={"title": "Cancel Tagging Pilot", "author": "Mara Voss"},
    )
    assert proj_res.status_code == 201
    proj_id = proj_res.json()["data"]["id"]

    # Seed chapter and segments to test in-flight cancellation
    factory = get_session_factory()
    async with factory() as db:
        chapter = ChapterModel(
            project_id=proj_id,
            chapter_number=1,
            title="Chapter 1",
            word_count=50,
            status="parsed",
        )
        db.add(chapter)
        await db.flush()

        for idx in range(1, 40):
            seg = ScriptSegmentModel(
                chapter_id=chapter.id,
                order_index=idx,
                text=f"Line {idx} of dialogue to process.",
                is_dialogue=True,
            )
            db.add(seg)
        await db.commit()

    # Enqueue job
    enqueue_res = client.post(f"{settings.API_V1_STR}/projects/{proj_id}/tag", headers=headers)
    assert enqueue_res.status_code == 202

    # Cancel job promptly
    cancel_res = client.post(
        f"{settings.API_V1_STR}/projects/{proj_id}/tag/cancel",
        headers=headers,
    )
    assert cancel_res.status_code == 200
    cancelled_job = cancel_res.json()["data"]
    assert cancelled_job["status"] == "cancelled"
    assert cancelled_job["llm_report"] is not None
    assert cancelled_job["llm_report"]["job_status"] == "cancelled"

    # Download report of cancelled run
    download_res = client.get(
        f"{settings.API_V1_STR}/projects/{proj_id}/tag/report/download",
        headers=headers,
    )
    assert download_res.status_code == 200
    assert "attachment; filename=" in download_res.headers.get("content-disposition", "")


def test_dialogue_chain_turn_taking_parity_restoration():
    chain_id = "chain-test-123"
    seg0 = ScriptSegmentModel(id="s0", chapter_id="c1", order_index=0, text="“Did you see him?” Holmes asked.", is_dialogue=True, dialogue_chain_id=chain_id)
    seg1 = ScriptSegmentModel(id="s1", chapter_id="c1", order_index=1, text="“No.”", is_dialogue=True, dialogue_chain_id=chain_id)
    seg2 = ScriptSegmentModel(id="s2", chapter_id="c1", order_index=2, text="“Where did he go?”", is_dialogue=True, dialogue_chain_id=chain_id)
    seg3 = ScriptSegmentModel(id="s3", chapter_id="c1", order_index=3, text="“Toward the gate.”", is_dialogue=True, dialogue_chain_id=chain_id)
    seg4 = ScriptSegmentModel(id="s4", chapter_id="c1", order_index=4, text="“Are you certain?” Holmes pressed.", is_dialogue=True, dialogue_chain_id=chain_id)

    # Simulate an LLM decision error where indices 2 and 3 flipped
    raw_decisions = [
        {"segment_id": "s0", "is_dialogue": True, "speaker": "Holmes", "raw_speaker_tag": "Holmes", "gender": "male", "confidence": 0.95},
        {"segment_id": "s1", "is_dialogue": True, "speaker": "Watson", "raw_speaker_tag": None, "gender": "male", "confidence": 0.8},
        {"segment_id": "s2", "is_dialogue": True, "speaker": "Watson", "raw_speaker_tag": None, "gender": "male", "confidence": 0.6}, # Erroneous duplicate
        {"segment_id": "s3", "is_dialogue": True, "speaker": "Holmes", "raw_speaker_tag": None, "gender": "male", "confidence": 0.6}, # Erroneous flip
        {"segment_id": "s4", "is_dialogue": True, "speaker": "Holmes", "raw_speaker_tag": "Holmes", "gender": "male", "confidence": 0.95},
    ]

    fixed = StageBTaggingService.enforce_dialogue_chain_turn_taking(
        [seg0, seg1, seg2, seg3, seg4],
        raw_decisions,
        known_characters=[
            {"canonical_name": "Holmes", "aliases": ["Sherlock"], "gender": "male"},
            {"canonical_name": "Watson", "aliases": ["John"], "gender": "male"},
        ],
    )

    speakers = [d["speaker"] for d in fixed]
    assert speakers == ["Holmes", "Watson", "Holmes", "Watson", "Holmes"]


def test_dialogue_chain_anchor_back_propagation():
    chain_id = "chain-backprop-456"
    seg0 = ScriptSegmentModel(id="s0", chapter_id="c1", order_index=0, text="“Did you hear that?”", is_dialogue=True, dialogue_chain_id=chain_id)
    seg1 = ScriptSegmentModel(id="s1", chapter_id="c1", order_index=1, text="“Just the wind.”", is_dialogue=True, dialogue_chain_id=chain_id)
    seg2 = ScriptSegmentModel(id="s2", chapter_id="c1", order_index=2, text="“It sounded like footsteps.”", is_dialogue=True, dialogue_chain_id=chain_id)
    seg3 = ScriptSegmentModel(id="s3", chapter_id="c1", order_index=3, text="“Stay quiet.”", is_dialogue=True, dialogue_chain_id=chain_id)
    seg4 = ScriptSegmentModel(id="s4", chapter_id="c1", order_index=4, text="“I see someone,” Watson whispered.", is_dialogue=True, dialogue_chain_id=chain_id)

    # Only segment 4 has an explicit anchor (Watson)
    raw_decisions = [
        {"segment_id": "s0", "is_dialogue": True, "speaker": "General Male", "gender": "male", "confidence": 0.5},
        {"segment_id": "s1", "is_dialogue": True, "speaker": "General Male", "gender": "male", "confidence": 0.5},
        {"segment_id": "s2", "is_dialogue": True, "speaker": "General Male", "gender": "male", "confidence": 0.5},
        {"segment_id": "s3", "is_dialogue": True, "speaker": "General Male", "gender": "male", "confidence": 0.5},
        {"segment_id": "s4", "is_dialogue": True, "speaker": "Watson", "raw_speaker_tag": "Watson", "gender": "male", "confidence": 0.95},
    ]

    prior_decisions = [
        {"segment_id": "p0", "is_dialogue": True, "speaker": "Holmes", "gender": "male"}
    ]

    fixed = StageBTaggingService.enforce_dialogue_chain_turn_taking(
        [seg0, seg1, seg2, seg3, seg4],
        raw_decisions,
        known_characters=[
            {"canonical_name": "Holmes", "aliases": [], "gender": "male"},
            {"canonical_name": "Watson", "aliases": [], "gender": "male"},
        ],
        prior_decisions=prior_decisions,
    )

    speakers = [d["speaker"] for d in fixed]
    # Parity back-propagated from Watson at index 4:
    # 4: Watson, 3: Holmes, 2: Watson, 1: Holmes, 0: Watson
    assert speakers == ["Watson", "Holmes", "Watson", "Holmes", "Watson"]


def test_split_dialogue_turn_consistency():
    turn_id = "split-turn-789"
    seg1 = ScriptSegmentModel(
        id="s1",
        chapter_id="c1",
        order_index=1,
        text="“If you move,”",
        is_dialogue=True,
        continuation_type="starts_phrase",
        parent_turn_id=turn_id,
    )
    seg2 = ScriptSegmentModel(
        id="s2",
        chapter_id="c1",
        order_index=2,
        text="she warned, stepping forward,",
        is_dialogue=False,
        continuation_type="interstitial_beat",
        parent_turn_id=turn_id,
    )
    seg3 = ScriptSegmentModel(
        id="s3",
        chapter_id="c1",
        order_index=3,
        text="“I will strike.”",
        is_dialogue=True,
        continuation_type="completes_phrase",
        parent_turn_id=turn_id,
    )

    raw_decisions = [
        {"segment_id": "s1", "is_dialogue": True, "delivery_type": "dialogue", "speaker": "General Female", "gender": "female"},
        {"segment_id": "s2", "is_dialogue": False, "delivery_type": "narration", "speaker": "Narrator", "gender": "neutral"},
        {"segment_id": "s3", "is_dialogue": True, "delivery_type": "dialogue", "speaker": "Mara", "raw_speaker_tag": "Mara", "gender": "female"},
    ]

    fixed = StageBTaggingService.enforce_dialogue_chain_turn_taking(
        [seg1, seg2, seg3],
        raw_decisions,
    )

    dec_map = {d["segment_id"]: d for d in fixed}
    # Both s1 and s3 share Mara attribution and dialogue delivery type
    assert dec_map["s1"]["speaker"] == "Mara"
    assert dec_map["s1"]["delivery_type"] == "dialogue"
    assert dec_map["s3"]["speaker"] == "Mara"
    assert dec_map["s3"]["delivery_type"] == "dialogue"


def test_canonical_alias_resolution():
    known_chars = [
        {
            "canonical_name": "Jeon Myeong-hoon",
            "aliases": ["Section Chief Jeon", "Elder Jeon", "Senior Brother Jeon"],
            "gender": "male",
        }
    ]

    # Exact alias match
    canon, gnd, raw = StageBTaggingService.resolve_canonical_speaker("Section Chief Jeon", known_chars)
    assert canon == "Jeon Myeong-hoon"
    assert raw == "Section Chief Jeon"
    assert gnd == "male"

    # Exact canonical match
    canon, gnd, raw = StageBTaggingService.resolve_canonical_speaker("Jeon Myeong-hoon", known_chars)
    assert canon == "Jeon Myeong-hoon"
    assert raw is None

    # Title prefix match
    canon, gnd, raw = StageBTaggingService.resolve_canonical_speaker("Director Jeon", known_chars)
    assert canon == "Jeon Myeong-hoon"
    assert raw == "Director Jeon"


def test_delivery_type_heuristic_and_system_prompt():
    seg_sys = ScriptSegmentModel(
        id="sys1",
        chapter_id="c1",
        text="[System: Quest Completed - Reward Granted]",
        is_dialogue=False,
        delivery_type="system_prompt",
    )
    seg_thought = ScriptSegmentModel(
        id="th1",
        chapter_id="c1",
        text="'Is this the true power of regression...?'",
        is_dialogue=False,
    )
    seg_narr = ScriptSegmentModel(
        id="nar1",
        chapter_id="c1",
        text="The sun sank behind the obsidian mountains.",
        is_dialogue=False,
    )
    seg_telepathy = ScriptSegmentModel(
        id="tel1",
        chapter_id="c1",
        text="[I accept your tribute and permit you to stay in my territory.]",
        is_dialogue=False,
    )

    decisions = StageBTaggingService.apply_local_heuristic_attribution(
        [seg_sys, seg_thought, seg_narr, seg_telepathy],
        project_settings={},
    )

    dec_map = {d["segment_id"]: d for d in decisions}

    # System prompt
    assert dec_map["sys1"]["delivery_type"] == "system_prompt"
    assert dec_map["sys1"]["speaker"] == "System / Interface"
    assert dec_map["sys1"]["is_dialogue"] is False

    # Internal thought
    assert dec_map["th1"]["delivery_type"] == "internal_thought"
    assert dec_map["th1"]["speaker"] == "Narrator"
    assert dec_map["th1"]["is_dialogue"] is False
    assert dec_map["th1"]["is_internal_thought"] is True

    # Narration
    assert dec_map["nar1"]["delivery_type"] == "narration"
    assert dec_map["nar1"]["speaker"] == "Narrator"
    assert dec_map["nar1"]["is_dialogue"] is False

    # Telepathy: treated as standard spoken dialogue
    assert dec_map["tel1"]["delivery_type"] == "dialogue"
    assert dec_map["tel1"]["is_dialogue"] is True


@pytest.mark.asyncio
async def test_alias_sync_and_character_model_accumulation(client: TestClient):
    headers = get_auth_headers(client)

    proj_res = client.post(
        f"{settings.API_V1_STR}/projects",
        headers=headers,
        json={"title": "Alias Sync Pilot", "author": "Kim"},
    )
    assert proj_res.status_code == 201
    proj_id = proj_res.json()["data"]["id"]

    factory = get_session_factory()
    async with factory() as db:
        canonical_char = CharacterModel(
            project_id=proj_id,
            name="Jeon Myeong-hoon",
            slug="jeon-myeong-hoon",
            gender="male",
            aliases=["Section Chief Jeon"],
        )
        db.add(canonical_char)

        chapter = ChapterModel(
            project_id=proj_id,
            chapter_number=1,
            title="Chapter 1",
            order_index=1,
            batch_number=1,
            word_count=100,
        )
        db.add(chapter)
        await db.flush()

        seg = ScriptSegmentModel(
            chapter_id=chapter.id,
            order_index=1,
            text="“Did you prepare the documents?” Section Chief Jeon asked.",
            is_dialogue=True,
        )
        db.add(seg)
        await db.commit()

    enqueue_res = client.post(f"{settings.API_V1_STR}/projects/{proj_id}/tag", headers=headers)
    assert enqueue_res.status_code == 202

    for _ in range(25):
        await asyncio.sleep(0.2)
        status_res = client.get(f"{settings.API_V1_STR}/projects/{proj_id}/tag/status", headers=headers)
        if status_res.json()["data"]["status"] == "completed":
            break

    chars_res = client.get(f"{settings.API_V1_STR}/projects/{proj_id}/characters", headers=headers)
    assert chars_res.status_code == 200
    char_list = chars_res.json()["data"]["characters"]
    jeon = next((c for c in char_list if c["name"] == "Jeon Myeong-hoon"), None)
    assert jeon is not None
    assert "Section Chief Jeon" in jeon["aliases"]
