"""Regression tests covering real Lord of Mysteries (LOTM) parsing, tagging, and cast bugs."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from app.models.chapter import ScriptSegmentModel
from app.schemas.chapter import ParseOptionsSchema
from app.services.parser import ManuscriptParserService
from app.services.tagger import StageBTaggingService
from novelova_core.linguistics import is_invalid_character_name


# ---------------------------------------------------------------------------
# 1. Stage A: Comma-grouped number normalization
# ---------------------------------------------------------------------------


def test_comma_formatted_numbers_normalize_cleanly():
    opts = ParseOptionsSchema(speak_unambiguous_numbers=True)
    text = (
        "Klein handed 2,500 pounds in cash.\n\n"
        "I've spent almost 5,000 pounds, and she is worth 26,000 pounds, not 1,500 or 3,000 pounds."
    )
    cleaned = ManuscriptParserService.clean_text(text, opts)
    assert "two,five" not in cleaned
    assert "five,zero" not in cleaned
    assert "twenty-six,zero" not in cleaned
    assert "one,five" not in cleaned
    assert "three,zero" not in cleaned
    assert "two thousand, five hundred pounds" in cleaned
    assert "five thousand pounds" in cleaned
    assert "twenty-six thousand pounds" in cleaned
    assert "one thousand, five hundred" in cleaned
    assert "three thousand pounds" in cleaned


# ---------------------------------------------------------------------------
# 2. Stage A: LOTM deity pronouns & mid-sentence scare quotes
# ---------------------------------------------------------------------------


def test_deity_pronouns_not_sliced_from_narration():
    opts = ParseOptionsSchema(separate_sentence_wise=True)
    text = (
        "Adam turned “His” head and looked at Klein.\n\n"
        "“His” limpid, light-colored eyes reflected the face that was stained with blood.\n\n"
        "As soon as “He” said that, the blurry figure vanished.\n\n"
        "“They” patiently waited for the door to open."
    )
    segs = ManuscriptParserService.segment_text(text, opts)
    assert all(not s.is_dialogue for s in segs), [(s.delivery_type, s.text) for s in segs]
    assert all(s.delivery_type == "narration" for s in segs), [(s.delivery_type, s.text) for s in segs]
    assert any("“His” limpid, light-colored eyes" in s.text for s in segs)
    assert any("As soon as “He” said that," in s.text for s in segs)
    assert any("“They” patiently waited" in s.text for s in segs)


def test_mid_sentence_scare_quotes_not_sliced_into_dialogue_or_thought():
    opts = ParseOptionsSchema(separate_sentence_wise=True)
    text = (
        "He actually mastered the “acting method!” And this was taught to him by Klein.\n\n"
        "He grabbed a pen and paper and began doing a “divination.”\n\n"
        "The table was filled with roses, golden mint, and other “materials.”\n\n"
        "The Loen Kingdom had enacted the ‘Basic Education Law.’\n\n"
        "He discovered familiar cards like “The Magician,” “The Emperor,” “The Hanged Man,” and “Temperance,” etc."
    )
    segs = ManuscriptParserService.segment_text(text, opts)
    assert all(not s.is_dialogue for s in segs), [(s.delivery_type, s.text) for s in segs]
    assert all(s.delivery_type == "narration" for s in segs), [(s.delivery_type, s.text) for s in segs]
    assert any("“acting method!”" in s.text for s in segs)
    assert any("“divination.”" in s.text for s in segs)
    assert any("“materials.”" in s.text for s in segs)
    assert any("‘Basic Education Law.’" in s.text for s in segs)
    assert any("“The Magician,”" in s.text and "“The Emperor,”" in s.text for s in segs)


# ---------------------------------------------------------------------------
# 3. Stage A: Multi-paragraph unclosed opening double quotes
# ---------------------------------------------------------------------------


def test_multi_paragraph_unclosed_dialogue_is_discovered():
    opts = ParseOptionsSchema(separate_sentence_wise=True)
    text = (
        "As he was exiting the door, he suddenly turned around and said, “I forgot to remind you; do not open Chanis Gate.\n\n"
        "“A few years ago, we handled a case regarding an evil cult.\n\n"
        "“The case was handed over to us.”"
    )
    segs = ManuscriptParserService.segment_text(text, opts)
    dialogues = [s for s in segs if s.is_dialogue]
    narrations = [s for s in segs if not s.is_dialogue]

    assert len(narrations) == 1
    assert narrations[0].text.startswith("As he was exiting the door")
    assert len(dialogues) == 3
    assert dialogues[0].text.startswith("“I forgot to remind you")
    assert dialogues[1].text.startswith("“A few years ago")
    assert dialogues[2].text == "“The case was handed over to us.”"
    assert StageBTaggingService.has_dialogue_quotes("“A few years ago, we handled a case.") is True


# ---------------------------------------------------------------------------
# 4. Linguistics: Hardened character name & alias validator
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "garbage",
    [
        "she spoke",
        "he sincerely chanted",
        "Klein asked.",
        "Klein replied without hesitation,",
        "Klein said succinctly",
        "Leonard briefly explained.",
        "Danitz replied disdainfully",
        "slowly said",
        "painfully said",
        "while muttering,",
        "After a few seconds, he said",
        "Dunn nodded faintly",
        "the bartender said indifferently",
        "The elderly voice",
        "melodious female voice",
        "a woman's voice",
        "stout man",
        "the real fortune-teller",
        "the Apothecary",
        "The same Mandated Punisher",
        "The few Mandated Punishers",
        "his adjutant",
        "His mistress happily responded",
    ],
)
def test_invalid_lotm_garbage_names_rejected(garbage: str):
    assert is_invalid_character_name(garbage) is True, f"Should reject {garbage!r}"


@pytest.mark.parametrize(
    "valid",
    [
        "Klein",
        "Klein Moretti",
        "The Fool",
        "The World",
        "Old Neil",
        "Dunn Smith",
        "Leonard Mitchell",
        "Fors Wall",
        "Emlyn White",
        "Anderson Hood",
        "Sea Wolf Johnson",
        "Admiral of Stars",
        "Mr. Azik",
        "Miss Justice",
        "Arrodes",
        "General Male",
        "General Female",
    ],
)
def test_valid_lotm_names_accepted(valid: str):
    assert is_invalid_character_name(valid) is False, f"Should accept {valid!r}"


# ---------------------------------------------------------------------------
# 5. Stage B: Canonical speaker deduplication & alias bible sanitization
# ---------------------------------------------------------------------------


def test_canonical_speaker_deduplicates_first_and_full_names_without_merging_siblings():
    known = [
        {"canonical_name": "Dunn", "aliases": ["said", "Dunn nodded faintly"], "gender": "male"},
        {"canonical_name": "Leonard", "aliases": [], "gender": "male"},
        {"canonical_name": "Emlyn White", "aliases": [], "gender": "male"},
        {"canonical_name": "Danitz", "aliases": [], "gender": "male"},
        {"canonical_name": "Klein Moretti", "aliases": [], "gender": "male"},
        {"canonical_name": "Benson Moretti", "aliases": [], "gender": "male"},
        {"canonical_name": "Melissa Moretti", "aliases": [], "gender": "female"},
    ]

    assert StageBTaggingService.resolve_canonical_speaker("Dunn Smith", known)[0] == "Dunn"
    assert StageBTaggingService.resolve_canonical_speaker("Leonard Mitchell", known)[0] == "Leonard"
    assert StageBTaggingService.resolve_canonical_speaker("Emlyn", known)[0] == "Emlyn White"
    assert StageBTaggingService.resolve_canonical_speaker("Blazing Danitz", known)[0] == "Danitz"

    # Siblings sharing surname "Moretti" must NEVER collide
    assert StageBTaggingService.resolve_canonical_speaker("Klein", known)[0] == "Klein Moretti"
    assert StageBTaggingService.resolve_canonical_speaker("Benson", known)[0] == "Benson Moretti"
    assert StageBTaggingService.resolve_canonical_speaker("Melissa", known)[0] == "Melissa Moretti"

    # Polluted legacy aliases must NEVER match
    assert StageBTaggingService.resolve_canonical_speaker("said", known)[0] == "General Male"
    assert StageBTaggingService.resolve_canonical_speaker("Dunn nodded faintly", known)[0] == "General Male"


def test_select_alias_reference_bible_strips_polluted_aliases_and_caps_size():
    known = [
        {
            "canonical_name": "Klein",
            "aliases": [
                "said",
                "After a few seconds, he said",
                "Gehrman Sparrow",
                "Dwayne Dantès",
                "Sherlock Moriarty",
                "she spoke",
            ],
            "gender": "male",
            "line_count": 7000,
        },
        {
            "canonical_name": "she spoke",
            "aliases": [],
            "gender": "female",
            "line_count": 2,
        },
    ]
    bible = StageBTaggingService._select_alias_reference_bible(known, max_entries=10)
    assert len(bible) == 1
    assert bible[0]["canonical_name"] == "Klein"
    assert bible[0]["aliases"] == ["Gehrman Sparrow", "Dwayne Dantès", "Sherlock Moriarty"]


# ---------------------------------------------------------------------------
# 6. Stage B: Contextual fallback when LLM misses targets + Narrator vs thought
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_llm_missed_targets_use_neighboring_narration_and_narrator_is_not_thought():
    segs = [
        ScriptSegmentModel(id="s1", chapter_id="c1", order_index=0, text="“It’s a revolver,”", is_dialogue=True, delivery_type="dialogue"),
        ScriptSegmentModel(id="s2", chapter_id="c1", order_index=1, text="answered Klein honestly.", is_dialogue=False, delivery_type="narration"),
        ScriptSegmentModel(id="s3", chapter_id="c1", order_index=2, text="Old Neil stood up and said,", is_dialogue=False, delivery_type="narration"),
        ScriptSegmentModel(id="s4", chapter_id="c1", order_index=3, text="“There’s no need to record it.”", is_dialogue=True, delivery_type="dialogue"),
        ScriptSegmentModel(id="s5", chapter_id="c1", order_index=4, text="“Everyone will die, including me.”", is_dialogue=True, delivery_type="dialogue"),
    ]

    # Simulate LLM returning only s5 as Narrator (not thought) with a polluted raw_speaker_tag,
    # while missing s1 and s4 (e.g. truncated JSON response).
    mock_payload = {
        "choices": [
            {
                "finish_reason": "stop",
                "message": {
                    "content": (
                        '{"dialogue_attributions": ['
                        '{"segment_id": "s5", "speaker": "Narrator", "gender": "neutral", '
                        '"raw_speaker_tag": "After a few seconds, he said", "is_internal_thought": false, "confidence": 0.95}'
                        '], "merge_spans": []}'
                    )
                },
            }
        ],
        "usage": {},
    }

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = mock_payload
    mock_resp.raise_for_status = MagicMock()

    mock_client = AsyncMock()
    mock_client.__aenter__.return_value = mock_client
    mock_client.__aexit__.return_value = None
    mock_client.post.return_value = mock_resp

    with (
        patch("app.services.tagger.settings.DEEPSEEK_API_KEY", "test-key"),
        patch("app.services.tagger.httpx.AsyncClient", return_value=mock_client),
    ):
        decisions, _ = await StageBTaggingService.tag_window_with_deepseek(
            window_segments=segs,
            prior_decisions=[],
            project_settings={},
            allow_offline_heuristic=False,
            known_characters=[
                {"canonical_name": "Klein", "aliases": [], "gender": "male"},
                {"canonical_name": "Old Neil", "aliases": [], "gender": "male"},
            ],
        )

    by_id = {d["segment_id"]: d for d in decisions}
    # s1 and s4 must recover Klein and Old Neil from adjacent narration instead of collapsing to General Male
    assert by_id["s1"]["speaker"] == "Klein"
    assert by_id["s4"]["speaker"] == "Old Neil"
    # s5 returned speaker="Narrator", is_internal_thought=False -> narration, NOT internal_thought!
    assert by_id["s5"]["delivery_type"] == "narration"
    assert by_id["s5"]["is_internal_thought"] is False
    assert by_id["s5"]["raw_speaker_tag"] is None
