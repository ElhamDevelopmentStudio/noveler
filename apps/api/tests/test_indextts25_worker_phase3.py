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


def test_format_chapter_title_intro_and_narrator_scaling():
    from app.services.kaggle_worker import (
        format_chapter_title_intro,
        int_to_english,
        scale_narrator_emotion_profile,
    )

    # Spoken English numbers via inflect (integers, ordinals, decimals, comma-separated)
    assert int_to_english(670) == "six hundred and seventy"
    assert int_to_english(2882) == "two thousand, eight hundred and eighty-two"
    assert int_to_english("21st") == "twenty-first"
    assert int_to_english("10,000") == "ten thousand"
    assert sanitize_text_for_indextts25("On the 3rd day, 670 echoes remained.") == "On the third day, six hundred and seventy echoes remained."

    # Avoids duplicating "Chapter 670" and spells out the chapter number
    assert format_chapter_title_intro(670, "Chapter 670: With Kid Gloves") == "Chapter six hundred and seventy: With Kid Gloves"
    assert format_chapter_title_intro(670, "Chapter 670 - With Kid Gloves") == "Chapter six hundred and seventy: With Kid Gloves"
    assert format_chapter_title_intro(670, "With Kid Gloves") == "Chapter six hundred and seventy: With Kid Gloves"
    assert format_chapter_title_intro(670, "") == "Chapter six hundred and seventy."

    # Neutral narration uses pure reference prosody (emo_vector=None, emo_alpha=0.0) at 1.2x speed
    neutral_narr = scale_narrator_emotion_profile(None, speaker="Narrator", delivery_type="narration")
    assert neutral_narr["vector"] is None
    assert neutral_narr["emo_alpha"] == 0.0
    assert neutral_narr["narrator_speed"] == 1.2

    # Emotional narration gets gentle 0.55x coloring capped at emo_alpha <= 0.18 (never artificial calm boost)
    narr_ep = {"vector": [0.0, 0.4, 0.2, 0.2, 0.0, 0.0, 0.0, 0.4], "emo_alpha": 0.40}
    scaled_narr = scale_narrator_emotion_profile(narr_ep, speaker="Narrator", delivery_type="narration")
    assert scaled_narr["vector"][1] == 0.22
    assert scaled_narr["vector"][7] == 0.0
    assert scaled_narr["emo_alpha"] == 0.18
    assert scaled_narr["narrator_speed"] == 1.2
    assert scaled_narr["_narrator_scaled"] is True

    # Leaves dialogue characters untouched at full expressiveness and 1.0x speed
    dlg_ep = {"vector": [0.0, 0.8, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], "emo_alpha": 0.75}
    scaled_dlg = scale_narrator_emotion_profile(dlg_ep, speaker="Sunny", delivery_type="dialogue")
    assert scaled_dlg == dlg_ep


def test_build_kaggle_worker_script_for_cosyvoice3_compiles_and_includes_debump():
    script = build_kaggle_worker_script(
        job_id="job-cv3",
        project_id="proj-ss",
        tts_model="cosyvoice-3",
        r2_endpoint="https://r2.example.com",
        r2_bucket="novelova",
        r2_access_key="ak",
        r2_secret_key="sk",
    )
    compile(script, "<kaggle_worker_cosyvoice3>", "exec")
    assert "FunAudioLLM/Fun-CosyVoice3-0.5B-2512" in script
    assert "_clean_and_level_audio" in script
    assert "cosyvoice_model.inference_instruct2" in script
    assert "/content/novelova_worker" in script
    assert "fp16=False" in script
    assert "top_p=0.68, top_k=15" in script

    class _UserCV:
        preferred_tts_model = "cosyvoice-3"

    assert KaggleWorkerService.get_user_tts_model(_UserCV()) == "cosyvoice-3"
