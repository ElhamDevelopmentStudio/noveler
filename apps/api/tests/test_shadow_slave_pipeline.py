from app.models.chapter import ScriptSegmentModel
from app.schemas.chapter import ParseOptionsSchema
from app.services.parser import ManuscriptParserService
from app.services.tagger import StageBTaggingService


def test_shadow_slave_spell_notifications():
    options = ParseOptionsSchema(separate_sentence_wise=True)

    text = """
[Aspirant! Welcome to the Nightmare Spell. Prepare for your First Trial...]

[You have slain a dormant beast, Mountain King's Larva.]

[Child of Shadows, receive your blessing!]

[Wake up, Sunless! Your nightmare is over.]

[You have been bestowed a True Name: Lost from Light.]

[Aspect Rank: Divine.]

[Aspect Name: Shadow Slave.]

[The First Seal is broken.]

[Awakening Aspect Ability...]
"""
    segments = ManuscriptParserService.segment_text(text, options)

    for seg in segments:
        assert seg.is_dialogue is False, f"Expected system prompt, got dialogue for: {seg.text}"
        assert seg.delivery_type == "system_prompt"
        assert seg.speaker == "System / Interface"


def test_shadow_slave_status_screens_and_descriptions():
    options = ParseOptionsSchema(separate_sentence_wise=True)

    text = """Name: Sunless.
True Name: Lost from Light.
Rank: Dreamer.
Shadow Core: Dormant.
Memories: [Silver Bell], [Puppeteer's Shroud].
Echoes: —
Attributes: [Fated], [Mark of Divinity], [Child of Shadows].
Aspect: [Shadow Slave].
Aspect Rank: Divine.
Flaw: [Clear Conscience].

[Fated] Attribute Description: "The strings of fate wrap tightly around you. Unlikely events, both good and bad, are drawn to you like moths to a flame."

[Where is my eye?] Enchantment Description: "Helps the wielder peer into the tapestry of Fate."
"""
    segments = ManuscriptParserService.segment_text(text, options)

    # All segments in this block are system prompts
    for seg in segments:
        assert seg.is_dialogue is False, f"Expected is_dialogue=False, got {seg.is_dialogue} for: {seg.text}"
        assert seg.delivery_type == "system_prompt", f"Expected system_prompt, got {seg.delivery_type} for: {seg.text}"
        assert seg.speaker == "System / Interface"


def test_shadow_slave_dialogue_vs_thoughts_and_offline_tagging():
    options = ParseOptionsSchema(separate_sentence_wise=True)

    text = """Inside, a tired-looking officer gave him a quick glance.

"Are you lost, boy?"

Sunny cleared his throat.

"Uh, no."

'No useless Aspects my ass!'
"""
    segments = ManuscriptParserService.segment_text(text, options)

    # Dialogue 1: "Are you lost, boy?"
    d1 = [s for s in segments if "Are you lost" in s.text][0]
    assert d1.is_dialogue is True
    assert d1.delivery_type == "dialogue"

    # Dialogue 2: "Uh, no."
    d2 = [s for s in segments if "Uh, no." in s.text][0]
    assert d2.is_dialogue is True
    assert d2.delivery_type == "dialogue"

    # Thought: 'No useless Aspects my ass!'
    th = [s for s in segments if "No useless Aspects" in s.text][0]
    assert th.delivery_type == "internal_thought"
    assert th.is_internal_thought is True

    # Now verify Stage B offline attribution
    db_segs = [
        ScriptSegmentModel(
            id=f"seg-{i}",
            chapter_id="chap-test",
            order_index=i,
            text=s.text,
            is_dialogue=s.is_dialogue,
            delivery_type=s.delivery_type,
            is_internal_thought=s.is_internal_thought,
            speaker=s.speaker,
        )
        for i, s in enumerate(segments)
    ]

    decisions = StageBTaggingService.apply_local_heuristic_attribution(
        db_segs,
        project_settings={"paralinguistic_tags_enabled": True},
        known_characters=[{"canonical_name": "Sunny", "gender": "male", "aliases": ["Sunless"]}],
    )

    dec_map = {d["segment_id"]: d for d in decisions}

    # Thought must be attributed to Narrator with is_dialogue=False
    th_dec = dec_map[f"seg-{len(segments)-1}"]
    assert th_dec["delivery_type"] == "internal_thought"
    assert th_dec["is_dialogue"] is False
    assert th_dec["is_internal_thought"] is True
    assert th_dec["speaker"] == "Narrator"
