import json
import uuid

import httpx
import pytest
from app.core.config import settings
from app.core.security import encrypt_secret
from app.db.session import get_session_factory, init_db
from app.models.chapter import ChapterModel, ScriptSegmentModel
from app.models.character import CharacterModel
from app.models.kaggle_account import KaggleAccountModel
from app.models.project import ProjectModel
from app.models.pronunciation import PronunciationRuleModel
from app.models.sfx import SFXModel
from app.models.user import UserModel
from app.models.voice import VoiceModel
from app.schemas.voice_design import VoiceDesignRequestSchema
from app.services.chapter_packaging import ChapterPackagingService
from app.services.dossier import CharacterDossierService
from app.services.llm_client import StructuredLLMClient
from app.services.pronunciation_extractor import PronunciationExtractorService
from app.services.sfx_cueing import AutoSfxCueingService
from app.services.voice_design import VoiceDesignService, build_voice_design_kaggle_script
from pydantic import BaseModel, Field
from sqlalchemy import select


class _DemoSchema(BaseModel):
    name: str
    score: int = Field(ge=1, le=10)


@pytest.mark.asyncio
async def test_structured_llm_client_strips_fences_and_retries_on_validation_error(monkeypatch):
    monkeypatch.setattr(settings, "DEEPSEEK_API_KEY", "mock-key")
    monkeypatch.setattr(
        settings,
        "DEEPSEEK_BASE_URL",
        "https://api-ap-southeast-1.modelarts-maas.com/v2/chat/completions",
    )

    calls = 0

    async def mock_post(self, url, json=None, headers=None, **kwargs):
        nonlocal calls
        calls += 1
        assert url == "https://api-ap-southeast-1.modelarts-maas.com/v2/chat/completions"

        class MockResp:
            status_code = 200

            def raise_for_status(self):
                pass

            def json(self_inner):
                if calls == 1:
                    # Invalid score (>10) wrapped in markdown fences -> must trigger validation retry
                    return {
                        "choices": [{"message": {"content": '```json\n{"name": "Deculein", "score": 99}\n```'}, "finish_reason": "stop"}],
                        "usage": {"prompt_tokens": 50, "completion_tokens": 20, "prompt_tokens_details": {"cached_tokens": 10}},
                    }
                return {
                    "choices": [{"message": {"content": '{"name": "Deculein", "score": 9}'}, "finish_reason": "stop"}],
                    "usage": {"prompt_tokens": 80, "completion_tokens": 15, "prompt_tokens_details": {"cached_tokens": 40}},
                }

        return MockResp()

    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post)

    result, usage = await StructuredLLMClient.complete_json(
        system_prompt="Return demo JSON.",
        user_payload={"x": 1},
        response_model=_DemoSchema,
    )
    assert calls == 2
    assert result.name == "Deculein"
    assert result.score == 9
    assert usage["cached_tokens"] == 50


@pytest.mark.asyncio
async def test_character_dossier_and_voice_design_flow_with_auto_assign(monkeypatch):
    await init_db()
    monkeypatch.setattr(settings, "DEEPSEEK_API_KEY", "mock-key")
    factory = get_session_factory()

    async with factory() as db:
        user = UserModel(
            id=str(uuid.uuid4()),
            email=f"vd_{uuid.uuid4().hex[:8]}@example.com",
            name="Test Director",
            handle=f"vd_{uuid.uuid4().hex[:8]}",
            password_hash="x",
        )
        db.add(user)
        proj = ProjectModel(
            id=str(uuid.uuid4()),
            user_id=user.id,
            title="The Villain Wants to Live",
            author="Jee Gab Song",
        )
        db.add(proj)
        acc = KaggleAccountModel(
            id=str(uuid.uuid4()),
            user_id=user.id,
            username="testkaggle",
            encrypted_key=encrypt_secret("KGAT_testdummy_voice_design"),
            is_active=True,
            status="available",
        )
        db.add(acc)
        ch = ChapterModel(
            id=str(uuid.uuid4()),
            project_id=proj.id,
            chapter_number=1,
            title="Chapter 1",
            order_index=1,
        )
        db.add(ch)
        char = CharacterModel(
            id=str(uuid.uuid4()),
            project_id=proj.id,
            name="Deculein",
            slug="deculein",
            gender="male",
            dialogue_count=5,
        )
        db.add(char)
        db.add_all([
            ScriptSegmentModel(id=str(uuid.uuid4()), chapter_id=ch.id, order_index=1, text="Deculein spoke with icy composure.", is_dialogue=False),
            ScriptSegmentModel(id=str(uuid.uuid4()), chapter_id=ch.id, order_index=2, text="“Prepare the carriage at once.”", is_dialogue=True, speaker="Deculein", character_id=char.id),
        ])
        await db.commit()

        # 1. Mock LLM dossier generation
        async def mock_post(self, url, json=None, headers=None, **kwargs):
            class MockResp:
                status_code = 200

                def raise_for_status(self):
                    pass

                def json(self_inner):
                    return {
                        "choices": [{
                            "message": {
                                "content": json_lib.dumps({
                                    "age_group": "late 20s",
                                    "personality_traits": ["cold", "aristocratic", "calculating"],
                                    "vocal_traits": {
                                        "pitch": "deep baritone",
                                        "timbre": "smooth and crisp",
                                        "cadence": "measured and authoritative",
                                        "accent_or_style": "formal noble",
                                    },
                                    "relationships": [{"character": "Yeriel", "relation": "rival"}],
                                    "summary": "A composed nobleman masking a transmigrated strategist.",
                                    "voice_design_prompt": "A cold, composed aristocratic man in his late twenties with a deep, smooth baritone and measured cadence.",
                                    "sample_lines": [
                                        "Prepare the carriage. I have no intention of keeping the Imperial court waiting.",
                                        "Everything in this estate operates by precision, not sentiment.",
                                    ],
                                })
                            },
                            "finish_reason": "stop",
                        }],
                        "usage": {"prompt_tokens": 120, "completion_tokens": 90},
                    }

            return MockResp()

        json_lib = json
        monkeypatch.setattr(httpx.AsyncClient, "post", mock_post)

        dossier_res = await CharacterDossierService.build_project_dossiers(
            project_id=proj.id,
            db=db,
            character_ids=[char.id],
        )
        assert dossier_res.generated_count == 1
        await db.refresh(char)
        assert char.dossier is not None
        assert "aristocratic" in char.dossier["voice_design_prompt"]

        # 2. Verify Kaggle script includes Qwen3-TTS-12Hz-1.7B-VoiceDesign & dataset cache
        script = build_voice_design_kaggle_script(
            job_id="job-123",
            project_id=proj.id,
            r2_endpoint="https://r2.example.com",
            r2_bucket="novelova",
            r2_access_key="ak",
            r2_secret_key="sk",
            cache_to_dataset=True,
        )
        assert "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign" in script
        assert "noveler-voice-design" in script

        # 3. Launch VoiceDesign job (auto_assign defaults to True!)
        req = VoiceDesignRequestSchema(project_id=proj.id, character_ids=[char.id])
        assert req.auto_assign is True
        job = await VoiceDesignService.start_voice_design_job(payload=req, user_id=user.id, db=db)
        assert job.status == "running"
        assert job.total_characters == 1

        # 4. Simulate R2 receipt ingestion -> VoiceModel created with name + description & auto-assigned
        receipt = {
            "job_id": job.id,
            "status": "completed",
            "current_step": "VoiceDesign batch complete",
            "results": [
                {
                    "character_id": char.id,
                    "character_name": "Deculein",
                    "voice_name": "Deculein",
                    "gender": "male",
                    "status": "completed",
                    "audio_storage_key": f"voices/designed/{proj.id}/{char.id}.wav",
                    "duration_seconds": 10.4,
                    "voice_design_prompt": char.dossier["voice_design_prompt"],
                    "reference_text": "Prepare the carriage.",
                }
            ],
        }
        updated_job = await VoiceDesignService.ingest_receipt_into_voices(job.id, receipt, db)
        assert updated_job.status == "completed"
        assert updated_job.progress_percentage == 100
        assert updated_job.results[0]["auto_assigned"] is True

        voice = await db.get(VoiceModel, updated_job.results[0]["voice_id"])
        assert voice is not None
        assert voice.name == "Deculein"
        assert voice.description == char.dossier["voice_design_prompt"]

        await db.refresh(char)
        assert char.assigned_voice_id == voice.id
        assert char.assigned_voice_name == "Deculein"


@pytest.mark.asyncio
async def test_auto_sfx_pronunciation_and_chapter_packaging_services(monkeypatch):
    await init_db()
    monkeypatch.setattr(settings, "DEEPSEEK_API_KEY", "mock-key")
    factory = get_session_factory()

    async with factory() as db:
        user = UserModel(
            id=str(uuid.uuid4()),
            email=f"intel_{uuid.uuid4().hex[:8]}@example.com",
            name="Test Producer",
            handle=f"intel_{uuid.uuid4().hex[:8]}",
            password_hash="x",
        )
        db.add(user)
        proj = ProjectModel(id=str(uuid.uuid4()), user_id=user.id, title="Arcane Estate")
        db.add(proj)
        ch = ChapterModel(id=str(uuid.uuid4()), project_id=proj.id, chapter_number=1, title="Arrival", order_index=1)
        db.add(ch)
        s1 = ScriptSegmentModel(id=str(uuid.uuid4()), chapter_id=ch.id, order_index=1, text="Rain hammered against the windows of Baek Yu-Seol's tower.", is_dialogue=False)
        s2 = ScriptSegmentModel(id=str(uuid.uuid4()), chapter_id=ch.id, order_index=2, text="The heavy oak door slammed shut behind him.", is_dialogue=False)
        db.add_all([s1, s2])

        foley = SFXModel(id=str(uuid.uuid4()), user_id=user.id, project_id=proj.id, name="Door Slam", category="foley", is_global=False, audio_storage_key="sfx/door.wav", triggers=["slammed"])
        atmo = SFXModel(id=str(uuid.uuid4()), user_id=user.id, project_id=proj.id, name="Heavy Rain", category="atmosphere", is_global=False, audio_storage_key="sfx/rain.wav", default_volume=0.25)
        db.add_all([foley, atmo])
        await db.commit()

        # 1. Auto SFX Cueing (rejects hallucinated sfx_id, previews on dry_run, applies on dry_run=False)
        async def mock_sfx_post(self, url, json=None, headers=None, **kwargs):
            class MockResp:
                status_code = 200
                def raise_for_status(self): pass
                def json(self_inner):
                    return {
                        "choices": [{"message": {"content": json_mod.dumps({
                            "foley_cues": [
                                {"segment_id": s2.id, "sfx_id": foley.id, "target_text": "slammed shut", "action": "alongside", "volume": 0.9, "reason": "Door slam"},
                                {"segment_id": s2.id, "sfx_id": "hallucinated-id", "target_text": "ghost", "action": "alongside", "volume": 0.5, "reason": "Invalid"},
                            ],
                            "atmosphere_spans": [
                                {"start_segment_id": s1.id, "end_segment_id": s2.id, "sfx_id": atmo.id, "volume": 0.25, "reason": "Rainstorm"}
                            ],
                        })}, "finish_reason": "stop"}],
                        "usage": {"prompt_tokens": 100, "completion_tokens": 50},
                    }
            return MockResp()

        json_mod = json
        monkeypatch.setattr(httpx.AsyncClient, "post", mock_sfx_post)

        preview = await AutoSfxCueingService.auto_cue_chapters(
            project_id=proj.id, user_id=user.id, chapter_ids=[ch.id], dry_run=True, db=db
        )
        assert preview["applied_foley_count"] == 0
        assert len(preview["plans"][0]["foley_cues"]) == 1  # hallucinated-id filtered out!

        applied = await AutoSfxCueingService.auto_cue_chapters(
            project_id=proj.id, user_id=user.id, chapter_ids=[ch.id], dry_run=False, db=db
        )
        assert applied["applied_foley_count"] == 1
        assert applied["applied_atmosphere_segments"] == 2
        await db.refresh(s2)
        assert s2.atmosphere_id == atmo.id
        assert len(s2.sfx_cues or []) == 1

        # 2. Pronunciation Glossary Extraction (saved as inactive drafts)
        async def mock_pron_post(self, url, json=None, headers=None, **kwargs):
            class MockResp:
                status_code = 200
                def raise_for_status(self): pass
                def json(self_inner):
                    return {
                        "choices": [{"message": {"content": json_mod.dumps({
                            "suggestions": [
                                {"phrase": "Baek Yu-Seol", "replacement": "Beck Yoo-Suhl", "match_case": True, "reason": "Korean name"}
                            ]
                        })}, "finish_reason": "stop"}],
                        "usage": {"prompt_tokens": 90, "completion_tokens": 30},
                    }
            return MockResp()

        monkeypatch.setattr(httpx.AsyncClient, "post", mock_pron_post)
        pron_res = await PronunciationExtractorService.extract_glossary(
            project_id=proj.id, db=db, save_as_drafts=True
        )
        assert pron_res["created_drafts_count"] == 1
        rules = (await db.execute(select(PronunciationRuleModel).where(PronunciationRuleModel.project_id == proj.id))).scalars().all()
        assert len(rules) == 1
        assert rules[0].is_active is False
        assert rules[0].occurrences_count == 1

        # 3. Chapter Packaging Generation
        async def mock_pkg_post(self, url, json=None, headers=None, **kwargs):
            class MockResp:
                status_code = 200
                def raise_for_status(self): pass
                def json(self_inner):
                    return {
                        "choices": [{"message": {"content": json_mod.dumps({
                            "episode_title": "Chapter 1: Storm Over the Arcane Tower",
                            "short_recap": "As rain lashes the tower, Baek Yu-Seol confronts a fateful arrival.",
                            "youtube_description": "Episode 1 of Arcane Estate! #audiobook #fantasy",
                            "content_warnings": [],
                            "mood_tags": ["dark fantasy", "mystery"],
                        })}, "finish_reason": "stop"}],
                        "usage": {"prompt_tokens": 110, "completion_tokens": 60},
                    }
            return MockResp()

        monkeypatch.setattr(httpx.AsyncClient, "post", mock_pkg_post)
        pkg_res = await ChapterPackagingService.generate_packaging(
            project_id=proj.id, chapter_ids=[ch.id], db=db
        )
        assert pkg_res["generated_count"] == 1
        await db.refresh(ch)
        assert ch.packaging_metadata is not None
        assert ch.packaging_metadata["episode_title"] == "Chapter 1: Storm Over the Arcane Tower"
