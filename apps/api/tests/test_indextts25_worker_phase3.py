from app.services.kaggle_worker import (
    KaggleWorkerService,
    build_kaggle_worker_script,
    build_segment_take_cache_hash,
    sanitize_text_for_indextts25,
)


def test_sanitize_text_for_indextts25_strips_tags_expands_stutters_preserves_no_and_cmu():
    # Preserves "No." untouched (never "number")
    assert sanitize_text_for_indextts25("...No. I can't.") == "...No. I can't."

    # Strips Chatterbox paralinguistic tags
    assert sanitize_text_for_indextts25("[sigh] I didn't mean it. [gasp]") == "I didn't mean it."

    # Expands isolated single-letter stutter consonants without touching 'I' or 'A'
    assert sanitize_text_for_indextts25("H... how...") == "Huh... how..."
    assert sanitize_text_for_indextts25("W-what are you doing? I-I can't!") == "Wuh-what are you doing? I-I can't!"
    assert sanitize_text_for_indextts25("B-but s-stop!") == "Buh-but sss-stop!"

    # Preserves <word|CMU_PHONEMES> overrides intact
    src = "H... how did <Seojun|S UH1 JH UW2 N> know? [gasp]"
    assert sanitize_text_for_indextts25(src) == "Huh... how did <Seojun|S UH1 JH UW2 N> know?"


def test_take_cache_hash_invalidates_on_emotion_or_voice_ref_change():
    base = dict(
        text="Why did you throw the fight?!",
        tts_model="indextts-2.5",
        voice_id="voice-sunny",
        voice_ref_version="voices/sunny_v1.wav|2026-11-25T00:00:00Z",
        speaker_gender="male",
        emotion=None,
        emotion_profile={
            "label": "furious",
            "vector": [0.0, 0.8, 0.1, 0.0, 0.15, 0.0, 0.1, 0.0],
            "emo_alpha": 0.74,
            "duration_factor": 0.95,
        },
        voice_filter_id=None,
        sfx_cues=[],
    )
    h1 = build_segment_take_cache_hash(**base)

    # Rounding stability: 0.741 rounds to 0.74 -> identical hash
    same_rounded = {**base, "emotion_profile": {**base["emotion_profile"], "emo_alpha": 0.741}}
    assert build_segment_take_cache_hash(**same_rounded) == h1

    # Tweaking emo_alpha invalidates hash
    diff_alpha = {**base, "emotion_profile": {**base["emotion_profile"], "emo_alpha": 0.55}}
    assert build_segment_take_cache_hash(**diff_alpha) != h1

    # Re-designing reference clip under same voice_id invalidates hash
    diff_ref = {**base, "voice_ref_version": "voices/sunny_v2.wav|2026-11-26T00:00:00Z"}
    assert build_segment_take_cache_hash(**diff_ref) != h1


def test_build_kaggle_worker_script_for_indextts25_contains_fp16_and_stubs():
    script = build_kaggle_worker_script(
        job_id="job-123",
        project_id="proj-456",
        tts_model="indextts-2.5",
        r2_endpoint="https://r2.example.com",
        r2_bucket="novelova",
        r2_access_key="ak",
        r2_secret_key="sk",
    )
    # Must be syntactically valid Python
    compile(script, "<kaggle_worker_indextts25>", "exec")
    assert 'TextNormalizer.load = lambda self: None' in script
    assert 'TextNormalizer.normalize = lambda self, text: text' in script
    assert 'text_normalization=False' in script
    assert 'indextts_model.gpt = indextts_model.gpt.half()' in script
    assert 'indextts_model.s2mel = indextts_model.s2mel.half()' in script
    assert 'indextts_model.bigvgan = indextts_model.bigvgan.float()' in script
    assert 'sample_rate = 22050 if "indextts-2.5" == "indextts-2.5" else 24000' in script


def test_get_user_tts_model_resolves_indextts25():
    class _User:
        preferred_tts_model = "indextts-2.5"

    assert KaggleWorkerService.get_user_tts_model(_User()) == "indextts-2.5"
