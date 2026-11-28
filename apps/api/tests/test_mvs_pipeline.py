"""Regression tests for My Vampire System (MVS) LitRPG parsing, linguistics, tagging, and worker sanitization."""

from app.schemas.chapter import ParseOptionsSchema
from app.services.kaggle_worker import sanitize_text_for_indextts25
from app.services.parser import SCENE_BREAK_RE, ManuscriptParserService
from app.services.tagger import StageBTaggingService
from novelova_core.linguistics import infer_name_gender


def test_quinn_is_not_hardcoded_female():
    assert infer_name_gender("Quinn") == "male"
    assert infer_name_gender("Quinn Talen") == "male"


def test_angle_bracket_status_screen_and_consolidation():
    text = (
        "A status screen had appeared right in front of his eyes.\n\n"
        "<User: Quinn Talen>\n\n"
        "<Race: Human>\n\n"
        "< Level 1>\n\n"
        "<0/100 exp>\n\n"
        "<HP 10/10>\n\n"
        "<Strength: 10>\n\n"
        "<Agility: 10>\n\n"
        "<Stamina: 10>\n\n"
        "The last tab was the <Quest> tab and finally it wasn't locked."
    )
    opts = ParseOptionsSchema()
    cleaned = ManuscriptParserService.clean_text(text, opts)
    segs = ManuscriptParserService.segment_text(cleaned, opts)

    sys_segs = [s for s in segs if s.delivery_type == "system_prompt"]
    narr_segs = [s for s in segs if s.delivery_type == "narration"]

    # Entire status screen consolidates into one coherent system_prompt segment
    assert len(sys_segs) == 1
    assert sys_segs[0].speaker == "System / Interface"
    assert "<User: Quinn Talen>" in sys_segs[0].text
    assert "<HP ten out of ten>" in sys_segs[0].text
    assert "<zero out of one hundred exp>" in sys_segs[0].text

    # Inline <Quest> remains part of narration rather than breaking into system_prompt
    assert any("<Quest>" in s.text for s in narr_segs)


def test_bracketed_litrpg_notifications_vs_telepathy():
    litrpg_lines = [
        "[You are being hit by direct sunlight]",
        "[God Slayer tier armour set has been equipped.]",
        "[A cursed family member has died]",
        "[All stats +3]",
        "[60/100 HP]",
        "[20/100 MC]",
        "[-33 HP]",
        "[Congratulations, you are now level 32]",
        "[Option 2: Absorb the God slayer crystal]",
        "[Would you like to attempt to break the seal?]",
        "[Points have been placed in strength]",
        "[3/7 Pieces of human flesh has been consumed by Ghoul Peter Chuck]",
    ]
    for line in litrpg_lines:
        assert ManuscriptParserService.is_short_bracket_system_prompt(line), f"Expected system prompt: {line}"
        assert not StageBTaggingService.has_dialogue_quotes(line), f"Should not be dialogue: {line}"

    # Conversational telepathy in brackets must still be preserved as dialogue
    telepathy_lines = [
        "[Wait, I'm here!]",
        "[Are you ready?]",
        "[Help me!]",
        "[Run away]",
    ]
    for line in telepathy_lines:
        assert not ManuscriptParserService.is_short_bracket_system_prompt(line), f"Should remain telepathy: {line}"


def test_mixed_dash_scene_breaks():
    for brk in ("——-", "———-", "——", "---", "* * *"):
        assert SCENE_BREAK_RE.match(brk), f"SCENE_BREAK_RE missed {brk!r}"
        assert StageBTaggingService.SCENE_DIVIDER_RE.match(brk), f"SCENE_DIVIDER_RE missed {brk!r}"


def test_system_speech_tag_and_number_formatting():
    assert StageBTaggingService.find_textual_speaker_tag("'Oh, will you relax!' The system said.") == "System / Interface"
    assert ManuscriptParserService.speak_unambiguous_numbers("<HP 10/10>") == "<HP ten out of ten>"
    assert ManuscriptParserService.speak_unambiguous_numbers("[All stats +3]") == "[All stats plus three]"
    assert ManuscriptParserService.speak_unambiguous_numbers("Date: 12/04/2024") == "Date: 12/04/2024"


def test_worker_indextts_sanitization_strips_angle_brackets_and_preserves_cmu():
    assert sanitize_text_for_indextts25("<HP 10/10>") == "HP ten out of ten"
    assert sanitize_text_for_indextts25("<0/100 exp>") == "zero out of one hundred exp"
    assert sanitize_text_for_indextts25("<Strength: 10>") == "Strength: ten"
    assert sanitize_text_for_indextts25("[All stats +3]") == "[All stats plus three]"
    # Pronunciation CMU markup must remain intact
    assert sanitize_text_for_indextts25("Quinn met <Dalki|D AO1 L K IY0>.") == "Quinn met <Dalki|D AO1 L K IY0>."
