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


def test_dialogue_quotes_single_bracket_and_nested_quotes():
    options = ParseOptionsSchema(separate_sentence_wise=True)

    text = (
        "‘'I'm sorry, Section Chief Jeon. I was too harsh. I truly apologize.'’\n\n"
        "[I accept your tribute and permit you to stay in my territory for seven nights.]\n\n"
        "'In a world where cultivators become immortals and fly around, and martial artists fight.'\n\n"
        "It's a fifty-year-old memory, so it's a bit hazy. I can't remember clearly."
    )
    segments = ManuscriptParserService.segment_text(text, options)

    assert len(segments) == 5
    # Segment 0: Nested single/curly quote dialogue
    assert segments[0][1] is True
    assert "Section Chief Jeon" in segments[0][0]

    # Segment 1: Bracketed speech (divine beast / telepathy)
    assert segments[1][1] is True
    assert "I accept your tribute" in segments[1][0]

    # Segment 2: Single quote dialogue
    assert segments[2][1] is True
    assert "In a world where cultivators become immortals" in segments[2][0]

    # Segment 3 & 4: Narration with contractions (not split as quotes)
    assert segments[3][1] is False
    assert segments[4][1] is False


def test_system_prompt_and_litrpg_window_detection():
    options = ParseOptionsSchema(separate_sentence_wise=True)
    text = (
        "[System: You have acquired Skill: Iron Will]\n\n"
        "Seo Eun-hyun took a deep breath.\n\n"
        "【Alert: Dimensional gate opening in 3 minutes】\n\n"
        '"Prepare your weapons!" he shouted.'
    )
    segments = ManuscriptParserService.segment_text(text, options)

    assert len(segments) == 5
    # Segment 0: LitRPG system prompt bracket
    assert segments[0].delivery_type == "system_prompt"
    assert segments[0].is_dialogue is False
    assert segments[0].speaker == "System / Interface"

    # Segment 1: Narration
    assert segments[1].delivery_type == "narration"
    assert segments[1].is_dialogue is False

    # Segment 2: Asian bracket alert
    assert segments[2].delivery_type == "system_prompt"
    assert segments[2].is_dialogue is False
    assert segments[2].speaker == "System / Interface"

    # Segment 3: Spoken dialogue
    assert segments[3].delivery_type == "dialogue"
    assert segments[3].is_dialogue is True

    # Segment 4: Narration attribution beat
    assert segments[4].delivery_type == "narration"
    assert segments[4].is_dialogue is False


def test_split_dialogue_around_narrative_beats():
    options = ParseOptionsSchema(separate_sentence_wise=True)
    text = (
        '"If you take another step," she warned, drawing her blade, "I will strike."'
    )
    segments = ManuscriptParserService.segment_text(text, options)

    assert len(segments) == 3
    # Part 1: starts_phrase
    assert segments[0].delivery_type == "dialogue"
    assert segments[0].continuation_type == "starts_phrase"
    assert segments[0].parent_turn_id is not None

    # Part 2: interstitial_beat
    assert segments[1].delivery_type == "narration"
    assert segments[1].continuation_type == "interstitial_beat"
    assert segments[1].parent_turn_id == segments[0].parent_turn_id

    # Part 3: completes_phrase
    assert segments[2].delivery_type == "dialogue"
    assert segments[2].continuation_type == "completes_phrase"
    assert segments[2].parent_turn_id == segments[0].parent_turn_id


def test_ping_pong_dialogue_chain_grouping():
    options = ParseOptionsSchema(separate_sentence_wise=True)
    text = (
        '"Did you find him?"\n\n'
        '"Nothing near the south gate."\n\n'
        '"Check the perimeter wall."\n\n'
        '"I did. Tracks lead into the mist."\n\n'
        "The wind howled across the empty courtyard with a desolate shriek."
    )
    segments = ManuscriptParserService.segment_text(text, options)

    # 4 dialogue lines in sequence -> should share dialogue_chain_id
    assert len(segments) == 5
    chain_id = segments[0].dialogue_chain_id
    assert chain_id is not None
    assert segments[1].dialogue_chain_id == chain_id
    assert segments[2].dialogue_chain_id == chain_id
    assert segments[3].dialogue_chain_id == chain_id

    # Narration following dialogue is not in the dialogue chain
    assert segments[4].dialogue_chain_id is None


def test_multi_sentence_split_dialogue_continuation():
    options = ParseOptionsSchema(separate_sentence_wise=True)
    text = (
        '"Listen to me," she whispered, drawing her dagger. '
        'Her hands trembled violently in the dark. "We cannot stay here."'
    )
    segments = ManuscriptParserService.segment_text(text, options)

    assert len(segments) == 4
    # Part 1: starts_phrase
    assert segments[0].delivery_type == "dialogue"
    assert segments[0].continuation_type == "starts_phrase"
    turn_id = segments[0].parent_turn_id
    assert turn_id is not None

    # Interstitial Beat 1: Narration sentence 1
    assert segments[1].delivery_type == "narration"
    assert segments[1].continuation_type == "interstitial_beat"
    assert segments[1].parent_turn_id == turn_id

    # Interstitial Beat 2: Narration sentence 2
    assert segments[2].delivery_type == "narration"
    assert segments[2].continuation_type == "interstitial_beat"
    assert segments[2].parent_turn_id == turn_id

    # Part 3: completes_phrase
    assert segments[3].delivery_type == "dialogue"
    assert segments[3].continuation_type == "completes_phrase"
    assert segments[3].parent_turn_id == turn_id


def test_parse_wiki_and_decorative_chapter_headings():
    options = ParseOptionsSchema(detect_chapter_headings=True)
    raw = (
        "=== Prologue ===\n\n"
        "Of course, this did not mean he was powerless.\n\n"
        "=== Chapter 1 ===\n\n"
        "The academy grounds were vast.\n\n"
        "[Episode 2]\n\n"
        "[Enroll in Stella Academy!]\n\n"
        "The system message hovered before him.\n\n"
        "=== Chapter 10: A Failure in Class S (three) ===\n\n"
        "{TN:- SDL:- Self-directed Learning}\n\n"
        '"Edna! Are you studying on your own?"'
    )
    chapters = ManuscriptParserService.parse_raw_text_into_chapters(raw, options)

    assert len(chapters) == 3
    # Chapter 1: Prologue
    assert chapters[0]["title"] == "Prologue"
    assert "powerless" in chapters[0]["text"]

    # Chapter 2: Chapter 1
    assert chapters[1]["title"] == "Chapter 1"
    assert "academy grounds" in chapters[1]["text"]
    # In-game quest notification [Episode 2] should remain inside Chapter 1 text
    assert "[Episode" in chapters[1]["text"]

    # Chapter 3: Chapter 10
    assert chapters[2]["title"] == "Chapter 10: A Failure in Class S (three)"
    assert "{TN:- SDL:- Self-directed Learning}" in chapters[2]["text"]
    assert '"Edna! Are you studying on your own?"' in chapters[2]["text"]


def test_inline_single_quoted_terms_and_proper_nouns_remain_narration():
    options = ParseOptionsSchema(separate_sentence_wise=True)
    text = (
        "The ‘Familiar Contract Ceremony’ was one, and the ‘Staff Inheritance Ceremony’ was another.\n\n"
        "The ‘Staff Inheritance Ceremony’ was especially extraordinary since Stella Academy was a prestigious school.\n\n"
        "Knowing that, she could choose ‘Arcanum’... or she could choose ‘Tumultus’...\n\n"
        "the ‘protagonist’ of this world with endless possibilities, she could resonate with any wand."
    )
    segments = ManuscriptParserService.segment_text(text, options)

    assert len(segments) == 4
    # Sentence 1: Ceremony names preserved inside intact narration
    assert segments[0].text == "The ‘Familiar Contract Ceremony’ was one, and the ‘Staff Inheritance Ceremony’ was another."
    assert segments[0].is_dialogue is False
    assert segments[0].delivery_type == "narration"
    assert segments[0].speaker == "Narrator"

    # Sentence 2: Single ceremony name preserved inside intact narration
    assert segments[1].text == "The ‘Staff Inheritance Ceremony’ was especially extraordinary since Stella Academy was a prestigious school."
    assert segments[1].is_dialogue is False
    assert segments[1].delivery_type == "narration"

    # Sentence 3: Wand choice names with ellipsis preserved inside intact narration
    assert segments[2].text == "Knowing that, she could choose ‘Arcanum’... or she could choose ‘Tumultus’..."
    assert segments[2].is_dialogue is False
    assert segments[2].delivery_type == "narration"

    # Sentence 4: Proper term in mid-sentence
    assert segments[3].text == "the ‘protagonist’ of this world with endless possibilities, she could resonate with any wand."
    assert segments[3].is_dialogue is False
    assert segments[3].delivery_type == "narration"


def test_short_bracket_skills_and_translator_notes():
    options = ParseOptionsSchema(separate_sentence_wise=True)
    text = (
        "[Flash]\n\n"
        "[Heavy Strike]\n\n"
        "[Inspect]\n\n"
        "{TN:- SDL:- Self-directed Learning}\n\n"
        "[TN: Chapter Note]\n\n"
        "[I accept your tribute and permit you to stay in my territory for seven nights.]\n\n"
        '"“Huhh?”"'
    )
    segments = ManuscriptParserService.segment_text(text, options)

    # Short bracketed skills must be system_prompt, NOT dialogue
    assert segments[0].text == "[Flash]"
    assert segments[0].is_dialogue is False
    assert segments[0].delivery_type == "system_prompt"
    assert segments[0].speaker == "System / Interface"

    assert segments[1].text == "[Heavy Strike]"
    assert segments[1].is_dialogue is False
    assert segments[1].delivery_type == "system_prompt"

    assert segments[2].text == "[Inspect]"
    assert segments[2].is_dialogue is False
    assert segments[2].delivery_type == "system_prompt"

    # Translator notes must be narration
    assert segments[3].text == "{TN:- SDL:- Self-directed Learning}"
    assert segments[3].is_dialogue is False
    assert segments[3].delivery_type == "narration"

    assert segments[4].text == "[TN: Chapter Note]"
    assert segments[4].is_dialogue is False
    assert segments[4].delivery_type == "narration"

    # Full sentence telepathic speech must remain dialogue
    assert segments[5].text == "[I accept your tribute and permit you to stay in my territory for seven nights.]"
    assert segments[5].is_dialogue is True
    assert segments[5].delivery_type == "dialogue"

    # Double-quoted dialogue
    assert segments[6].is_dialogue is True
    assert segments[6].delivery_type == "dialogue"


def test_protect_inline_double_quotes_in_narration():
    options = ParseOptionsSchema(separate_sentence_wise=True)
    text = (
        'What was written in the system log at the moment were: "Noble Etiquette", "Elitist", "Mysophobe", "Authoritative", "OCD" and so on.\n\n'
        'The title of the lecture was: "Imperial Senior Professor Deculein: A Fundamental Understanding of Magic and Attitude toward Mana".\n\n'
        'As a whole it was called the "Imperial University".\n\n'
        'That\'s why even this "obligation" to hold that lecture felt so natural to me.\n\n'
        '"Woojin."\n\n'
        '"Kim Woojin."\n\n'
        '"That\'s your name."'
    )
    segments = ManuscriptParserService.segment_text(text, options)

    assert segments[0].is_dialogue is False
    assert segments[0].delivery_type == "narration"
    assert '"Noble Etiquette"' in segments[0].text

    assert segments[1].is_dialogue is False
    assert segments[1].delivery_type == "narration"
    assert '"Imperial Senior Professor Deculein' in segments[1].text

    assert segments[2].is_dialogue is False
    assert segments[2].delivery_type == "narration"
    assert '"Imperial University"' in segments[2].text

    assert segments[3].is_dialogue is False
    assert segments[3].delivery_type == "narration"
    assert '"obligation"' in segments[3].text

    assert segments[4].is_dialogue is True
    assert segments[4].delivery_type == "dialogue"
    assert segments[4].text == '"Woojin."'

    assert segments[5].is_dialogue is True
    assert segments[5].delivery_type == "dialogue"
    assert segments[5].text == '"Kim Woojin."'

    assert segments[6].is_dialogue is True
    assert segments[6].delivery_type == "dialogue"
    assert segments[6].text == '"That\'s your name."'


def test_extract_epub_bytes_preserves_headings_and_clean_titles():
    import io
    import zipfile

    # Build a mock EPUB zip
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr(
            "chapter1.xhtml",
            (
                "<html><head><title>Chapter 1: The Beginning</title></head>"
                "<body><h1>Chapter 1: The Beginning</h1><br /><br />"
                "<p>“It is quiet here,” said the traveler.</p><p>The road stretched on.</p></body></html>"
            ),
        )
        zf.writestr(
            "chapter2.xhtml",
            (
                "<html><head><title>Chapter 2: The Ascent</title></head>"
                "<body><h2>Chapter 2: The Ascent</h2><br />"
                "<p>High upon the snowy peak, the wind roared.</p></body></html>"
            ),
        )

    epub_bytes = buf.getvalue()
    raw_text = ManuscriptParserService.extract_from_epub_bytes(epub_bytes)

    # Verify <head> is stripped and paragraphs are separated by newlines
    assert "Chapter 1: The Beginning\n\n“It is quiet here,”" in raw_text or "Chapter 1: The Beginning\n\n\n“It is quiet here,”" in raw_text or "Chapter 1: The Beginning\n" in raw_text

    options = ParseOptionsSchema(detect_chapter_headings=True)
    chapters = ManuscriptParserService.parse_raw_text_into_chapters(raw_text, options)

    assert len(chapters) == 2
    assert chapters[0]["title"] == "Chapter 1: The Beginning"
    assert len(chapters[0]["title"]) < 50
    assert chapters[1]["title"] == "Chapter 2: The Ascent"
    assert len(chapters[1]["title"]) < 50


def test_inline_bracket_nouns_and_box_drawing_stat_trees():
    """Verify inline brackets stay inside narration sentences and box-drawing stat trees consolidate cleanly."""
    options = ParseOptionsSchema(separate_sentence_wise=True)
    text = (
        "The Memorize of [Psychokinesis] was unbelievably slow.\n\n"
        "I saw the condition of Memorize using [Vision].\n\n"
        "◆Memorize Status\n\n"
        ": Beginner – Intermediate Psychokinesis (seventy-nine%)\n\n"
        "┌ Beginner – Intermediate Fire Control (fifty-three%)\n\n"
        "├ Beginner – Intermediate Earth Control (forty-eight%)\n\n"
        "└ Metal Enhancement (eighty-nine%)\n\n"
        "It was still Beginner – Intermediate level."
    )
    segments = ManuscriptParserService.segment_text(text, options)

    # 1. Inline bracket sentence must NOT be split into fragments
    assert segments[0].text == "The Memorize of [Psychokinesis] was unbelievably slow."
    assert segments[0].delivery_type == "narration"
    assert segments[0].speaker == "Narrator"

    assert segments[1].text == "I saw the condition of Memorize using [Vision]."
    assert segments[1].delivery_type == "narration"
    assert segments[1].speaker == "Narrator"

    # 2. Box-drawing stat lines must consolidate into one coherent status prompt
    assert segments[2].delivery_type == "system_prompt"
    assert segments[2].speaker == "System / Interface"
    assert "◆Memorize Status" in segments[2].text
    assert "Beginner – Intermediate Psychokinesis" in segments[2].text
    assert "┌ Beginner – Intermediate Fire Control" in segments[2].text
    assert "├ Beginner – Intermediate Earth Control" in segments[2].text
    assert "└ Metal Enhancement" in segments[2].text

    # 3. Following normal narration resumes
    assert segments[3].text == "It was still Beginner – Intermediate level."
    assert segments[3].delivery_type == "narration"


def test_dangling_paragraphs_with_isolated_brackets_and_box_drawing():
    options = ParseOptionsSchema(separate_sentence_wise=True)
    raw = (
        "It meant they wouldn’t be among those who could help me with the quest.\n\n"
        "“The rest is…”\n\n"
        "I saw the condition of Memorize using\n\n"
        "[Vision]\n\n"
        "◆Memorize Status\n\n"
        ": Beginner – Intermediate Psychokinesis (seventy-nine%)\n\n"
        "┌ Beginner – Intermediate Fire Control (fifty-three%)\n\n"
        "├ Beginner – Intermediate Earth Control (forty-eight%)\n\n"
        "└ Metal Enhancement (eighty-nine%)\n\n"
        "It was still fucking Beginner – Intermediate level.\n\n"
        "How difficult was the intermediate level to reach?\n\n"
        "The Memorize of\n\n"
        "[Psychokinesis]\n\n"
        "was unbelievably slow."
    )
    segments = ManuscriptParserService.segment_text(raw, options)

    assert len(segments) == 7
    assert segments[0].delivery_type == "narration"
    assert segments[1].delivery_type == "dialogue"
    assert segments[1].text == "“The rest is…”"

    # Dangling "using" attached to [Vision]
    assert segments[2].delivery_type == "narration"
    assert segments[2].text == "I saw the condition of Memorize using [Vision]."

    # Complete multi-line box-drawing status table
    assert segments[3].delivery_type == "system_prompt"
    assert segments[3].speaker == "System / Interface"
    assert "◆Memorize Status" in segments[3].text
    assert "┌ Beginner – Intermediate Fire Control (fifty-three%)" in segments[3].text
    assert "└ Metal Enhancement (eighty-nine%)" in segments[3].text

    assert segments[4].text == "It was still fucking Beginner – Intermediate level."
    assert segments[5].text == "How difficult was the intermediate level to reach?"

    # Dangling preposition + bracket + lowercase continuation
    assert segments[6].delivery_type == "narration"
    assert segments[6].text == "The Memorize of [Psychokinesis] was unbelievably slow."




