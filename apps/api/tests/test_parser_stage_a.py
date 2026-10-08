import pytest
from app.schemas.chapter import ParseOptionsSchema
from app.services.parser import ManuscriptParserService


def test_inflect_number_to_words_and_protected_patterns():
    options = ParseOptionsSchema(
        remove_whitespace=True,
        normalize_paragraphs=True,
        speak_unambiguous_numbers=True,
    )
    raw = (
        "In 2024, Dr. Smith gathered 12 soldiers with $50.00 each. "
        "They marched 15km in 1.5 hours across the border."
    )
    cleaned = ManuscriptParserService.clean_text(raw, options)

    # 12 -> twelve, 1.5 -> one point five
    assert "twelve soldiers" in cleaned
    assert "one point five hours" in cleaned

    # Protected terms preserved
    assert "2024" in cleaned
    assert "$50.00" in cleaned
    assert "15km" in cleaned


def test_sentence_wise_segmentation_with_abbreviations_and_dialogue():
    options = ParseOptionsSchema(
        separate_sentence_wise=True,
        detect_chapter_headings=True,
    )
    text = (
        'Dr. Bell glanced at the map. "We must reach the third ridge before dusk," Mara said. '
        '"The weather is turning quickly."'
    )
    segments = ManuscriptParserService.segment_text(text, options)

    assert len(segments) == 4
    # Segment 1: Narration with Dr. abbreviation intact
    assert segments[0][0] == "Dr. Bell glanced at the map."
    assert segments[0][1] is False  # is_dialogue

    # Segment 2: First quote
    assert segments[1][0] == '"We must reach the third ridge before dusk,"'
    assert segments[1][1] is True

    # Segment 3: Attribution beat
    assert segments[2][0] == "Mara said."
    assert segments[2][1] is False

    # Segment 4: Second quote
    assert segments[3][0] == '"The weather is turning quickly."'
    assert segments[3][1] is True


def test_10_chapter_batch_computation():
    # Chapter 0 (prologue/front matter) belongs to batch 1
    assert ManuscriptParserService.compute_batch_number(0) == 1

    # Chapters 1..10 belong to batch 1
    for ch in range(1, 11):
        assert ManuscriptParserService.compute_batch_number(ch) == 1

    # Chapters 11..20 belong to batch 2
    for ch in range(11, 21):
        assert ManuscriptParserService.compute_batch_number(ch) == 2

    # Chapters 21..30 belong to batch 3
    for ch in range(21, 31):
        assert ManuscriptParserService.compute_batch_number(ch) == 3

    # Chapter 835 belongs to batch 84
    assert ManuscriptParserService.compute_batch_number(835) == 84
