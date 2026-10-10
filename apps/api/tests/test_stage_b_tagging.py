import asyncio
import json

import httpx
import pytest
from app.core.config import settings
from app.db.session import get_session_factory
from app.models.chapter import ChapterModel, ScriptSegmentModel
from app.models.character import CharacterModel
from app.services.character import CharacterService
from app.services.tagger import (
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


def test_dialogue_chain_three_speaker_group_preservation():
    """Verify Issue #1: 3+ speaker group dialogues are preserved and not collapsed into a binary alternating tennis match."""
    chain_id = "chain-group-789"
    seg0 = ScriptSegmentModel(id="s0", chapter_id="c1", order_index=0, text="“Did you find the map?” Holmes asked.", is_dialogue=True, dialogue_chain_id=chain_id)
    seg1 = ScriptSegmentModel(id="s1", chapter_id="c1", order_index=1, text="“Nothing on the desk.”", is_dialogue=True, dialogue_chain_id=chain_id)
    seg2 = ScriptSegmentModel(id="s2", chapter_id="c1", order_index=2, text="“The safe is empty too!” Lestrade announced.", is_dialogue=True, dialogue_chain_id=chain_id)
    seg3 = ScriptSegmentModel(id="s3", chapter_id="c1", order_index=3, text="“Then he took it with him.”", is_dialogue=True, dialogue_chain_id=chain_id)

    raw_decisions = [
        {"segment_id": "s0", "is_dialogue": True, "speaker": "Holmes", "raw_speaker_tag": "Holmes", "gender": "male", "confidence": 0.95},
        {"segment_id": "s1", "is_dialogue": True, "speaker": "Watson", "raw_speaker_tag": None, "gender": "male", "confidence": 0.8},
        {"segment_id": "s2", "is_dialogue": True, "speaker": "Lestrade", "raw_speaker_tag": "Lestrade", "gender": "male", "confidence": 0.95},
        {"segment_id": "s3", "is_dialogue": True, "speaker": "Holmes", "raw_speaker_tag": None, "gender": "male", "confidence": 0.75},
    ]

    fixed = StageBTaggingService.enforce_dialogue_chain_turn_taking(
        [seg0, seg1, seg2, seg3],
        raw_decisions,
        known_characters=[
            {"canonical_name": "Holmes", "aliases": [], "gender": "male"},
            {"canonical_name": "Watson", "aliases": [], "gender": "male"},
            {"canonical_name": "Lestrade", "aliases": [], "gender": "male"},
        ],
    )

    speakers = [d["speaker"] for d in fixed]
    # Lestrade must NOT be overwritten by a binary A/B alternating cycle!
    assert speakers == ["Holmes", "Watson", "Lestrade", "Holmes"]


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


def test_find_textual_speaker_tag_kills_that_and_discourse_markers():
    # 1. Pure spoken dialogue with discourse markers must return None
    assert StageBTaggingService.find_textual_speaker_tag(
        '"That said, I don\'t believe a situation like that will happen."'
    ) is None
    assert StageBTaggingService.find_textual_speaker_tag(
        '“Having said that, we should proceed with caution.”'
    ) is None
    assert StageBTaggingService.find_textual_speaker_tag('"Who said that?"') is None
    assert StageBTaggingService.find_textual_speaker_tag('"Mother said no."') is None
    assert StageBTaggingService.find_textual_speaker_tag('"Young master?"') is None

    # 2. Narration with discourse markers must NOT extract "That" or "Having"
    assert StageBTaggingService.find_textual_speaker_tag("That said, he walked toward the door.") is None
    assert StageBTaggingService.find_textual_speaker_tag("Having said that, the group paused.") is None
    assert StageBTaggingService.find_textual_speaker_tag("So said the old legend.") is None

    # 3. Legitimate speech tags with surrounding dialogue must extract correctly
    assert StageBTaggingService.find_textual_speaker_tag('"That said," Herman muttered.') == "Herman"
    assert StageBTaggingService.find_textual_speaker_tag('Herman said, "That said, we should go."') == "Herman"
    assert StageBTaggingService.find_textual_speaker_tag('"Young master?" Herman asked.') == "Herman"
    assert StageBTaggingService.find_textual_speaker_tag('Watson whispered quietly.') == "Watson"
    assert StageBTaggingService.find_textual_speaker_tag('said Mary Jane.') == "Mary Jane"
    assert StageBTaggingService.find_textual_speaker_tag('"Wait!" shouted Holmes.') == "Holmes"


def test_resolve_canonical_speaker_kills_that_and_vocatives():
    # Discourse markers and stopwords resolve to General Male/Female fallback instead of creating a character
    name, gender, raw = StageBTaggingService.resolve_canonical_speaker("That")
    assert name == "General Male"
    assert raw == "That"

    name, gender, raw = StageBTaggingService.resolve_canonical_speaker("that said")
    assert name == "General Male"
    assert raw == "that said"

    name, gender, raw = StageBTaggingService.resolve_canonical_speaker("Having said that")
    assert name == "General Male"
    assert raw == "Having said that"

    # Bare vocatives / titles of address resolve to General Male/Female fallback
    name, gender, raw = StageBTaggingService.resolve_canonical_speaker("Young master")
    assert name == "General Male"
    assert raw == "Young master"

    name, gender, raw = StageBTaggingService.resolve_canonical_speaker("My Lord")
    assert name == "General Male"
    assert raw == "My Lord"

    name, gender, raw = StageBTaggingService.resolve_canonical_speaker("Sir")
    assert name == "General Male"
    assert raw == "Sir"

    # BUT if a character explicitly has the alias in known_characters, it resolves to that character!
    known = [
        {"canonical_name": "Julien D. Evenus", "aliases": ["young master"], "gender": "male"}
    ]
    name, gender, raw = StageBTaggingService.resolve_canonical_speaker("Young master", known)
    assert name == "Julien D. Evenus"
    assert raw == "Young master"

    # Legitimate characters are never rejected
    name, gender, raw = StageBTaggingService.resolve_canonical_speaker("Julien D. Evenus")
    assert name == "Julien D. Evenus"
    assert raw is None

    name, gender, raw = StageBTaggingService.resolve_canonical_speaker("Delilah V. Rosemberg")
    assert name == "Delilah V. Rosemberg"
    assert raw is None

    name, gender, raw = StageBTaggingService.resolve_canonical_speaker("Doctor Watson")
    assert name == "Doctor Watson"
    assert raw is None


def test_dialogue_chain_turn_taking_cannot_anchor_on_that_or_vocative():
    # Simulates the exact scene from Chapter 1 of AotTC:
    # Seg 20: "It's important that you pass..."
    # Seg 21: "..."
    # Seg 26: "That said, I don't believe a situation like that will happen..."
    seg20 = ScriptSegmentModel(
        id="s20",
        chapter_id="c1",
        order_index=20,
        text='"It\'s important that you pass the examination. I can\'t stress that enough. For my sake as well."',
        is_dialogue=True,
        dialogue_chain_id="chain-examination",
    )
    seg21 = ScriptSegmentModel(
        id="s21",
        chapter_id="c1",
        order_index=21,
        text='"..."',
        is_dialogue=True,
        dialogue_chain_id="chain-examination",
    )
    seg26 = ScriptSegmentModel(
        id="s26",
        chapter_id="c1",
        order_index=26,
        text='"That said, I don\'t believe a situation like that will happen. You\'re more than capable of passing the examination."',
        is_dialogue=True,
        dialogue_chain_id="chain-examination",
    )

    decisions = [
        {"segment_id": "s20", "speaker": "Herman Chambers", "gender": "male", "confidence": 0.9},
        {"segment_id": "s21", "speaker": "Julien D. Evenus", "gender": "male", "confidence": 0.9},
        {"segment_id": "s26", "speaker": "Herman Chambers", "gender": "male", "confidence": 0.9},
    ]

    # Execute dialogue turn taking enforcement
    StageBTaggingService.enforce_dialogue_chain_turn_taking(
        segments=[seg20, seg21, seg26],
        decisions=decisions,
        known_characters=[
            {"canonical_name": "Herman Chambers", "aliases": [], "gender": "male"},
            {"canonical_name": "Julien D. Evenus", "aliases": [], "gender": "male"},
        ],
    )

    dec_map = {d["segment_id"]: d for d in decisions}
    # Neither s20, s21, nor s26 should EVER have speaker "That"!
    assert dec_map["s20"]["speaker"] != "That"
    assert dec_map["s21"]["speaker"] != "That"
    assert dec_map["s26"]["speaker"] != "That"
    assert dec_map["s20"]["speaker"] == "Herman Chambers"
    assert dec_map["s21"]["speaker"] == "Julien D. Evenus"
    assert dec_map["s26"]["speaker"] == "Herman Chambers"


@pytest.mark.asyncio
async def test_character_sync_filters_invalid_names_and_prevents_system_duplicate(client: TestClient):
    headers = get_auth_headers(client)
    proj_res = client.post(
        f"{settings.API_V1_STR}/projects",
        headers=headers,
        json={"title": "Filter Test", "author": "Tester"},
    )
    assert proj_res.status_code == 201
    proj_id = proj_res.json()["data"]["id"]

    factory = get_session_factory()
    async with factory() as db:
        chap = ChapterModel(id="chap-filter-test", project_id=proj_id, chapter_number=1, title="Ch1", word_count=50)
        db.add(chap)
        await db.flush()

        # Add segments with valid character, invalid names, and system prompts
        s1 = ScriptSegmentModel(
            id="seg-val",
            chapter_id=chap.id,
            order_index=1,
            text='"Hello," Herman said.',
            is_dialogue=True,
            delivery_type="dialogue",
            speaker="Herman Chambers",
            speaker_gender="male",
        )
        s2 = ScriptSegmentModel(
            id="seg-that",
            chapter_id=chap.id,
            order_index=2,
            text='"That said," someone spoke.',
            is_dialogue=True,
            delivery_type="dialogue",
            speaker="That",
            speaker_gender="male",
        )
        s3 = ScriptSegmentModel(
            id="seg-ym",
            chapter_id=chap.id,
            order_index=3,
            text='"Young master?"',
            is_dialogue=True,
            delivery_type="dialogue",
            speaker="Young master",
            speaker_gender="male",
        )
        s4 = ScriptSegmentModel(
            id="seg-sys",
            chapter_id=chap.id,
            order_index=4,
            text='[System: Level Up]',
            is_dialogue=False,
            delivery_type="system_prompt",
            speaker="System / Interface",
            speaker_gender="neutral",
        )
        db.add_all([s1, s2, s3, s4])
        await db.commit()

        # Run character synchronization
        synced = await CharacterService.sync_characters_from_segments(proj_id, db)
        synced_names = [c.name for c in synced]

        # "Herman Chambers" and "System / Interface" should be synced
        assert "Herman Chambers" in synced_names
        assert "System / Interface" in synced_names

        # "That" and "Young master" must NEVER be created as character models!
        assert "That" not in synced_names
        assert "Young master" not in synced_names

        # "System / Interface" must NOT be duplicated in synced list!
        sys_entries = [c for c in synced if c.name == "System / Interface"]
        assert len(sys_entries) == 1


def test_gender_integrity_preserves_female_inference():
    # Test that resolve_canonical_speaker does not force female characters to male
    known_chars = [
        {"canonical_name": "Julien D. Evenus", "aliases": ["julien"], "gender": "male"},
        {"canonical_name": "Cathrine Riley Graham", "aliases": ["cathrine"], "gender": "female"},
    ]

    # 1. Known female character maintains female
    c_name, c_gnd, _ = StageBTaggingService.resolve_canonical_speaker("Cathrine", known_chars)
    assert c_name == "Cathrine Riley Graham"
    assert c_gnd == "female"

    # 2. Unknown novel character with female first name inferred via infer_name_gender
    c_name2, c_gnd2, _ = StageBTaggingService.resolve_canonical_speaker("Delilah V. Rosemberg", known_chars)
    assert c_name2 == "Delilah V. Rosemberg"
    assert c_gnd2 == "female"


@pytest.mark.asyncio
async def test_character_sync_female_gender_upgrade(client: TestClient):
    headers = get_auth_headers(client)
    proj_res = client.post(
        f"{settings.API_V1_STR}/projects",
        headers=headers,
        json={"title": "Gender Sync Test", "author": "Tester"},
    )
    assert proj_res.status_code == 201
    proj_id = proj_res.json()["data"]["id"]

    factory = get_session_factory()
    async with factory() as db:
        chap = ChapterModel(id="chap-gender-test", project_id=proj_id, chapter_number=1, title="Ch1", word_count=50)
        db.add(chap)
        await db.flush()

        # Add segment with a female character whose name isn't in common dictionaries
        s1 = ScriptSegmentModel(
            id="seg-fem-1",
            chapter_id=chap.id,
            order_index=1,
            text='"We need to be careful," Seraphina said.',
            is_dialogue=True,
            delivery_type="dialogue",
            speaker="Seraphina Cross",
            speaker_gender="female",
        )
        s2 = ScriptSegmentModel(
            id="seg-fem-2",
            chapter_id=chap.id,
            order_index=2,
            text='"Indeed," Seraphina whispered.',
            is_dialogue=True,
            delivery_type="dialogue",
            speaker="Seraphina Cross",
            speaker_gender="female",
        )
        db.add_all([s1, s2])
        await db.commit()

        synced = await CharacterService.sync_characters_from_segments(proj_id, db)
        seraphina = next((c for c in synced if c.name == "Seraphina Cross"), None)
        assert seraphina is not None
        assert seraphina.gender == "female"


@pytest.mark.asyncio
async def test_tag_window_bypasses_llm_on_pure_narration_window(monkeypatch):
    monkeypatch.setattr(settings, "DEEPSEEK_API_KEY", "mock-key")
    n1 = ScriptSegmentModel(id="n1", chapter_id="c1", order_index=1, text="The leaves rustled in the cool wind.", is_dialogue=False, delivery_type="narration")
    n2 = ScriptSegmentModel(id="n2", chapter_id="c1", order_index=2, text="A faint shadow slipped past the garden wall.", is_dialogue=False, delivery_type="narration")
    sys1 = ScriptSegmentModel(id="s1", chapter_id="c1", order_index=3, text="[System: Warning - Intruder Detected]", is_dialogue=False, delivery_type="system_prompt")

    decisions, usage = await StageBTaggingService.tag_window_with_deepseek(
        window_segments=[n1, n2, sys1],
        prior_decisions=[],
        project_settings={},
    )

    # Must return full decisions without any API calls (usage is empty dict)
    assert usage == {}
    assert len(decisions) == 3
    dec_map = {d["segment_id"]: d for d in decisions}
    assert dec_map["n1"]["speaker"] == "Narrator"
    assert dec_map["n1"]["delivery_type"] == "narration"
    assert dec_map["n2"]["speaker"] == "Narrator"
    assert dec_map["s1"]["speaker"] == "System / Interface"
    assert dec_map["s1"]["delivery_type"] == "system_prompt"


@pytest.mark.asyncio
async def test_tag_window_compact_dialogue_schema_integration(monkeypatch):
    monkeypatch.setattr(settings, "DEEPSEEK_API_KEY", "mock-key")

    n1 = ScriptSegmentModel(id="n1", chapter_id="c1", order_index=1, text="Herman stepped into the study.", is_dialogue=False, delivery_type="narration")
    d1 = ScriptSegmentModel(id="d1", chapter_id="c1", order_index=2, text="“I have returned,” he said.", is_dialogue=True, delivery_type="dialogue")
    n2 = ScriptSegmentModel(id="n2", chapter_id="c1", order_index=3, text="Silence lingered.", is_dialogue=False, delivery_type="narration")

    sent_body = {}

    async def mock_post(self, url, json=None, headers=None, **kwargs):
        nonlocal sent_body
        sent_body = json

        class MockResponse:
            status_code = 200

            def raise_for_status(self):
                pass

            def json(self):
                return {
                    "choices": [
                        {
                            "message": {
                                "content": '{"dialogue_attributions": [{"segment_id": "d1", "speaker": "Herman Chambers", "gender": "male", "paralinguistic_tag": "[sigh]"}]}'
                            },
                            "finish_reason": "stop",
                        }
                    ],
                    "usage": {
                        "prompt_tokens": 120,
                        "completion_tokens": 18,
                        "total_tokens": 138,
                    },
                }

        return MockResponse()

    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post)

    decisions, usage = await StageBTaggingService.tag_window_with_deepseek(
        window_segments=[n1, d1, n2],
        prior_decisions=[],
        project_settings={"paralinguistic_tags_enabled": True},
        known_characters=[{"canonical_name": "Herman Chambers", "aliases": [], "gender": "male"}],
    )

    # 1. Verify sent body structure
    user_payload = json.loads(sent_body["messages"][1]["content"])
    assert "scene_transcript" in user_payload
    assert "dialogue_targets" in user_payload
    assert len(user_payload["dialogue_targets"]) == 1
    assert user_payload["dialogue_targets"][0]["segment_id"] == "d1"
    assert len(user_payload["scene_transcript"]) == 3

    # 2. Verify returned decisions cover all segments (narration AND dialogue)
    assert len(decisions) == 3
    dec_map = {d["segment_id"]: d for d in decisions}
    assert dec_map["n1"]["speaker"] == "Narrator"
    assert dec_map["n1"]["delivery_type"] == "narration"
    assert dec_map["d1"]["speaker"] == "Herman Chambers"
    assert dec_map["d1"]["gender"] == "male"
    assert dec_map["d1"]["paralinguistic_tag"] == "[sigh]"
    assert dec_map["n2"]["speaker"] == "Narrator"

    # 3. Verify usage captured
    assert usage["completion_tokens"] == 18


def test_detect_narrative_pov_first_person():
    segs = [
        ScriptSegmentModel(id="s1", chapter_id="c1", order_index=1, text="I woke up to the sound of pounding rain.", is_dialogue=False),
        ScriptSegmentModel(id="s2", chapter_id="c1", order_index=2, text="My head throbbed as I tried to remember yesterday.", is_dialogue=False),
        ScriptSegmentModel(id="s3", chapter_id="c1", order_index=3, text="“Are you awake?” Herman asked.", is_dialogue=True),
        ScriptSegmentModel(id="s4", chapter_id="c1", order_index=4, text="I looked at him and nodded.", is_dialogue=False),
        ScriptSegmentModel(id="s5", chapter_id="c1", order_index=5, text="My coat was soaking wet, and my fingers felt numb.", is_dialogue=False),
        ScriptSegmentModel(id="s6", chapter_id="c1", order_index=6, text="I pushed myself up from the cold stone floor.", is_dialogue=False),
        ScriptSegmentModel(id="s7", chapter_id="c1", order_index=7, text="Everything around me was quiet.", is_dialogue=False),
        ScriptSegmentModel(id="s8", chapter_id="c1", order_index=8, text="I took a deep breath.", is_dialogue=False),
    ]

    pov = StageBTaggingService.detect_narrative_pov(
        segments=segs,
        project_settings={},
        known_characters=[{"canonical_name": "Julien D. Evenus", "role": "protagonist"}],
    )
    assert pov["mode"] == "first_person"
    assert pov["protagonist"] == "Julien D. Evenus"


def test_detect_narrative_pov_explicit_settings():
    pov = StageBTaggingService.detect_narrative_pov(
        segments=[],
        project_settings={"pov_mode": "first_person", "pov_protagonist": "Julien D. Evenus"},
    )
    assert pov["mode"] == "first_person"
    assert pov["protagonist"] == "Julien D. Evenus"


@pytest.mark.asyncio
async def test_tag_window_pov_injection_and_prompt_prefix(monkeypatch):
    monkeypatch.setattr(settings, "DEEPSEEK_API_KEY", "mock-key")

    n1 = ScriptSegmentModel(id="n1", chapter_id="c1", order_index=1, text="I looked down at the scroll.", is_dialogue=False, delivery_type="narration")
    d1 = ScriptSegmentModel(id="d1", chapter_id="c1", order_index=2, text="“We will proceed,” I said.", is_dialogue=True, delivery_type="dialogue")

    sent_body = {}

    async def mock_post(self, url, json=None, headers=None, **kwargs):
        nonlocal sent_body
        sent_body = json

        class MockResponse:
            status_code = 200

            def raise_for_status(self):
                pass

            def json(self):
                return {
                    "choices": [
                        {
                            "message": {
                                "content": '{"dialogue_attributions": [{"segment_id": "d1", "speaker": "Julien D. Evenus", "gender": "male"}]}'
                            },
                            "finish_reason": "stop",
                        }
                    ],
                    "usage": {
                        "prompt_tokens": 150,
                        "completion_tokens": 15,
                        "total_tokens": 165,
                    },
                }

        return MockResponse()

    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post)

    decisions, usage = await StageBTaggingService.tag_window_with_deepseek(
        window_segments=[n1, d1],
        prior_decisions=[],
        project_settings={"pov_mode": "first_person", "pov_protagonist": "Julien D. Evenus"},
        known_characters=[{"canonical_name": "Julien D. Evenus", "aliases": ["julien"], "gender": "male"}],
    )

    user_payload = json.loads(sent_body["messages"][1]["content"])
    assert "project_context" in user_payload
    assert user_payload["project_context"]["narrative_pov"]["mode"] == "first_person"
    assert user_payload["project_context"]["narrative_pov"]["protagonist"] == "Julien D. Evenus"

    dec_map = {d["segment_id"]: d for d in decisions}
    assert dec_map["d1"]["speaker"] == "Julien D. Evenus"


@pytest.mark.asyncio
async def test_stage_b_standalone_thoughts_and_bracketed_skills_bypassed_deterministically(monkeypatch):
    monkeypatch.setattr(settings, "DEEPSEEK_API_KEY", "mock-deepseek-key")

    th1 = ScriptSegmentModel(
        id="th1",
        chapter_id="c1",
        order_index=1,
        text="‘Since this is happening, I have no choice but to sneak up towards the Argento.’",
        is_dialogue=True,
    )
    sk1 = ScriptSegmentModel(
        id="sk1",
        chapter_id="c1",
        order_index=2,
        text="[Flash]",
        is_dialogue=True,
    )
    d1 = ScriptSegmentModel(
        id="d1",
        chapter_id="c1",
        order_index=3,
        text="“What wand are you going to choose?”",
        is_dialogue=True,
    )
    th2 = ScriptSegmentModel(
        id="th2",
        chapter_id="c1",
        order_index=4,
        text="‘Should I give her a hint?’",
        is_dialogue=True,
    )
    b_diag = ScriptSegmentModel(
        id="b1",
        chapter_id="c1",
        order_index=5,
        text="'I will proceed first,' said Harry.",
        is_dialogue=True,
    )

    sent_body = {}

    async def mock_post(self, url, **kwargs):
        nonlocal sent_body
        sent_body = kwargs.get("json")

        class MockResponse:
            status_code = 200

            def raise_for_status(self):
                pass

            def json(self):
                return {
                    "choices": [
                        {
                            "message": {
                                "content": json.dumps({
                                    "dialogue_attributions": [
                                        {"segment_id": "d1", "speaker": "Baek Yu-Seol", "gender": "male"},
                                        {"segment_id": "b1", "speaker": "Harry", "gender": "male"},
                                    ]
                                })
                            },
                            "finish_reason": "stop",
                        }
                    ],
                    "usage": {
                        "prompt_tokens": 120,
                        "completion_tokens": 25,
                        "total_tokens": 145,
                    },
                }

        return MockResponse()

    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post)

    decisions, usage = await StageBTaggingService.tag_window_with_deepseek(
        window_segments=[th1, sk1, d1, th2, b_diag],
        prior_decisions=[],
        project_settings={},
        known_characters=[
            {"canonical_name": "Baek Yu-Seol", "gender": "male"},
            {"canonical_name": "Harry", "gender": "male"},
        ],
    )

    user_payload = json.loads(sent_body["messages"][1]["content"])
    dialogue_target_ids = [t["segment_id"] for t in user_payload["dialogue_targets"]]

    # Verify that thoughts and skills are NEVER sent to LLM as dialogue targets
    assert "th1" not in dialogue_target_ids
    assert "sk1" not in dialogue_target_ids
    assert "th2" not in dialogue_target_ids
    assert dialogue_target_ids == ["d1", "b1"]

    dec_map = {d["segment_id"]: d for d in decisions}

    # th1: Silent single-quoted internal thought -> Narrator
    assert dec_map["th1"]["is_dialogue"] is False
    assert dec_map["th1"]["is_internal_thought"] is True
    assert dec_map["th1"]["delivery_type"] == "internal_thought"
    assert dec_map["th1"]["speaker"] == "Narrator"

    # sk1: Bracketed skill -> System / Interface
    assert dec_map["sk1"]["is_dialogue"] is False
    assert dec_map["sk1"]["delivery_type"] == "system_prompt"
    assert dec_map["sk1"]["speaker"] == "System / Interface"

    # th2: Question thought -> Narrator
    assert dec_map["th2"]["is_dialogue"] is False
    assert dec_map["th2"]["is_internal_thought"] is True
    assert dec_map["th2"]["delivery_type"] == "internal_thought"
    assert dec_map["th2"]["speaker"] == "Narrator"

    # d1: Spoken dialogue -> Baek Yu-Seol
    assert dec_map["d1"]["is_dialogue"] is True
    assert dec_map["d1"]["delivery_type"] == "dialogue"
    assert dec_map["d1"]["speaker"] == "Baek Yu-Seol"

    # b1: British spoken dialogue with 'said Harry' -> Harry
    assert dec_map["b1"]["is_dialogue"] is True
    assert dec_map["b1"]["delivery_type"] == "dialogue"
    assert dec_map["b1"]["speaker"] == "Harry"




