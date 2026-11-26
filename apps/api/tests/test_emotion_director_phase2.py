from types import SimpleNamespace

from app.services.dossier import DOSSIER_SYSTEM_PROMPT
from app.services.tagger import STAGE_B_SYSTEM_PROMPT, StageBTaggingService


def test_sanitize_emotion_profile_enforces_happy_and_alpha_guardrails():
    # Overly high happy + overly high alpha + out-of-range duration_factor
    sanitized = StageBTaggingService.sanitize_emotion_profile(
        {
            "label": "Joyful Grin!!",
            "vector": [0.92, 0.0, 0.0, 0.0, 0.0, 0.0, 0.1, 0.1],
            "emo_alpha": 0.95,
            "duration_factor": 1.4,
        },
        delivery_type="dialogue",
    )
    assert sanitized is not None
    assert sanitized["label"] == "joyful_grin"
    assert sanitized["vector"][0] == 0.45  # happy capped at 0.45
    assert sanitized["vector"][7] == 0.35  # calm blended >= 0.35 when happy > 0.20
    assert sanitized["emo_alpha"] == 0.68  # dialogue alpha capped at 0.68 (restrained 9/10 acting)
    assert sanitized["duration_factor"] == 1.12  # duration_factor capped at 1.12


def test_sanitize_emotion_profile_clamps_narration_alpha_subtle():
    sanitized = StageBTaggingService.sanitize_emotion_profile(
        {
            "label": "somber_tragic",
            "vector": [0.0, 0.0, 0.4, 0.1, 0.0, 0.5, 0.0, 0.3],
            "emo_alpha": 0.80,
            "duration_factor": 1.05,
        },
        delivery_type="narration",
    )
    assert sanitized is not None
    assert sanitized["emo_alpha"] == 0.35  # narration strictly subtle [0.20, 0.35]

    low = StageBTaggingService.sanitize_emotion_profile(
        {
            "label": "calm",
            "vector": [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.5],
            "emo_alpha": 0.05,
            "duration_factor": 0.7,
        },
        delivery_type="internal_thought",
    )
    assert low is not None
    assert low["emo_alpha"] == 0.20
    assert low["duration_factor"] == 0.92


def test_split_quote_strictly_inherits_starts_phrase_emotion_profile():
    seg1 = SimpleNamespace(
        id="seg-1",
        order_index=1,
        text='"I told you,"',
        is_dialogue=True,
        parent_turn_id="turn-42",
        continuation_type="starts_phrase",
        dialogue_chain_id=None,
    )
    seg2 = SimpleNamespace(
        id="seg-2",
        order_index=3,
        text='"never to come back."',
        is_dialogue=True,
        parent_turn_id="turn-42",
        continuation_type="completes_phrase",
        dialogue_chain_id=None,
    )

    start_profile = {
        "label": "quiet_sorrow",
        "vector": [0.0, 0.0, 0.6, 0.0, 0.0, 0.5, 0.0, 0.2],
        "emo_alpha": 0.65,
        "duration_factor": 1.08,
    }
    different_profile = {
        "label": "furious",
        "vector": [0.0, 0.8, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
        "emo_alpha": 0.72,
        "duration_factor": 0.95,
    }

    decisions = [
        {
            "segment_id": "seg-1",
            "speaker": "Nephis",
            "gender": "female",
            "is_dialogue": True,
            "delivery_type": "dialogue",
            "emotion_profile": start_profile,
        },
        {
            "segment_id": "seg-2",
            "speaker": "General Female",
            "gender": "female",
            "is_dialogue": True,
            "delivery_type": "dialogue",
            "emotion_profile": different_profile,
        },
    ]

    result = StageBTaggingService.enforce_dialogue_chain_turn_taking(
        [seg1, seg2], decisions, known_characters=[], prior_decisions=[]
    )
    by_id = {d["segment_id"]: d for d in result}
    assert by_id["seg-2"]["speaker"] == "Nephis"
    assert by_id["seg-2"]["emotion_profile"] == start_profile


def test_prompts_contain_emotion_director_and_narrator_rules():
    assert "emotion_profile" in STAGE_B_SYSTEM_PROMPT
    assert "scene_narration_emotion" in STAGE_B_SYSTEM_PROMPT
    assert "Special rule for the Narrator role" in DOSSIER_SYSTEM_PROMPT


def test_truncated_json_rescuer_handles_nested_emotion_profile():
    truncated = '''{
  "scene_narration_emotion": {"label": "somber", "vector": [0,0,0.3,0,0,0.4,0,0.4], "emo_alpha": 0.25, "duration_factor": 1.0},
  "dialogue_attributions": [
    {
      "segment_id": "seg-a",
      "speaker": "Klein",
      "gender": "male",
      "raw_speaker_tag": null,
      "paralinguistic_tag": null,
      "emotion_profile": {
        "label": "quiet_tension",
        "vector": [0.0, 0.1, 0.0, 0.2, 0.0, 0.2, 0.0, 0.5],
        "emo_alpha": 0.5,
        "duration_factor": 1.0
      },
      "confidence": 0.95,
      "is_internal_thought": false
    },
    {
      "segment_id": "seg-b",
      "speaker": "Dunn",
      "gender": "male",
      "emotion_profile": {
        "label": "calm_warn'''
    rescued = StageBTaggingService._extract_attributions_from_truncated_json(truncated)
    assert len(rescued) == 1
    assert rescued[0]["segment_id"] == "seg-a"
    assert rescued[0]["speaker"] == "Klein"
    assert rescued[0]["emotion_profile"]["label"] == "quiet_tension"
    assert len(rescued[0]["emotion_profile"]["vector"]) == 8

