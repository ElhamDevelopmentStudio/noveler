import pytest
from pydantic import ValidationError

from app.core.tts_catalog import get_model_spec, list_supported_models
from app.models.chapter import ScriptSegmentModel
from app.schemas.chapter import EmotionProfileSchema, ScriptSegmentResponse, ScriptSegmentUpdateSchema


def test_emotion_profile_schema_clamps_and_rounds():
    profile = EmotionProfileSchema(
        label="bitter_frustrated",
        vector=[-0.5, 0.456, 1.4, 0.0, 0.251, 0.2, 0.0, 0.104],
        emo_alpha=0.627,
        duration_factor=0.984,
    )
    assert profile.vector == [0.0, 0.46, 1.0, 0.0, 0.25, 0.2, 0.0, 0.1]
    assert profile.emo_alpha == 0.63
    assert profile.duration_factor == 0.98


def test_emotion_profile_schema_rejects_wrong_vector_length():
    with pytest.raises(ValidationError):
        EmotionProfileSchema(label="bad", vector=[0.1, 0.2, 0.3])


def test_segment_schemas_include_emotion_profile():
    upd = ScriptSegmentUpdateSchema(
        emotion_profile={
            "label": "quiet_sorrow",
            "vector": [0.0, 0.0, 0.6, 0.0, 0.0, 0.5, 0.0, 0.2],
            "emo_alpha": 0.65,
            "duration_factor": 1.06,
        }
    )
    dumped = upd.model_dump(exclude_unset=True)
    assert dumped["emotion_profile"]["label"] == "quiet_sorrow"
    assert len(dumped["emotion_profile"]["vector"]) == 8

    assert hasattr(ScriptSegmentModel, "emotion_profile")
    assert "emotion_profile" in ScriptSegmentResponse.model_fields


def test_tts_catalog_registers_indextts_25():
    spec = get_model_spec("indextts-2.5")
    assert spec.id == "indextts-2.5"
    assert spec.dataset_slug == "novelova-indextts25"
    assert spec.vram_mb == 6500
    ids = {m.id for m in list_supported_models()}
    assert {"kokoro-82m", "chatterbox-turbo", "indextts-2.5"}.issubset(ids)
