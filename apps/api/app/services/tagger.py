import asyncio
import json
import re
import time
from datetime import UTC, datetime
from typing import Any

import httpx
from app.core.config import settings
from app.db.session import get_session_factory
from app.models.chapter import ChapterModel, ScriptSegmentModel
from app.models.project import ProjectModel
from app.models.tagging_job import TaggingJobModel
from app.services.character import CharacterService
from app.services.parser import GAME_STAT_LINE_RE, QUOTE_SPAN_RE, SYSTEM_PROMPT_RE, ManuscriptParserService
from novelova_core.exceptions import NotFoundError
from novelova_core.linguistics import (
    SPEECH_VERBS,
    infer_name_gender,
    is_invalid_character_name,
)
from novelova_core.logging import setup_logger
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

logger = setup_logger("novelova.tagger")

ALLOWED_PARALINGUISTIC_TAGS = {
    "[laugh]": "laugh",
    "[sigh]": "sigh",
    "[gasp]": "gasp",
    "[groan]": "groan",
    "[chuckle]": "chuckle",
    "[cough]": "cough",
    "[sniff]": "sniff",
    "[shush]": "shush",
    "[clear throat]": "clear throat",
}

STAGE_B_SYSTEM_PROMPT = """You are an expert audiobook dialogue attribution and characterization engine.
Return strictly valid JSON only. Do not output Markdown codeblocks or conversational text.

Your mission:
You are provided with a narrative scene consisting of:
1. "project_context": Project configuration including "narrative_pov" (point of view mode and protagonist name) and "present_characters" (characters explicitly present or active in this immediate scene).
2. "alias_reference_bible": Known character dossier for the project (canonical names, aliases, genders) for alias resolution.
3. "recent_dialogue_context": Preceding dialogue attributions from earlier in the narrative.
4. "scene_transcript": The complete ordered text of the scene (including narration, descriptive exposition, and dialogue) so you have full narrative context.
5. "dialogue_targets": The specific dialogue segments requiring character attribution.

CRITICAL INSTRUCTION:
Attribute ONLY the dialogue segments listed in "dialogue_targets".
Do NOT output decisions or JSON objects for narration, descriptive prose, or system prompts.

1. Speaker Attribution Priority & Local Scene Presence:
   - For every target dialogue segment:
     - Check who is speaking in this immediate scene. The candidate MUST be either:
       a) One of the characters listed in "present_characters", OR
       b) A character explicitly introduced by name in this scene's narrative transcript (e.g., if a new character named "Yeriel" or "Julie" is introduced in the narration, attribute directly to "Yeriel" or "Julie"!).
     - CRITICAL PROHIBITION ON DOSSIER BROWSING:
       * "alias_reference_bible" is ONLY for resolving nicknames/aliases/titles (e.g., "Lord Deculein" -> "Deculein", "Section Chief" -> "Jeon Myeong-hoon") for characters WHO ARE ALREADY CONFIRMED PRESENT in this scene!
       * NEVER browse "alias_reference_bible" to pick a speaker who is not physically present in this scene!
       * NEVER force a past character (e.g., Earth contacts like "Lane", ex-lovers like "Yoo Ah-ra", characters from previous chapters or other locations) onto people in this scene!
       * If someone is mentioned only in a thought or memory (e.g. "Lane said that...", "I remembered Ah-ra"), they are NOT physically present and CANNOT speak!
     - Specify the speaker's gender ("male" or "female").
     - DOUBLE-QUOTED SPOKEN SPEECH ("...", “...”):
       * Double-quoted text represents words SPOKEN ALOUD (dialogue, soliloquies, muttering alone, casting spells, gasping, or talking in an empty room).
       * In audiobook production, spoken dialogue is ALWAYS voiced by the character (for first-person novels, the protagonist!), NEVER by the Narrator!
       * Always set "is_internal_thought": false and attribute to the speaking character (e.g., the protagonist or speaking entity).
     - SILENT INTERNAL THOUGHTS ('...', ‘...’):
       * ONLY text enclosed in SINGLE QUOTES ('...' or ‘...’) or unspoken mental prose represents silent thoughts.
       * Silent internal thoughts are voiced by the Narrator ("speaker": "Narrator", "gender": "neutral", "is_internal_thought": true).
       * NEVER attribute double-quoted speech ("...") to "Narrator"!

2. Point of View (POV) & First-Person Protagonist Handling:
   - Check "narrative_pov" in "project_context".
   - When the narrative is in First-Person ("mode": "first_person"):
     * The story is experienced and narrated by the protagonist using "I", "me", "my".
     * In reincarnation/transmigration novels, "I" possesses or becomes an in-world character (e.g., Kim Woojin possessing Deculein). Spoken lines by the protagonist in the new world belong to their in-world canonical identity (e.g. "Deculein").
     * When the first-person protagonist SPEAKS ALOUD in double quotes ("...", “...”)—including dialogue, soliloquies, muttering alone in a room/mirror, or answering others—attribute the line to the protagonist's canonical name (e.g. "Deculein"). NEVER attribute double-quoted speech to "I", "Me", or "Narrator"!
     * When other characters address the first-person narrator (e.g. "Professor, here you go!" or "Good day, master!" or "Young master, are you okay?"), the SPEAKER is the other character, and the protagonist is the addressee/listener!

3. Anonymous & Minor Character Fallback (STRICT RULE):
   - When a speaker is an unnamed background character (assistant, assistant magician, attendant, maid, servant, driver, chauffeur, receptionist, student, soldier, guard, passerby, crowd):
     * Attribute to "General Male" if male, or "General Female" if female.
     * NEVER invent or guess a name from "alias_reference_bible" for an unnamed character! If the narrative calls them "some small fellow", "the magician", "attendant", "young maid", they are UNNAMED: use "General Male" or "General Female"!
     * "General Male" and "General Female" are completely valid partners in two-person dialogue (e.g., Turn 1: Deculein, Turn 2: General Male, Turn 3: Deculein, Turn 4: General Male).

4. Turn-Taking Alternation in Dialogue Chains (Ping-Pong Dialogue):
   - In rapid-fire exchanges where two characters speak back-and-forth without explicit speech tags ("Did you see him?" / "No." / "Where did he go?" / "Toward the gate."):
     - Characters strictly ALTERNATE turns (Character A, Character B, Character A, Character B).
     - NEVER attribute consecutive untagged dialogue turns to the same character in a two-person back-and-forth conversation. Maintain parity across the entire unbroken exchange.

5. Soliloquies and Monologues:
   - When a character is alone in a room, dressing room, bathroom, or looking in a mirror talking aloud to themselves (e.g. "Woojin.", "Kim Woojin.", "That's your name."), all lines belong to that character (the protagonist).
   - NEVER alternate or ping-pong soliloquies with another character!

6. Paralinguistic Sound Tags:
   ONLY when explicitly indicated by the surrounding narrative, assign one of:
   [laugh], [sigh], [gasp], [groan], [chuckle], [cough], [sniff], [shush], [clear throat].
   Otherwise null.

7. Vocative Addressees vs. Speakers:
   - Carefully distinguish who is SPEAKING from who is being ADDRESSED.
   - When a dialogue line says "Young master, are you okay?" or "Sir!" or "Father?" or "Professor!", that title is the person being spoken TO (the addressee/listener), NOT the speaker!
   - NEVER attribute a line to a bare title of address ("Young master", "Sir", "Milord", "My Lady", "Doctor", "Father") unless it is an established canonical character. If the speaker is an unnamed attendant, guard, or servant, attribute to "General Male" or "General Female".

8. Discourse Markers vs. Speech Verbs:
   - Narrative transitional phrases such as "That said,", "Having said that,", "So said the legend" are discourse markers, NOT character speech tags.
   - NEVER attribute dialogue to characters named "That", "Having", "So", etc.

9. Structural Fragment Merging ("merge_spans"):
   - Inspect "scene_transcript" for segments that were accidentally fragmented or split by formatting:
     a) Multi-line system status windows, stat listings, skill trees, or quest notifications that should be voiced together as one window:
        Merge them into target_delivery_type: "system_prompt", target_speaker: "System / Interface".
     b) Fragmented narrative sentences (e.g. an incomplete sentence broken mid-thought or around brackets/terms without ending punctuation):
        Merge them into target_delivery_type: "narration", target_speaker: "Narrator".
     c) Broken dialogue turns belonging to the exact same speaker turn without narrative interruption:
        Merge them into target_delivery_type: "dialogue", target_speaker: <character>.
   - STRICT SAFETY INVARIANTS:
     * ONLY merge strictly contiguous segments in "scene_transcript" (from start_segment_id through end_segment_id).
     * NEVER merge across dialogue boundaries. Spoken character dialogue (in quotes or starting with a dialogue dash ─, —, -, etc.) must NEVER be merged with narration or system prompts! Only merge system prompts with system prompts, narration with narration, or split dialogue turns from the exact same speaker.
     * Do NOT output, rewrite, or alter text strings; the engine deterministically concatenates the original manuscript text.
     * If no merging is needed in this window, provide an empty list: "merge_spans": [].

JSON schema:
{
  "dialogue_attributions": [
    {
      "segment_id": "string",
      "speaker": "string",
      "gender": "male" | "female" | "neutral",
      "raw_speaker_tag": "string" | null,
      "paralinguistic_tag": "string" | null,
      "confidence": 0.0 - 1.0,
      "is_internal_thought": false
    }
  ],
  "merge_spans": [
    {
      "start_segment_id": "string",
      "end_segment_id": "string",
      "target_speaker": "string",
      "target_delivery_type": "system_prompt" | "narration" | "dialogue"
    }
  ]
}
"""


class DeepSeekAPIError(Exception):
    def __init__(
        self,
        message: str,
        error_type: str = "api_error",
        status_code: int | None = None,
    ):
        super().__init__(message)
        self.message = message
        self.error_type = error_type
        self.status_code = status_code


# Active in-memory task tracking to prevent garbage collection and allow cancellation
ACTIVE_TAGGING_TASKS: dict[str, asyncio.Task] = {}


class StageBTaggingService:
    @classmethod
    def filter_paralinguistic_tag(
        cls,
        tag: Any,
        project_settings: dict[str, Any] | None,
    ) -> str | None:
        """
        Enforce project settings and strict 9 allowed tags constraint.
        Accepts str, list/tuple/set, dict, or None gracefully.
        """
        if not tag:
            return None

        # If tag is a list/tuple/set, inspect each element to find the first valid allowed tag
        if isinstance(tag, (list, tuple, set)):
            for item in tag:
                res = cls.filter_paralinguistic_tag(item, project_settings)
                if res:
                    return res
            return None

        # If tag is a dict, inspect common tag keys
        if isinstance(tag, dict):
            for k in ("tag", "paralinguistic_tag", "name", "value", "type", "label"):
                if k in tag:
                    res = cls.filter_paralinguistic_tag(tag[k], project_settings)
                    if res:
                        return res
            return None

        if not isinstance(tag, str):
            return None

        cleaned = tag.strip().lower()
        if not cleaned or cleaned in {"none", "null", "n/a", "false", "[]", "{}", "undefined"}:
            return None

        # Normalize bracketed and unbracketed forms (e.g. "[sigh]", "sigh", "[Sigh]")
        bare = cleaned.strip("[]").strip()
        canonical = None
        for allowed_tag, allowed_key in ALLOWED_PARALINGUISTIC_TAGS.items():
            if (
                allowed_tag.lower() == cleaned
                or allowed_key.lower() == bare
                or allowed_key.lower() == cleaned
            ):
                canonical = allowed_tag
                break

        if not canonical:
            return None

        cfg = project_settings or {}
        if not cfg.get("paralinguistic_tags_enabled", True):
            return None

        tag_key = ALLOWED_PARALINGUISTIC_TAGS[canonical]
        active_tags = cfg.get("active_paralinguistic_tags", {})
        if not active_tags.get(tag_key, True):
            return None

        return canonical

    @staticmethod
    def is_invalid_character_name(name: str | None) -> bool:
        """Expose linguistic validator on tagger service."""
        return is_invalid_character_name(name)

    @staticmethod
    def infer_name_gender(name: str | None) -> str:
        """Expose name-to-gender heuristic fallback on tagger service."""
        return infer_name_gender(name)

    @classmethod
    def find_textual_speaker_tag(cls, text: str) -> str | None:
        """
        Check if text has an explicit speech tag pattern naming a person in surrounding narration.
        e.g., 'said Holmes', 'Watson whispered', 'she warned'.
        Strips quoted dialogue so words spoken INSIDE dialogue are never matched as speech tags.
        Returns candidate string or None.
        """
        if not text:
            return None

        # Strip quoted spans so words spoken INSIDE dialogue (e.g. "That said, ...") are never treated as tags
        unquoted = QUOTE_SPAN_RE.sub(" ", text).strip()
        if not unquoted:
            return None

        verb_after = re.search(
            rf'(?:{SPEECH_VERBS})\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)',
            unquoted,
        )
        verb_before = re.search(
            rf'([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:{SPEECH_VERBS})',
            unquoted,
        )
        candidate = None
        if verb_after:
            candidate = verb_after.group(1).strip()
        elif verb_before:
            candidate = verb_before.group(1).strip()

        if candidate and not cls.is_invalid_character_name(candidate):
            return candidate
        return None

    @classmethod
    def has_dialogue_quotes(cls, text: str) -> bool:
        """Check if text contains dialogue quotes, ignoring word contractions and inline single-quoted terms."""
        if not text:
            return False
        if ManuscriptParserService.is_dash_dialogue(text):
            return True
        t_stripped = text.strip()
        # LitRPG system notifications and bracketed stat screens are NOT dialogue quotes
        if bool(SYSTEM_PROMPT_RE.search(t_stripped)) or ManuscriptParserService.is_short_bracket_system_prompt(t_stripped):
            return False
        prot, _ = ManuscriptParserService.protect_contractions(text)
        prot, _ = ManuscriptParserService.protect_inline_single_quotes(prot)
        prot, _ = ManuscriptParserService.protect_inline_brackets(prot)
        return bool(QUOTE_SPAN_RE.search(prot))

    @classmethod
    def resolve_canonical_speaker(
        cls,
        speaker: str | None,
        known_characters: list[dict[str, Any]] | None = None,
    ) -> tuple[str, str, str | None]:
        """
        Given a speaker string or tag, resolve against known characters and aliases.
        Returns (canonical_name, gender, raw_speaker_tag_or_none).
        """
        if not speaker:
            return "General Male", "male", None

        cleaned = speaker.strip()
        cleaned_lower = cleaned.lower()

        if cleaned_lower in ("narrator",):
            return "Narrator", "neutral", None
        if cleaned_lower in ("system", "system / interface"):
            return "System / Interface", "neutral", None

        if not known_characters:
            if cls.is_invalid_character_name(cleaned):
                fallback_gender = cls.infer_name_gender(cleaned)
                fallback_name = "General Female" if fallback_gender == "female" else "General Male"
                return fallback_name, fallback_gender, cleaned
            return cleaned, cls.infer_name_gender(cleaned), None

        # 1. Exact match on canonical_name of a valid character
        for char in known_characters:
            c_name = char.get("canonical_name", "")
            if c_name and not cls.is_invalid_character_name(c_name) and c_name.lower() == cleaned_lower:
                return c_name, char.get("gender", cls.infer_name_gender(c_name)), None

        # 2. Exact match on aliases of a valid character
        for char in known_characters:
            c_name = char.get("canonical_name", "")
            if cls.is_invalid_character_name(c_name):
                continue
            aliases = char.get("aliases") or []
            for alias in aliases:
                if alias and alias.lower() == cleaned_lower:
                    return c_name, char.get("gender", cls.infer_name_gender(c_name)), cleaned

        # 3. Match title/rank patterns (e.g. "Section Chief Jeon", "Elder Jeon", "Senior Brother Jeon")
        # Check if any known character shares a distinctive name token (e.g. "Jeon") with cleaned
        title_prefixes = {
            "director", "section", "chief", "elder", "patriarch", "senior",
            "junior", "brother", "sister", "captain", "lord", "lady", "master",
            "manager", "deputy", "officer", "doctor", "dr.", "professor", "prof.",
        }
        cleaned_tokens = set(re.findall(r"\w+", cleaned_lower))
        has_title = bool(cleaned_tokens & title_prefixes)

        if has_title:
            for char in known_characters:
                c_name = char.get("canonical_name", "")
                if cls.is_invalid_character_name(c_name):
                    continue
                aliases = char.get("aliases") or []
                all_idents = [c_name] + list(aliases)
                for ident in all_idents:
                    ident_tokens = set(re.findall(r"\w+", ident.lower()))
                    # Look for non-title distinctive name parts (at least 3 chars)
                    distinctive_matches = {
                        tok for tok in (ident_tokens & cleaned_tokens)
                        if tok not in title_prefixes and len(tok) >= 3
                    }
                    if distinctive_matches:
                        return c_name, char.get("gender", cls.infer_name_gender(c_name)), cleaned

        # 4. Reject invalid standalone character names (discourse markers, bare vocatives, pronouns)
        if cls.is_invalid_character_name(cleaned):
            fallback_gender = cls.infer_name_gender(cleaned)
            fallback_name = "General Female" if fallback_gender == "female" else "General Male"
            return fallback_name, fallback_gender, cleaned

        return cleaned, cls.infer_name_gender(cleaned), None

    @classmethod
    def enforce_dialogue_chain_turn_taking(
        cls,
        segments: list[ScriptSegmentModel],
        decisions: list[dict[str, Any]],
        known_characters: list[dict[str, Any]] | None = None,
        prior_decisions: list[dict[str, Any]] | None = None,
    ) -> list[dict[str, Any]]:
        """
        Post-attribution turn-taking validator.
        1. Enforces identical speaker attribution on split-dialogue parts sharing parent_turn_id.
        2. Detects ping-pong dialogue chains (dialogue_chain_id).
        3. Identifies explicit anchor turns (named speech tags).
        4. Validates alternating turn-taking parity and back-propagates anchors across untagged lines.
        """
        if not decisions or not segments:
            return decisions

        dec_map = {d["segment_id"]: d for d in decisions if "segment_id" in d}

        # Step 1: Synchronize split-dialogue pairs (starts_phrase <-> completes_phrase)
        parent_turn_groups: dict[str, list[ScriptSegmentModel]] = {}
        for s in segments:
            if s.parent_turn_id:
                parent_turn_groups.setdefault(s.parent_turn_id, []).append(s)

        for turn_id, group_segs in parent_turn_groups.items():
            dialogue_segs = [s for s in group_segs if s.is_dialogue or dec_map.get(s.id, {}).get("is_dialogue")]
            if len(dialogue_segs) < 2:
                continue

            best_dec = None
            for s in dialogue_segs:
                d = dec_map.get(s.id)
                if not d:
                    continue
                if d.get("speaker") and d["speaker"] not in {"General Male", "General Female", "Narrator", "System / Interface"}:
                    best_dec = d
                    break
            if not best_dec and dialogue_segs:
                best_dec = dec_map.get(dialogue_segs[0].id)

            if best_dec:
                target_speaker = best_dec.get("speaker", "General Male")
                target_gender = best_dec.get("gender", "male")
                target_raw = best_dec.get("raw_speaker_tag")
                for s in dialogue_segs:
                    d = dec_map.get(s.id)
                    if d:
                        d["speaker"] = target_speaker
                        d["gender"] = target_gender
                        d["is_dialogue"] = True
                        d["delivery_type"] = "dialogue"
                        d["is_internal_thought"] = False
                        if target_raw and not d.get("raw_speaker_tag"):
                            d["raw_speaker_tag"] = target_raw

        # Step 2: Group dialogue segments by dialogue_chain_id
        chains: dict[str, list[ScriptSegmentModel]] = {}
        for s in segments:
            if s.dialogue_chain_id and (s.is_dialogue or dec_map.get(s.id, {}).get("is_dialogue")):
                chains.setdefault(s.dialogue_chain_id, []).append(s)

        for chain_id, chain_segs in chains.items():
            chain_segs_sorted = sorted(chain_segs, key=lambda x: x.order_index)
            # Group into turns: consecutive segments sharing parent_turn_id belong to one turn
            turns: list[list[ScriptSegmentModel]] = []
            for s in chain_segs_sorted:
                if (
                    turns
                    and s.parent_turn_id
                    and turns[-1][0].parent_turn_id == s.parent_turn_id
                ):
                    turns[-1].append(s)
                else:
                    turns.append([s])

            if len(turns) < 2:
                continue

            # Identify anchors for each turn
            anchors: dict[int, tuple[str, str, str | None]] = {}

            for t_idx, turn_segs in enumerate(turns):
                found_anchor = None
                for s in turn_segs:
                    d = dec_map.get(s.id)
                    if not d:
                        continue

                    raw_tag = d.get("raw_speaker_tag") or getattr(s, "raw_speaker_tag", None)
                    spk = d.get("speaker")

                    # Check textual speech verb in narrative context
                    match = cls.find_textual_speaker_tag(s.text)
                    if match and not cls.is_invalid_character_name(match):
                        canonical, can_gnd, _ = cls.resolve_canonical_speaker(match, known_characters)
                        if canonical not in {"General Male", "General Female", "Narrator", "System / Interface"}:
                            found_anchor = (canonical, can_gnd, match)
                            break

                    # Check decision raw_speaker_tag
                    if raw_tag and raw_tag not in {"General Male", "General Female", "Narrator"}:
                        if not cls.is_invalid_character_name(raw_tag):
                            canonical, can_gnd, _ = cls.resolve_canonical_speaker(raw_tag, known_characters)
                            if canonical not in {"General Male", "General Female", "Narrator", "System / Interface"}:
                                found_anchor = (canonical, can_gnd, raw_tag)
                                break

                    # Check decision speaker if named character with high confidence
                    if spk and spk not in {"General Male", "General Female", "Narrator", "System / Interface"}:
                        if not cls.is_invalid_character_name(spk):
                            if float(d.get("confidence", 0.0)) >= 0.8:
                                canonical, can_gnd, rtag = cls.resolve_canonical_speaker(spk, known_characters)
                                if canonical not in {"General Male", "General Female", "Narrator", "System / Interface"}:
                                    found_anchor = (canonical, can_gnd, rtag or spk)
                                    break

                if found_anchor:
                    anchors[t_idx] = found_anchor

            unique_speakers = list(dict.fromkeys(name for name, _, _ in anchors.values()))

            # Collect all distinct named character entities present in this dialogue chain
            chain_named_speakers: set[str] = set()
            for turn_segs in turns:
                for s in turn_segs:
                    d = dec_map.get(s.id)
                    if d:
                        spk = d.get("speaker")
                        if spk and spk not in {"Narrator", "System / Interface", "General Male", "General Female"}:
                            canonical, _, _ = cls.resolve_canonical_speaker(spk, known_characters)
                            chain_named_speakers.add(canonical)

            for name, _, _ in anchors.values():
                if name not in {"Narrator", "System / Interface", "General Male", "General Female"}:
                    chain_named_speakers.add(name)

            # Issue #1: If 3 or more distinct characters participate in this chain,
            # this is a multi-character group conversation. Do NOT force a binary alternating tennis match.
            if len(chain_named_speakers) >= 3 or len(unique_speakers) >= 3:
                logger.debug(
                    "Dialogue chain %s contains %d distinct speakers; preserving individual multi-speaker attributions",
                    chain_id,
                    len(chain_named_speakers),
                )
                continue

            speaker_a: tuple[str, str] | None = None
            speaker_b: tuple[str, str] | None = None
            anchor_idx: int | None = None

            if len(unique_speakers) == 2:
                first_t_idx = min(anchors.keys())
                name_a, gnd_a, _ = anchors[first_t_idx]
                speaker_a = (name_a, gnd_a)

                for t_idx, (name, gnd, _) in anchors.items():
                    if name != name_a:
                        speaker_b = (name, gnd)
                        break
                anchor_idx = first_t_idx

                # Check if parity is consistent across all anchors
                parity_consistent = True
                for t_idx, (name, _, _) in anchors.items():
                    expected_name = speaker_a[0] if ((t_idx - anchor_idx) % 2 == 0) else speaker_b[0]
                    if name != expected_name:
                        parity_consistent = False
                        break

                if not parity_consistent:
                    continue

            elif len(unique_speakers) == 1:
                anchor_idx, (name_a, gnd_a, _) = next(iter(anchors.items()))
                speaker_a = (name_a, gnd_a)

                other_candidates: list[str] = []
                has_untagged_turn = False
                for t_idx, turn_segs in enumerate(turns):
                    if t_idx not in anchors:
                        has_untagged_turn = True
                    for s in turn_segs:
                        d = dec_map.get(s.id)
                        if d:
                            spk = d.get("speaker")
                            if spk and spk != name_a and spk not in {"Narrator", "System / Interface", "General Male", "General Female"}:
                                other_candidates.append(spk)

                # Check if all decisions in this chain already agree on name_a (monologue / soliloquy)
                all_assigned_to_name_a = all(
                    dec_map.get(s.id, {}).get("speaker") == name_a
                    for turn_segs in turns
                    for s in turn_segs
                    if s.id in dec_map
                )
                if not has_untagged_turn or all_assigned_to_name_a:
                    continue

                # If other candidates contain multiple distinct named characters, this is a group conversation
                distinct_others = {
                    cls.resolve_canonical_speaker(cand, known_characters)[0]
                    for cand in other_candidates
                }
                if len(distinct_others) >= 2:
                    continue

                if other_candidates:
                    best_other = max(set(other_candidates), key=other_candidates.count)
                    can_other, gnd_other, _ = cls.resolve_canonical_speaker(best_other, known_characters)
                    speaker_b = (can_other, gnd_other)
                elif prior_decisions and has_untagged_turn:
                    # Only borrow prior speaker if there are low-confidence untagged turns (e.g. offline heuristic 0.5)
                    # and no intervening scene break between prior decisions and this chain
                    has_low_confidence_turn = any(
                        float(dec_map.get(s.id, {}).get("confidence", 1.0)) < 0.8
                        for turn_segs in turns
                        for s in turn_segs
                    )
                    chain_first_seg = turns[0][0]
                    chain_start_idx = next((i for i, s in enumerate(segments) if s.id == chain_first_seg.id), 0)
                    has_scene_divider_before_chain = any(
                        cls.is_scene_boundary(s) or bool(cls.SCENE_DIVIDER_RE.search(s.text.strip()))
                        for s in segments[:chain_start_idx]
                    )

                    if has_low_confidence_turn and not has_scene_divider_before_chain:
                        for pd in reversed(prior_decisions[-8:]):
                            spk = pd.get("speaker")
                            if spk and spk != name_a and spk not in {"Narrator", "System / Interface", "General Male", "General Female"}:
                                if not cls.is_invalid_character_name(spk):
                                    can_other, gnd_other, _ = cls.resolve_canonical_speaker(spk, known_characters)
                                    speaker_b = (can_other, gnd_other)
                                    break

                if not speaker_b:
                    # Do NOT invent or pluck an unmentioned character from known_characters.
                    # Do NOT force alternating turns when only 1 speaker is present without an established partner.
                    # Monologues and soliloquies remain intact.
                    continue

            elif len(unique_speakers) == 0:
                chain_speakers = [
                    dec_map[s.id].get("speaker")
                    for turn_segs in turns
                    for s in turn_segs
                    if s.id in dec_map and dec_map[s.id].get("speaker") not in {"Narrator", "System / Interface", "General Male", "General Female"}
                ]
                distinct = list(dict.fromkeys(s for s in chain_speakers if s))
                # Only enforce alternating parity if exactly two distinct speakers are found
                if len(distinct) == 2:
                    name_a = distinct[0]
                    name_b = distinct[1]
                    can_a, gnd_a, _ = cls.resolve_canonical_speaker(name_a, known_characters)
                    can_b, gnd_b, _ = cls.resolve_canonical_speaker(name_b, known_characters)
                    speaker_a = (can_a, gnd_a)
                    speaker_b = (can_b, gnd_b)
                    anchor_idx = 0

            if speaker_a and speaker_b and anchor_idx is not None:
                for t_idx, turn_segs in enumerate(turns):
                    is_turn_a = ((t_idx - anchor_idx) % 2 == 0)
                    assigned_speaker, assigned_gender = speaker_a if is_turn_a else speaker_b

                    for s in turn_segs:
                        d = dec_map.get(s.id)
                        if d:
                            d["speaker"] = assigned_speaker
                            d["gender"] = assigned_gender
                            d["is_dialogue"] = True
                            d["delivery_type"] = "dialogue"
                            d["is_internal_thought"] = False

        return decisions

    @classmethod
    def apply_local_heuristic_attribution(
        cls,
        segments: list[ScriptSegmentModel],
        project_settings: dict[str, Any] | None,
        known_characters: list[dict[str, Any]] | None = None,
    ) -> list[dict[str, Any]]:
        """
        Local deterministic heuristic attribution with turn-taking parity validation and alias resolution.
        """
        decisions: list[dict[str, Any]] = []

        for idx, seg in enumerate(segments):
            text_stripped = seg.text.strip()
            is_diag = seg.is_dialogue or cls.has_dialogue_quotes(seg.text) or ManuscriptParserService.is_dash_dialogue(text_stripped)

            is_sys = (
                not is_diag
                and (
                    getattr(seg, "delivery_type", "") == "system_prompt"
                    or bool(SYSTEM_PROMPT_RE.search(text_stripped))
                    or ManuscriptParserService.is_short_bracket_system_prompt(text_stripped)
                    or bool(GAME_STAT_LINE_RE.search(text_stripped))
                )
            )
            if is_sys:
                decisions.append({
                    "segment_id": seg.id,
                    "delivery_type": "system_prompt",
                    "is_dialogue": False,
                    "is_internal_thought": False,
                    "speaker": "System / Interface",
                    "raw_speaker_tag": None,
                    "gender": "neutral",
                    "paralinguistic_tag": None,
                    "confidence": 1.0,
                })
                continue

            is_single_quote_thought = bool(
                re.match(r"^['‘\u2018].+['’\u2019][.?!]?$", text_stripped)
                or re.match(r"^['‘\u2018].+[.?!]['’\u2019]$", text_stripped)
            )
            is_thought_seg = bool(
                getattr(seg, "delivery_type", "") == "internal_thought"
                or getattr(seg, "is_internal_thought", False)
            )

            if not is_diag or is_thought_seg:
                deliv = "internal_thought" if (is_single_quote_thought or is_thought_seg) else "narration"
                decisions.append({
                    "segment_id": seg.id,
                    "delivery_type": deliv,
                    "is_dialogue": False,
                    "is_internal_thought": bool(is_single_quote_thought or is_thought_seg),
                    "speaker": "Narrator",
                    "raw_speaker_tag": None,
                    "gender": "neutral",
                    "paralinguistic_tag": None,
                    "confidence": 1.0,
                })
                continue

            # Look around in neighboring narration for dialogue tags
            context = seg.text
            if idx > 0 and not segments[idx - 1].is_dialogue:
                context = segments[idx - 1].text + " " + context
            if idx < len(segments) - 1 and not segments[idx + 1].is_dialogue:
                context = context + " " + segments[idx + 1].text

            candidate = cls.find_textual_speaker_tag(context)

            # If it was single-quoted thought without spoken speech verbs, classify as silent internal thought
            if is_single_quote_thought and not candidate:
                decisions.append({
                    "segment_id": seg.id,
                    "delivery_type": "internal_thought",
                    "is_dialogue": False,
                    "is_internal_thought": True,
                    "speaker": "Narrator",
                    "raw_speaker_tag": None,
                    "gender": "neutral",
                    "paralinguistic_tag": None,
                    "confidence": 0.95,
                })
                continue

            speaker = None
            gender = None
            raw_speaker_tag = None

            if candidate:
                canonical, can_gnd, raw_tag = cls.resolve_canonical_speaker(candidate, known_characters)
                speaker = canonical
                raw_speaker_tag = raw_tag or candidate
                gender = can_gnd

            # Inferred gender if context has pronouns or female name
            if re.search(r'\b(?:she|her|hers|woman|girl|lady|mother|sister)\b', context, re.IGNORECASE):
                gender = "female"
            elif re.search(r'\b(?:he|him|his|man|boy|gentleman|father|brother)\b', context, re.IGNORECASE):
                gender = "male"
            elif not gender:
                if speaker and (
                    speaker.lower() in {"mara", "elena", "clara", "sarah", "mary", "anna", "alice", "jane", "june", "emma"}
                    or any(speaker.startswith(title) for title in ("Mrs.", "Ms.", "Miss"))
                ):
                    gender = "female"

            final_gender = gender or "male"
            if not speaker:
                speaker = "General Female" if final_gender == "female" else "General Male"

            # Check paralinguistic sound cues in context
            paralinguistic_tag = None
            if re.search(r'\b(?:laughed|laughing|laughter|chuckled|chuckle)\b', context, re.IGNORECASE):
                paralinguistic_tag = "[laugh]"
            elif re.search(r'\b(?:sighed|sighing|sigh)\b', context, re.IGNORECASE):
                paralinguistic_tag = "[sigh]"
            elif re.search(r'\b(?:gasped|gasping|gasp)\b', context, re.IGNORECASE):
                paralinguistic_tag = "[gasp]"
            elif re.search(r'\b(?:groaned|groaning|groan)\b', context, re.IGNORECASE):
                paralinguistic_tag = "[groan]"
            elif re.search(r'\b(?:coughed|coughing|cough)\b', context, re.IGNORECASE):
                paralinguistic_tag = "[cough]"
            elif re.search(r'\b(?:sniffed|sniffing|sniff)\b', context, re.IGNORECASE):
                paralinguistic_tag = "[sniff]"
            elif re.search(r'\b(?:shushed|shushing|hushed)\b', context, re.IGNORECASE):
                paralinguistic_tag = "[shush]"
            elif re.search(r'\b(?:cleared\s+his\s+throat|cleared\s+her\s+throat|cleared\s+their\s+throat)\b', context, re.IGNORECASE):
                paralinguistic_tag = "[clear throat]"

            tag = cls.filter_paralinguistic_tag(paralinguistic_tag, project_settings)

            decisions.append({
                "segment_id": seg.id,
                "delivery_type": "dialogue",
                "is_dialogue": True,
                "is_internal_thought": False,
                "speaker": speaker,
                "raw_speaker_tag": raw_speaker_tag,
                "gender": final_gender,
                "paralinguistic_tag": tag,
                "confidence": 0.85 if speaker not in {"General Male", "General Female"} else 0.5,
            })

        decisions = cls.enforce_dialogue_chain_turn_taking(segments, decisions, known_characters)
        return decisions

    @classmethod
    def detect_narrative_pov(
        cls,
        segments: list[ScriptSegmentModel],
        project_settings: dict[str, Any] | None = None,
        known_characters: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        """
        Detect or resolve narrative Point of View (POV) and protagonist.
        Respects project settings overrides, or performs statistical pronoun
        and speech tag analysis across narrative prose.
        """
        cfg = project_settings or {}
        explicit_protagonist = cfg.get("pov_protagonist")
        explicit_mode = cfg.get("pov_mode")

        if explicit_protagonist or explicit_mode:
            return {
                "mode": explicit_mode or "first_person",
                "protagonist": explicit_protagonist,
            }

        # Scan narration text (not dialogue) across sample segments
        sample_segs = segments[:150] if segments else []
        narr_texts = [s.text for s in sample_segs if not s.is_dialogue]
        combined_narr = " ".join(narr_texts)

        if not combined_narr:
            return {"mode": "third_person", "protagonist": None}

        # Count first-person vs third-person subject/possessive pronouns in narration
        fp_matches = re.findall(r"\b(?:I|my|me|mine|myself)\b", combined_narr)
        tp_matches = re.findall(r"\b(?:he|him|his|she|her|hers|they|them|their)\b", combined_narr, re.IGNORECASE)

        fp_count = len(fp_matches)
        tp_count = len(tp_matches)

        is_first_person = fp_count >= 8 and (fp_count >= tp_count * 0.15)

        if not is_first_person:
            return {"mode": "third_person", "protagonist": None}

        # In first-person novels, check if known_characters has an identified protagonist
        protagonist = None
        if known_characters:
            for c in known_characters:
                c_name = c.get("canonical_name", "")
                if c.get("is_protagonist") or c.get("role") == "protagonist":
                    protagonist = c_name
                    break

        # Check narrative prose for explicit self-identification, transmigration, or titles addressed to POV narrator
        if not protagonist and combined_narr:
            # 1. Transmigration / possession / reincarnation / self-name patterns:
            # e.g., "I've become that ... character ... 'Deculein'", "I became Deculein", "possessed Deculein", "my name was Deculein"
            transmig_match = re.search(
                r"\b(?:I'?ve become|I became|possessed|transmigrated into|reincarnated as|modeled after|name is|my name was)\b[^\.\n]{0,60}?\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b",
                combined_narr,
            )
            if transmig_match:
                cand = transmig_match.group(1).strip()
                if not cls.is_invalid_character_name(cand) and cand.lower() not in {"this", "that", "another", "someone", "the", "a", "an"}:
                    protagonist = cand

            # 2. Addressed titles in immediate proximity to the first-person narrator
            if not protagonist:
                title_match = re.search(
                    r"\b(?:Lord|Senior Professor|Professor|Master)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b",
                    combined_narr,
                )
                if title_match:
                    cand = title_match.group(1).strip()
                    if not cls.is_invalid_character_name(cand):
                        protagonist = cand

            # 3. Fallback to top non-general speaker from known_characters
            if not protagonist and known_characters:
                valid_known = [
                    c for c in known_characters
                    if c.get("canonical_name") and not cls.is_invalid_character_name(c["canonical_name"])
                    and c["canonical_name"] not in {"Narrator", "System / Interface", "General Male", "General Female"}
                ]
                if valid_known:
                    protagonist = valid_known[0]["canonical_name"]

        return {
            "mode": "first_person",
            "protagonist": protagonist,
        }

    SCENE_DIVIDER_RE = re.compile(r"^(?:[\*\-_=~#•─\s]{3,}|[—–\s]{3,})$")
    SCENE_TRANSITION_BEAT_RE = re.compile(
        r"^(?:Shaa|Clank|Click|Tap|Crash|Thud|Thump|Boom|BAM|Crack|Splash|Hiss)[—–\-!]+$",
        re.IGNORECASE,
    )
    SCENE_TIME_JUMP_RE = re.compile(
        r"^(?:(?:An?|A few|Several)\s+(?:hours?|days?|weeks?|months?|years?)\s+later|The next (?:morning|day|evening|night)|Later that (?:day|evening|night|morning)|Meanwhile|Back at|Inside the|Outside the)\b",
        re.IGNORECASE,
    )

    @classmethod
    def is_scene_boundary(cls, segment: ScriptSegmentModel) -> bool:
        """
        Conservative check if a segment marks an explicit scene boundary.
        Never invents scene breaks where evidence does not exist.
        """
        if not segment.text or segment.is_dialogue:
            return False
        trimmed = segment.text.strip()
        if cls.SCENE_DIVIDER_RE.match(trimmed):
            return True
        if len(trimmed) <= 25 and cls.SCENE_TRANSITION_BEAT_RE.match(trimmed):
            return True
        if cls.SCENE_TIME_JUMP_RE.match(trimmed):
            return True
        return False

    @classmethod
    def partition_chapter_into_windows(
        cls,
        segments: list[ScriptSegmentModel],
        max_context: int = 120,
        max_dialogue_targets: int = 30,
        overlap: int = 8,
    ) -> list[dict[str, Any]]:
        """
        Partitions chapter segments into dynamic dialogue-capped, scene-aware windows.

        Constraints:
        1. Context window cannot exceed max_context (default 120).
        2. Dialogue targets requiring attribution cannot exceed max_dialogue_targets (default 30).
        3. Hard stop at explicit scene boundaries (dividers, sound beats, time jumps).
        4. Overlap within the same scene provides conversational continuity, but is 0 across scene breaks.
        5. Sets is_new_scene=True when crossing into a new scene so dialogue context is wiped.
        """
        if not segments:
            return []

        windows: list[dict[str, Any]] = []
        n = len(segments)
        start_idx = 0
        is_new_scene = True

        while start_idx < n:
            curr_idx = start_idx
            dialogue_count = 0
            scene_cut_idx = None

            while curr_idx < n:
                seg = segments[curr_idx]

                # Cut at scene boundary if we have at least 1 dialogue or at least 15 segments
                if curr_idx > start_idx and cls.is_scene_boundary(seg):
                    if dialogue_count > 0 or (curr_idx - start_idx) >= 15:
                        scene_cut_idx = curr_idx
                        break

                if seg.is_dialogue or cls.has_dialogue_quotes(seg.text or ""):
                    dialogue_count += 1

                if dialogue_count >= max_dialogue_targets:
                    curr_idx += 1
                    break

                if (curr_idx - start_idx + 1) >= max_context:
                    curr_idx += 1
                    break

                curr_idx += 1

            if scene_cut_idx is not None:
                end_idx = scene_cut_idx
                next_is_new_scene = True
                step_forward = end_idx
            else:
                end_idx = min(n, curr_idx)
                next_is_new_scene = False
                if end_idx < n:
                    step_forward = max(start_idx + 1, end_idx - overlap)
                else:
                    step_forward = end_idx

            window_segs = segments[start_idx:end_idx]
            if window_segs:
                windows.append({
                    "start_idx": start_idx,
                    "end_idx": end_idx,
                    "segments": window_segs,
                    "is_new_scene": is_new_scene,
                })

            start_idx = step_forward
            is_new_scene = next_is_new_scene

        return windows

    @classmethod
    async def tag_window_with_deepseek(
        cls,
        window_segments: list[ScriptSegmentModel],
        prior_decisions: list[dict[str, Any]],
        project_settings: dict[str, Any] | None,
        allow_offline_heuristic: bool = False,
        known_characters: list[dict[str, Any]] | None = None,
        target_segment_ids: set[str] | None = None,
        narrative_pov: dict[str, Any] | None = None,
        return_merge_spans: bool = False,
    ) -> tuple[list[dict[str, Any]], dict[str, Any]] | tuple[list[dict[str, Any]], dict[str, Any], list[dict[str, Any]]]:
        """
        Call DeepSeek chat API with sliding window payload and return structured decisions and usage stats.
        Raises DeepSeekAPIError on connection, auth, or rate limit failures so they are surfaced clearly.
        """
        if allow_offline_heuristic:
            heuristics = cls.apply_local_heuristic_attribution(window_segments, project_settings, known_characters)
            if return_merge_spans:
                return heuristics, {}, []
            return heuristics, {}

        if not settings.DEEPSEEK_API_KEY:
            if settings.ENVIRONMENT == "test":
                logger.warning("DEEPSEEK_API_KEY is not configured; using offline heuristic.")
                heuristics = cls.apply_local_heuristic_attribution(window_segments, project_settings, known_characters)
                if return_merge_spans:
                    return heuristics, {}, []
                return heuristics, {}
            raise DeepSeekAPIError(
                "DEEPSEEK_API_KEY is missing. Please set your DeepSeek API key in environment or settings.",
                error_type="missing_api_key",
            )

        if not narrative_pov:
            narrative_pov = cls.detect_narrative_pov(window_segments, project_settings, known_characters)

        def is_sys_segment(seg_m: ScriptSegmentModel) -> bool:
            ts = seg_m.text.strip()
            if cls.has_dialogue_quotes(ts) or ManuscriptParserService.is_dash_dialogue(ts):
                return False
            return (
                getattr(seg_m, "delivery_type", "") == "system_prompt"
                or bool(SYSTEM_PROMPT_RE.search(ts))
                or ManuscriptParserService.is_short_bracket_system_prompt(ts)
                or bool(GAME_STAT_LINE_RE.search(ts))
            )

        def is_thought_segment(w_idx: int, seg_m: ScriptSegmentModel) -> bool:
            if getattr(seg_m, "delivery_type", "") == "internal_thought" or bool(getattr(seg_m, "is_internal_thought", False)):
                return True
            ts = seg_m.text.strip()
            is_single = bool(
                re.match(r"^['‘\u2018].+['’\u2019][.?!]?$", ts)
                or re.match(r"^['‘\u2018].+[.?!]['’\u2019]$", ts)
            )
            if not is_single:
                return False
            # Check neighboring context for an overt speech tag
            ctx = seg_m.text
            if w_idx > 0 and not window_segments[w_idx - 1].is_dialogue:
                ctx = window_segments[w_idx - 1].text + " " + ctx
            if w_idx < len(window_segments) - 1 and not window_segments[w_idx + 1].is_dialogue:
                ctx = ctx + " " + window_segments[w_idx + 1].text
            cand = cls.find_textual_speaker_tag(ctx)
            return cand is None

        # Identify dialogue segments that require attribution (excluding system prompts and internal thoughts)
        dialogue_segs = []
        for w_idx, s in enumerate(window_segments):
            if target_segment_ids is not None and s.id not in target_segment_ids:
                continue
            if is_sys_segment(s):
                continue
            if is_thought_segment(w_idx, s):
                continue
            if s.is_dialogue or cls.has_dialogue_quotes(s.text):
                dialogue_segs.append(s)

        # Optimization: If the window has NO dialogue segments at all (pure narration/system prompts/thoughts),
        # return deterministic narration/system/thought attributions immediately without burning LLM tokens.
        if not dialogue_segs:
            prior_by_id = {d["segment_id"]: d for d in prior_decisions if "segment_id" in d}
            clean_decisions: list[dict[str, Any]] = []
            for w_idx, s in enumerate(window_segments):
                if target_segment_ids is not None and s.id not in target_segment_ids and s.id in prior_by_id:
                    clean_decisions.append(prior_by_id[s.id])
                    continue

                if is_sys_segment(s):
                    clean_decisions.append({
                        "segment_id": s.id,
                        "delivery_type": "system_prompt",
                        "is_dialogue": False,
                        "is_internal_thought": False,
                        "speaker": "System / Interface",
                        "raw_speaker_tag": None,
                        "gender": "neutral",
                        "paralinguistic_tag": None,
                        "confidence": 1.0,
                    })
                elif is_thought_segment(w_idx, s):
                    clean_decisions.append({
                        "segment_id": s.id,
                        "delivery_type": "internal_thought",
                        "is_dialogue": False,
                        "is_internal_thought": True,
                        "speaker": "Narrator",
                        "raw_speaker_tag": None,
                        "gender": "neutral",
                        "paralinguistic_tag": None,
                        "confidence": 1.0,
                    })
                else:
                    clean_decisions.append({
                        "segment_id": s.id,
                        "delivery_type": "narration",
                        "is_dialogue": False,
                        "is_internal_thought": False,
                        "speaker": "Narrator",
                        "raw_speaker_tag": None,
                        "gender": "neutral",
                        "paralinguistic_tag": None,
                        "confidence": 1.0,
                    })
            if return_merge_spans:
                return clean_decisions, {}, []
            return clean_decisions, {}

        # Build full narrative transcript for contextual inference
        scene_transcript = [
            {
                "segment_id": s.id,
                "type": "dialogue" if s in dialogue_segs else ("system_prompt" if is_sys_segment(s) else ("internal_thought" if is_thought_segment(w_idx, s) else "narration")),
                "text": s.text,
            }
            for w_idx, s in enumerate(window_segments)
        ]

        dialogue_targets = [
            {
                "segment_id": s.id,
                "text": s.text,
            }
            for s in dialogue_segs
        ]

        recent_dialogue_context = [
            {
                "speaker": d.get("speaker"),
                "gender": d.get("gender"),
                "text_sample": d.get("raw_speaker_tag") or "",
            }
            for d in (prior_decisions or [])
            if d.get("is_dialogue")
        ][-8:]

        # Identify present_characters by scanning window text for character mentions
        window_raw_text = " ".join(s.text or "" for s in window_segments)
        present_characters: list[dict[str, Any]] = []

        pov_protagonist = (narrative_pov or {}).get("protagonist")
        for char in (known_characters or []):
            c_name = char.get("canonical_name", "")
            if not c_name or cls.is_invalid_character_name(c_name):
                continue
            is_present = False
            if pov_protagonist and c_name.lower() == pov_protagonist.lower():
                is_present = True
            elif re.search(rf"\b{re.escape(c_name)}\b", window_raw_text, re.IGNORECASE):
                # Check if this character is only mentioned in reported speech or memories:
                # e.g., "Lane said that..." or "remembered Lane"
                total_mentions = len(re.findall(rf"\b{re.escape(c_name)}\b", window_raw_text, re.IGNORECASE))
                reported_count = len(re.findall(
                    rf"\b{re.escape(c_name)}\s+(?:said\s+that|told\s+me\s+that|had\s+said\s+that|warned\s+that|wrote\s+that)\b",
                    window_raw_text,
                    re.IGNORECASE,
                ))
                memory_count = len(re.findall(
                    rf"\b(?:remembered|recalled|thought\s+of|dreamed\s+of|imagined|reminisced)\s+(?:about\s+)?{re.escape(c_name)}\b",
                    window_raw_text,
                    re.IGNORECASE,
                ))
                # If ALL mentions are reported speech or memories, the character is NOT physically present in the scene
                if total_mentions > 0 and (reported_count + memory_count) >= total_mentions:
                    is_present = False
                else:
                    is_present = True
            else:
                for alias in (char.get("aliases") or []):
                    if alias and len(alias) >= 3 and re.search(rf"\b{re.escape(alias)}\b", window_raw_text, re.IGNORECASE):
                        is_present = True
                        break
            if is_present:
                present_characters.append(char)

        # Discover scene-local named character candidates introduced in this scene
        discovered_candidates: dict[str, str] = {}
        existing_present_names = {c["canonical_name"].lower() for c in present_characters}
        for c in present_characters:
            for a in c.get("aliases") or []:
                existing_present_names.add(a.lower())

        action_verbs = (
            r"said|replied|asked|whispered|shouted|murmured|muttered|cried|warned|sighed|laughed|"
            r"yelled|demanded|gasped|groaned|growled|snapped|breathed|called|screamed|hissed|"
            r"sneered|inquired|exclaimed|uttered|knocked|burst|frowned|snorted|threw|looked|"
            r"turned|smirked|nodded|shook|walked|stepped|handed|bowed|entered"
        )
        scene_cand_patterns = [
            re.compile(rf"\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:{action_verbs})\b"),
            re.compile(rf"(?:{action_verbs})\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b"),
            re.compile(r"\b(?:Lord|Lady|Miss|Master|Professor|Senior Professor|Sir)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b"),
            re.compile(r"\b([A-Z][a-z]+),\s+(?:their|his|her)\s+(?:sister|brother|father|mother|master|lord|lady|assistant|servant|maid)\b"),
        ]

        for seg in window_segments:
            if seg.is_dialogue or getattr(seg, "delivery_type", "") in {"dialogue", "system_prompt"}:
                continue
            t = seg.text or ""
            for pat in scene_cand_patterns:
                for m in pat.finditer(t):
                    cand = m.group(1).strip()
                    cand_lower = cand.lower()
                    if cls.is_invalid_character_name(cand) or cand_lower in existing_present_names:
                        continue
                    # Avoid reported speech: e.g. "Lane said that"
                    if re.search(rf"\b{re.escape(cand)}\s+(?:said\s+that|told\s+me\s+that|had\s+said\s+that)\b", t, re.IGNORECASE):
                        continue
                    inferred_gnd = cls.infer_name_gender(cand)
                    discovered_candidates[cand] = inferred_gnd
                    existing_present_names.add(cand_lower)

        for cand_name, cand_gnd in discovered_candidates.items():
            present_characters.append({
                "canonical_name": cand_name,
                "aliases": [],
                "gender": cand_gnd,
            })

        # Place stable context first to maximize DeepSeek KV prompt prefix caching
        user_content = json.dumps({
            "project_context": {
                "narrative_pov": narrative_pov,
                "present_characters": present_characters,
            },
            "alias_reference_bible": (known_characters or [])[-30:],
            "recent_dialogue_context": recent_dialogue_context,
            "scene_transcript": scene_transcript,
            "dialogue_targets": dialogue_targets,
        })

        headers = {
            "Authorization": f"Bearer {settings.DEEPSEEK_API_KEY}",
            "Content-Type": "application/json",
        }

        model_name = settings.DEEPSEEK_MODEL
        if "googleapis.com" in settings.DEEPSEEK_BASE_URL and not model_name.startswith("models/"):
            model_name = f"models/{model_name}"

        request_body = {
            "model": model_name,
            "messages": [
                {"role": "system", "content": STAGE_B_SYSTEM_PROMPT},
                {"role": "user", "content": user_content},
            ],
            "temperature": 0.1,
            "max_tokens": 4096,
            "response_format": {"type": "json_object"},
        }

        max_attempts = 5
        backoff = 4.0

        for attempt in range(1, max_attempts + 1):
            try:
                async with httpx.AsyncClient(timeout=75.0) as client:
                    resp = await client.post(
                        f"{settings.DEEPSEEK_BASE_URL.rstrip('/')}/chat/completions",
                        json=request_body,
                        headers=headers,
                    )

                    if resp.status_code == 401:
                        raise DeepSeekAPIError(
                            "DeepSeek API authentication failed (HTTP 401): The API key is invalid, revoked, or expired.",
                            error_type="auth_error",
                            status_code=401,
                        )
                    if resp.status_code == 402:
                        raise DeepSeekAPIError(
                            "DeepSeek account has insufficient balance / tokens exhausted (HTTP 402 Payment Required).",
                            error_type="quota_error",
                            status_code=402,
                        )
                    if resp.status_code == 429 or resp.status_code >= 500:
                        if attempt < max_attempts:
                            retry_after = resp.headers.get("Retry-After")
                            if retry_after and retry_after.strip().isdigit():
                                wait_seconds = max(float(retry_after.strip()), 60.0)
                            elif resp.status_code == 503 or resp.status_code == 429:
                                # Gemini/LLM 503 (Overloaded) and 429 (Resource Exhausted) quota window is 60s.
                                # Wait 65.0s so the sliding quota window clears completely before retrying.
                                wait_seconds = 65.0
                            elif attempt >= 2:
                                wait_seconds = 65.0
                            else:
                                wait_seconds = backoff

                            logger.warning(
                                "LLM API returned HTTP %d (%s). Waiting %.1fs for quota window to reset (attempt %d/%d)...",
                                resp.status_code,
                                "Rate limit 429" if resp.status_code == 429 else f"Server error {resp.status_code}",
                                wait_seconds,
                                attempt,
                                max_attempts,
                            )
                            await asyncio.sleep(wait_seconds)
                            backoff = min(backoff * 2, 65.0)
                            continue
                        raise DeepSeekAPIError(
                            f"LLM API error (HTTP {resp.status_code}): Service unavailable or rate limit exceeded after {max_attempts} retries.",
                            error_type="rate_limit" if resp.status_code == 429 else "server_error",
                            status_code=resp.status_code,
                        )

                    resp.raise_for_status()
                    data = resp.json()
                    content = data["choices"][0]["message"]["content"]
                    finish_reason = data["choices"][0].get("finish_reason")

                    clean_merge_spans: list[dict[str, Any]] = []
                    try:
                        parsed = json.loads(content)
                        if isinstance(parsed, list):
                            raw_attributions = parsed
                            raw_merge_spans = []
                        elif isinstance(parsed, dict):
                            raw_attributions = (
                                parsed.get("dialogue_attributions")
                                or parsed.get("decisions")
                                or []
                            )
                            raw_merge_spans = parsed.get("merge_spans") or []
                        else:
                            raw_attributions = []
                            raw_merge_spans = []

                        if isinstance(raw_merge_spans, list):
                            for ms in raw_merge_spans:
                                if isinstance(ms, dict) and ms.get("start_segment_id") and ms.get("end_segment_id"):
                                    clean_merge_spans.append({
                                        "start_segment_id": str(ms["start_segment_id"]).strip(),
                                        "end_segment_id": str(ms["end_segment_id"]).strip(),
                                        "target_speaker": str(ms.get("target_speaker") or "Narrator").strip(),
                                        "target_delivery_type": str(ms.get("target_delivery_type") or "narration").strip(),
                                    })
                    except json.JSONDecodeError as json_err:
                        logger.warning(
                            "DeepSeek returned malformed or truncated JSON (finish_reason=%s): %s. Attempting extraction...",
                            finish_reason,
                            json_err,
                        )
                        raw_matches = re.findall(
                            r'\{\s*"segment_id"\s*:[^}]+?\}',
                            content,
                            re.DOTALL,
                        )
                        raw_attributions = []
                        for m in raw_matches:
                            try:
                                dec = json.loads(m)
                                if isinstance(dec, dict) and "segment_id" in dec:
                                    raw_attributions.append(dec)
                            except Exception:
                                continue

                        if not raw_attributions:
                            if attempt < max_attempts:
                                await asyncio.sleep(backoff)
                                backoff *= 2
                                continue
                            raise DeepSeekAPIError(
                                f"DeepSeek response was truncated or contained invalid JSON: {json_err}",
                                error_type="malformed_response",
                            ) from json_err
                        logger.info(
                            "Rescued %d dialogue attributions from truncated JSON via pattern extraction.",
                            len(raw_attributions),
                        )

                    attr_by_id: dict[str, dict[str, Any]] = {}
                    if isinstance(raw_attributions, list):
                        for d in raw_attributions:
                            if isinstance(d, dict) and d.get("segment_id"):
                                attr_by_id[str(d["segment_id"]).strip()] = d

                    dialogue_set = {s.id for s in dialogue_segs}
                    clean_decisions: list[dict[str, Any]] = []
                    prior_by_id = {d["segment_id"]: d for d in prior_decisions if "segment_id" in d}

                    for w_idx, seg_obj in enumerate(window_segments):
                        seg_id = seg_obj.id
                        if target_segment_ids is not None and seg_id not in target_segment_ids and seg_id in prior_by_id:
                            clean_decisions.append(prior_by_id[seg_id])
                            continue

                        if is_sys_segment(seg_obj):
                            clean_decisions.append({
                                "segment_id": seg_id,
                                "delivery_type": "system_prompt",
                                "is_dialogue": False,
                                "is_internal_thought": False,
                                "speaker": "System / Interface",
                                "raw_speaker_tag": None,
                                "gender": "neutral",
                                "paralinguistic_tag": None,
                                "confidence": 1.0,
                            })
                            continue

                        if is_thought_segment(w_idx, seg_obj):
                            clean_decisions.append({
                                "segment_id": seg_id,
                                "delivery_type": "internal_thought",
                                "is_dialogue": False,
                                "is_internal_thought": True,
                                "speaker": "Narrator",
                                "raw_speaker_tag": None,
                                "gender": "neutral",
                                "paralinguistic_tag": None,
                                "confidence": 1.0,
                            })
                            continue

                        if seg_id not in dialogue_set and seg_id not in attr_by_id:
                            # Narration segment
                            clean_decisions.append({
                                "segment_id": seg_id,
                                "delivery_type": "narration",
                                "is_dialogue": False,
                                "is_internal_thought": False,
                                "speaker": "Narrator",
                                "raw_speaker_tag": None,
                                "gender": "neutral",
                                "paralinguistic_tag": None,
                                "confidence": 1.0,
                            })
                            continue

                        # Dialogue target segment
                        d = attr_by_id.get(seg_id) or attr_by_id.get(str(seg_id))
                        if not d or not isinstance(d, dict):
                            # Fallback if LLM missed this specific dialogue target
                            candidate = cls.find_textual_speaker_tag(seg_obj.text)
                            canon, can_gnd, raw_tag = cls.resolve_canonical_speaker(candidate, known_characters)
                            clean_decisions.append({
                                "segment_id": seg_id,
                                "delivery_type": "dialogue",
                                "is_dialogue": True,
                                "is_internal_thought": False,
                                "speaker": canon,
                                "raw_speaker_tag": raw_tag,
                                "gender": can_gnd,
                                "paralinguistic_tag": cls.filter_paralinguistic_tag(None, project_settings),
                                "confidence": 0.5,
                            })
                            continue

                        is_thought = (
                            bool(d.get("is_internal_thought", False))
                            or d.get("delivery_type") == "internal_thought"
                        )
                        speaker = d.get("speaker")
                        if isinstance(speaker, list):
                            speaker = " ".join(str(s) for s in speaker if s).strip() or None
                        elif not isinstance(speaker, str) and speaker is not None:
                            speaker = str(speaker).strip()

                        gender_val = d.get("gender")
                        if isinstance(gender_val, list) and gender_val:
                            gender_val = str(gender_val[0])
                        gender = (str(gender_val) if gender_val is not None else "male").strip().lower()
                        if gender not in {"male", "female", "neutral"}:
                            gender = "neutral" if is_thought else "male"

                        raw_conf = d.get("confidence")
                        try:
                            conf = float(raw_conf) if raw_conf is not None else 0.9
                        except (ValueError, TypeError):
                            conf = 0.9

                        if is_thought or (speaker and speaker.lower() == "narrator"):
                            clean_decisions.append({
                                "segment_id": seg_id,
                                "delivery_type": "internal_thought",
                                "is_dialogue": False,
                                "is_internal_thought": True,
                                "speaker": "Narrator",
                                "raw_speaker_tag": None,
                                "gender": "neutral",
                                "paralinguistic_tag": None,
                                "confidence": conf,
                            })
                            continue

                        raw_tag = d.get("raw_speaker_tag")
                        if isinstance(raw_tag, list):
                            raw_tag = " ".join(str(x) for x in raw_tag if x).strip() or None
                        elif not isinstance(raw_tag, str) and raw_tag is not None:
                            raw_tag = str(raw_tag).strip()

                        if not speaker or speaker.lower() in {"unknown", "unspecified", "anonymous"}:
                            speaker = "General Female" if gender == "female" else "General Male"
                        else:
                            canonical, can_gnd, canonical_raw = cls.resolve_canonical_speaker(speaker, known_characters)
                            speaker = canonical
                            if canonical_raw and not raw_tag:
                                raw_tag = canonical_raw

                            # Gender Integrity Protection:
                            is_existing_known = any(
                                k.get("canonical_name", "").lower() == canonical.lower()
                                for k in (known_characters or [])
                            )
                            if is_existing_known and can_gnd in {"male", "female", "neutral"}:
                                gender = can_gnd
                            elif gender not in {"male", "female", "neutral"}:
                                gender = can_gnd or "male"

                        tag = cls.filter_paralinguistic_tag(d.get("paralinguistic_tag"), project_settings)
                        clean_decisions.append({
                            "segment_id": seg_id,
                            "delivery_type": "dialogue",
                            "is_dialogue": True,
                            "is_internal_thought": False,
                            "speaker": speaker,
                            "raw_speaker_tag": raw_tag,
                            "gender": gender,
                            "paralinguistic_tag": tag,
                            "confidence": conf,
                        })

                    clean_decisions = cls.enforce_dialogue_chain_turn_taking(
                        window_segments, clean_decisions, known_characters, prior_decisions
                    )

                    usage = data.get("usage", {})
                    if return_merge_spans:
                        return clean_decisions, usage, clean_merge_spans
                    return clean_decisions, usage

            except httpx.TimeoutException as exc:
                if attempt < max_attempts:
                    wait_seconds = 10.0 if attempt == 1 else 65.0
                    logger.warning(
                        "LLM API request timed out. Waiting %.1fs before retrying (attempt %d/%d)...",
                        wait_seconds,
                        attempt,
                        max_attempts,
                    )
                    await asyncio.sleep(wait_seconds)
                    continue
                raise DeepSeekAPIError(
                    f"LLM API request timed out after {max_attempts} attempts (connection exceeded 60s).",
                    error_type="timeout",
                ) from exc
            except httpx.NetworkError as exc:
                if attempt < max_attempts:
                    await asyncio.sleep(1.0)
                    continue
                raise DeepSeekAPIError(
                    f"Failed to reach DeepSeek API: Network connection error ({exc}).",
                    error_type="network_error",
                ) from exc

        raise DeepSeekAPIError("Unexpected DeepSeek API failure after retries", error_type="unknown_error")

    @classmethod
    async def apply_merge_spans(
        cls,
        merge_spans: list[dict[str, Any]],
        chapter_id: str,
        db: AsyncSession,
    ) -> tuple[list[str], set[str]]:
        """
        Safely execute LLM-directed segment merges with strict invariant checks:
        1. Segments must exist and belong to this chapter.
        2. Must be strictly contiguous by order_index.
        3. Cannot cross quotation boundaries (no merging dialogue with narration).
        4. Word count ceiling <= 150 words.
        Returns (merged_anchor_ids, deleted_segment_ids).
        """
        if not merge_spans:
            return [], set()

        merged_anchor_ids: list[str] = []
        deleted_segment_ids: list[str] = []

        for span in merge_spans:
            start_id = span.get("start_segment_id")
            end_id = span.get("end_segment_id")
            target_speaker = span.get("target_speaker") or "Narrator"
            target_delivery = span.get("target_delivery_type") or "narration"

            if not start_id or not end_id or start_id == end_id:
                continue

            if start_id in deleted_segment_ids or end_id in deleted_segment_ids:
                continue

            stmt = select(ScriptSegmentModel).where(
                ScriptSegmentModel.id.in_([start_id, end_id]),
                ScriptSegmentModel.chapter_id == chapter_id,
            )
            found = {s.id: s for s in (await db.execute(stmt)).scalars().all()}
            start_seg = found.get(start_id)
            end_seg = found.get(end_id)

            if not start_seg or not end_seg:
                continue

            if start_seg.order_index >= end_seg.order_index:
                continue

            span_stmt = (
                select(ScriptSegmentModel)
                .where(
                    ScriptSegmentModel.chapter_id == chapter_id,
                    ScriptSegmentModel.order_index >= start_seg.order_index,
                    ScriptSegmentModel.order_index <= end_seg.order_index,
                )
                .order_by(ScriptSegmentModel.order_index.asc())
            )
            span_segs = list((await db.execute(span_stmt)).scalars().all())

            expected_count = end_seg.order_index - start_seg.order_index + 1
            if len(span_segs) != expected_count:
                continue

            # Invariant 1: Check dialogue boundary safety
            has_dialogue_quote = any(
                cls.has_dialogue_quotes(s.text or "")
                or getattr(s, "is_dialogue", False)
                or getattr(s, "delivery_type", "") == "dialogue"
                or ManuscriptParserService.is_dash_dialogue(s.text or "")
                for s in span_segs
            )
            if target_delivery != "dialogue" and has_dialogue_quote:
                logger.warning(
                    "Skipping merge_span (%s -> %s): contains spoken dialogue quotes that cannot be merged into %s",
                    start_id,
                    end_id,
                    target_delivery,
                )
                continue

            if target_delivery == "system_prompt":
                has_non_sys = any(
                    getattr(s, "delivery_type", "") != "system_prompt"
                    and not bool(SYSTEM_PROMPT_RE.search((s.text or "").strip()))
                    and not ManuscriptParserService.is_short_bracket_system_prompt((s.text or "").strip())
                    and not bool(GAME_STAT_LINE_RE.search((s.text or "").strip()))
                    for s in span_segs
                )
                if has_non_sys:
                    logger.warning(
                        "Skipping merge_span (%s -> %s): non-system segments cannot be merged into system_prompt",
                        start_id,
                        end_id,
                    )
                    continue

            if target_delivery == "dialogue":
                has_long_narration = any(
                    s.delivery_type == "narration" and len((s.text or "").split()) > 15
                    for s in span_segs
                )
                if has_long_narration:
                    logger.warning(
                        "Skipping merge_span (%s -> %s): contains extended narration that cannot be merged into dialogue",
                        start_id,
                        end_id,
                    )
                    continue

            # Invariant 2: Word count ceiling
            total_words = sum(len((s.text or "").split()) for s in span_segs)
            if total_words > 150:
                logger.warning(
                    "Skipping merge_span (%s -> %s): combined words (%d) exceeds 150 word limit",
                    start_id,
                    end_id,
                    total_words,
                )
                continue

            # Deterministic concatenation
            is_sys = (
                target_delivery == "system_prompt"
                or target_speaker.lower() in {"system / interface", "system"}
            )
            joiner = "\n" if is_sys else " "
            merged_text = joiner.join(s.text.strip() for s in span_segs if s.text and s.text.strip())

            anchor = span_segs[0]
            to_delete = span_segs[1:]

            anchor.text = merged_text
            anchor.delivery_type = target_delivery
            anchor.speaker = target_speaker
            anchor.is_dialogue = (target_delivery == "dialogue")
            anchor.is_internal_thought = (target_delivery == "internal_thought")
            anchor.speaker_gender = "neutral" if is_sys or target_delivery == "internal_thought" else (anchor.speaker_gender or "male")
            anchor.audio_url = None
            anchor.duration_seconds = None
            anchor.word_count = len(merged_text.split())

            deleted_count = len(to_delete)
            deleted_max_order = span_segs[-1].order_index

            for s in to_delete:
                deleted_segment_ids.append(s.id)
                await db.delete(s)

            await db.execute(
                update(ScriptSegmentModel)
                .where(
                    ScriptSegmentModel.chapter_id == chapter_id,
                    ScriptSegmentModel.order_index > deleted_max_order,
                )
                .values(order_index=ScriptSegmentModel.order_index - deleted_count)
            )

            await db.commit()
            merged_anchor_ids.append(anchor.id)
            logger.info(
                "Successfully merged %d segments into anchor %s (target=%s, %s)",
                len(span_segs),
                anchor.id,
                target_speaker,
                target_delivery,
            )

        return merged_anchor_ids, set(deleted_segment_ids)

    @classmethod
    def _compile_llm_report(
        cls,
        *,
        model: str,
        start_time: float,
        total_api_calls: int,
        prompt_tokens: int,
        completion_tokens: int,
        total_tokens: int,
        cache_hit_tokens: int,
        cache_miss_tokens: int,
        total_segments: int,
        dialogue_segments: int,
        narration_segments: int,
        characters_synced: list[dict[str, Any]] | None = None,
        failed_chapters: list[dict[str, Any]] | None = None,
        balance_remaining: str | None = None,
        balance_currency: str = "USD",
        status: str = "completed",
    ) -> dict[str, Any]:
        """Compile a structured LLM report with usage, pricing, and timing."""
        if "gemini" in model.lower():
            cost_usd = ((prompt_tokens * 0.075) + (completion_tokens * 0.30)) / 1_000_000
            pricing_name = "Gemini Flash-Lite ($0.075/1M input, $0.30/1M output)"
        else:
            cost_usd = (
                (cache_miss_tokens * 0.27)
                + (cache_hit_tokens * 0.07)
                + (completion_tokens * 1.10)
            ) / 1_000_000
            pricing_name = "DeepSeek-V3 ($0.27/1M input miss, $0.07/1M input hit, $1.10/1M output)"

        report: dict[str, Any] = {
            "model": model,
            "job_status": status,
            "completed_at": datetime.now(UTC).isoformat(),
            "duration_seconds": round(max(0.1, time.monotonic() - start_time), 2),
            "total_api_calls": total_api_calls,
            "tokens": {
                "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens,
                "total_tokens": total_tokens,
                "cache_hit_tokens": cache_hit_tokens,
                "cache_miss_tokens": cache_miss_tokens,
            },
            "cost": {
                "estimated_cost_usd": round(cost_usd, 6),
                "currency": "USD",
                "pricing_model": pricing_name,
            },
            "account": {
                "balance_remaining": balance_remaining,
                "currency": balance_currency,
            },
            "breakdown": {
                "total_segments": total_segments,
                "dialogue_segments": dialogue_segments,
                "narration_segments": narration_segments,
                "characters_synced": characters_synced or [],
            },
        }

        if failed_chapters:
            report["failed_chapters"] = failed_chapters
            report["warnings"] = [
                f"Chapter {fc['chapter_number']} ('{fc['title']}'): {fc['error']}"
                for fc in failed_chapters
            ]

        return report

    @classmethod
    async def _fetch_deepseek_balance(cls) -> tuple[str | None, str]:
        """Fetch live account balance from DeepSeek API if key is available."""
        if not settings.DEEPSEEK_API_KEY:
            return None, "USD"
        try:
            async with httpx.AsyncClient(timeout=6.0) as client:
                resp = await client.get(
                    f"{settings.DEEPSEEK_BASE_URL.rstrip('/')}/user/balance",
                    headers={"Authorization": f"Bearer {settings.DEEPSEEK_API_KEY}"},
                )
                if resp.status_code == 200:
                    data = resp.json()
                    infos = data.get("balance_infos", [])
                    if infos:
                        return str(infos[0].get("total_balance", "0.00")), infos[0].get("currency", "USD")
        except Exception as exc:
            logger.warning("Could not fetch DeepSeek account balance: %s", exc)
        return None, "USD"

    @classmethod
    async def get_latest_job(
        cls,
        project_id: str,
        db: AsyncSession,
    ) -> TaggingJobModel | None:
        """Fetch the most recent tagging job for a project."""
        stmt = (
            select(TaggingJobModel)
            .where(TaggingJobModel.project_id == project_id)
            .order_by(TaggingJobModel.created_at.desc())
            .limit(1)
        )
        job = (await db.execute(stmt)).scalar_one_or_none()
        if job and not job.target_scope:
            job.target_scope = cls.infer_job_scope(job)
        return job

    @classmethod
    async def get_job_by_id(
        cls,
        job_id: str,
        db: AsyncSession,
    ) -> TaggingJobModel | None:
        """Fetch a specific tagging job by id."""
        job = await db.get(TaggingJobModel, job_id)
        if job and not job.target_scope:
            job.target_scope = cls.infer_job_scope(job)
        return job

    @staticmethod
    def infer_job_scope(job: TaggingJobModel) -> dict[str, Any]:
        """Deduce human-readable scope for legacy jobs without explicit target_scope."""
        step = job.current_step or ""
        step_lower = step.lower()
        if "all" in step_lower or "full" in step_lower:
            return {
                "type": "full",
                "label": "Full Novel",
                "chapter_count": job.total_chapters,
            }

        match_single = re.search(r"Chapter\s+(\d+)", step, re.IGNORECASE)
        if match_single and job.total_chapters == 1:
            chap_num = int(match_single.group(1))
            return {
                "type": "single",
                "label": f"Chapter {chap_num}",
                "chapter_number": chap_num,
                "chapter_count": 1,
            }

        match_range = re.search(r"Ch\s+(\d+)[–-](\d+)", step, re.IGNORECASE)
        if match_range:
            s_num = int(match_range.group(1))
            e_num = int(match_range.group(2))
            return {
                "type": "range",
                "label": f"Chapters {s_num}–{e_num}",
                "start_chapter": s_num,
                "end_chapter": e_num,
                "chapter_count": job.total_chapters,
            }

        if job.total_chapters == 1:
            return {
                "type": "single",
                "label": job.current_chapter_title or "Single Chapter",
                "chapter_count": 1,
            }

        return {
            "type": "full",
            "label": "Full Novel",
            "chapter_count": job.total_chapters,
        }

    @classmethod
    async def get_job_history(
        cls,
        project_id: str,
        db: AsyncSession,
        limit: int = 50,
    ) -> list[TaggingJobModel]:
        """
        Query all historical Stage B dialogue tagging jobs for a project,
        ordered newest to oldest. Ensures legacy jobs have an inferred scope.
        """
        stmt = (
            select(TaggingJobModel)
            .where(TaggingJobModel.project_id == project_id)
            .order_by(TaggingJobModel.created_at.desc())
            .limit(limit)
        )
        jobs = list((await db.execute(stmt)).scalars().all())
        for job in jobs:
            if not job.target_scope:
                job.target_scope = cls.infer_job_scope(job)
        return jobs

    @classmethod
    async def cancel_job(
        cls,
        project_id: str,
        db: AsyncSession,
    ) -> TaggingJobModel:
        """Cancel an ongoing tagging job for a project and finalize its report."""
        task = ACTIVE_TAGGING_TASKS.get(project_id)
        if task and not task.done():
            task.cancel()
            try:
                # Wait briefly for worker's CancelledError handler to record final LLM report
                await asyncio.wait_for(asyncio.shield(task), timeout=2.0)
            except (asyncio.CancelledError, TimeoutError, Exception):
                pass
            ACTIVE_TAGGING_TASKS.pop(project_id, None)

        job = await cls.get_latest_job(project_id, db)
        if not job:
            raise NotFoundError(f"No tagging job found for project '{project_id}'")

        if job.status in ("pending", "running"):
            job.status = "cancelled"
            job.current_step = "Job cancelled by user."
            job.eta_seconds = 0
            job.completed_at = datetime.now(UTC)
            if not job.llm_report:
                job.llm_report = cls._compile_llm_report(
                    model=settings.DEEPSEEK_MODEL if settings.DEEPSEEK_API_KEY else "offline_heuristic",
                    start_time=time.monotonic(),
                    total_api_calls=0,
                    prompt_tokens=0,
                    completion_tokens=0,
                    total_tokens=0,
                    cache_hit_tokens=0,
                    cache_miss_tokens=0,
                    total_segments=job.processed_segments,
                    dialogue_segments=0,
                    narration_segments=0,
                    status="cancelled",
                )
            await db.commit()
            await db.refresh(job)

        return job

    @classmethod
    async def start_tagging_job(
        cls,
        project_id: str,
        db: AsyncSession,
        resume: bool = True,
        force: bool = False,
        allow_offline_heuristic: bool = False,
        chapter_ids: list[str] | None = None,
        start_chapter: int | None = None,
        end_chapter: int | None = None,
    ) -> TaggingJobModel:
        """
        Enqueue an asynchronous Stage B dialogue tagging background job.
        Supports partial tagging for specific chapter_ids, chapter ranges, or full novel.
        Returns 202 Accepted job model immediately.
        """
        project = await db.get(ProjectModel, project_id)
        if not project:
            raise NotFoundError(f"Project '{project_id}' not found")

        # Check existing active job
        existing = await cls.get_latest_job(project_id, db)
        if existing and existing.status in ("pending", "running"):
            task = ACTIVE_TAGGING_TASKS.get(project_id)
            if task and not task.done():
                return existing

        # Fetch all chapters
        stmt = (
            select(ChapterModel)
            .where(ChapterModel.project_id == project_id)
            .order_by(ChapterModel.order_index.asc())
        )
        all_chapters = list((await db.execute(stmt)).scalars().all())
        if not all_chapters:
            raise NotFoundError("No chapters found in project to tag")

        # Filter target chapters
        if chapter_ids:
            ch_id_set = set(chapter_ids)
            target_chapters = [c for c in all_chapters if c.id in ch_id_set]
        elif start_chapter is not None or end_chapter is not None:
            s_num = start_chapter if start_chapter is not None else 1
            e_num = end_chapter if end_chapter is not None else 999999
            target_chapters = [c for c in all_chapters if s_num <= c.chapter_number <= e_num]
        else:
            target_chapters = all_chapters

        if not target_chapters:
            raise NotFoundError("No matching chapters found to tag")

        target_chapter_ids = [c.id for c in target_chapters]

        # Reset dialogue speakers if force re-tag is enabled
        if force:
            await db.execute(
                update(ScriptSegmentModel)
                .where(
                    ScriptSegmentModel.chapter_id.in_(target_chapter_ids),
                    ScriptSegmentModel.is_dialogue.is_(True),
                )
                .values(speaker=None, character_id=None, speaker_gender=None, emotion=None)
            )
            await db.commit()

        # Count total segments in targeted chapters
        seg_count_stmt = (
            select(ScriptSegmentModel.id)
            .where(ScriptSegmentModel.chapter_id.in_(target_chapter_ids))
        )
        total_segments = len((await db.execute(seg_count_stmt)).scalars().all())

        if len(target_chapters) == len(all_chapters):
            target_scope = {
                "type": "full",
                "label": "Full Novel",
                "chapter_count": len(all_chapters),
            }
            step_desc = f"Enqueued dialogue tagging for all {len(target_chapters)} chapters..."
        elif len(target_chapters) == 1:
            target_scope = {
                "type": "single",
                "label": f"Chapter {target_chapters[0].chapter_number}",
                "chapter_number": target_chapters[0].chapter_number,
                "chapter_title": target_chapters[0].title,
                "chapter_id": target_chapters[0].id,
                "chapter_count": 1,
            }
            step_desc = f"Enqueued tagging for Chapter {target_chapters[0].chapter_number}: {target_chapters[0].title}..."
        else:
            s_num = target_chapters[0].chapter_number
            e_num = target_chapters[-1].chapter_number
            target_scope = {
                "type": "range",
                "label": f"Chapters {s_num}–{e_num}",
                "start_chapter": s_num,
                "end_chapter": e_num,
                "chapter_count": len(target_chapters),
            }
            step_desc = f"Enqueued tagging for {len(target_chapters)} chapters (Ch {s_num}–{e_num})..."

        job = TaggingJobModel(
            project_id=project_id,
            status="pending",
            total_chapters=len(target_chapters),
            processed_chapters=0,
            total_segments=total_segments,
            processed_segments=0,
            progress_percent=0.0,
            current_step=step_desc,
            target_scope=target_scope,
            started_at=datetime.now(UTC),
        )
        db.add(job)
        await db.commit()
        await db.refresh(job)

        # Launch background task in the event loop with isolated db session
        task = asyncio.create_task(
            cls._execute_tagging_worker(
                job_id=job.id,
                project_id=project_id,
                resume=resume,
                force=force,
                allow_offline_heuristic=allow_offline_heuristic,
                target_chapter_ids=target_chapter_ids,
            )
        )
        ACTIVE_TAGGING_TASKS[project_id] = task

        return job

    @classmethod
    async def _execute_tagging_worker(
        cls,
        job_id: str,
        project_id: str,
        resume: bool = True,
        force: bool = False,
        allow_offline_heuristic: bool = False,
        window_size: int = 60,
        overlap: int = 10,
        target_chapter_ids: list[str] | None = None,
    ) -> None:
        """
        Background worker that processes chapters window by window,
        updates progress and ETA dynamically, and surfaces exact DeepSeek errors.
        """
        factory = get_session_factory()
        start_time = time.monotonic()

        async with factory() as db:
            job = await db.get(TaggingJobModel, job_id)
            if not job:
                return
            job.status = "running"
            job.started_at = datetime.now(UTC)
            job.current_step = "Starting dialogue attribution..."
            await db.commit()

        processed_segment_ids: set[str] = set()
        all_decisions: list[dict[str, Any]] = []
        processed_chapters_count = 0
        total_prompt_tokens = 0
        total_completion_tokens = 0
        total_tokens = 0
        total_cache_hit_tokens = 0
        total_cache_miss_tokens = 0
        total_api_calls = 0

        try:
            async with factory() as db:
                project = await db.get(ProjectModel, project_id)
                if not project:
                    return

                stmt = (
                    select(ChapterModel)
                    .where(ChapterModel.project_id == project_id)
                    .order_by(ChapterModel.order_index.asc())
                )
                if target_chapter_ids:
                    stmt = stmt.where(ChapterModel.id.in_(target_chapter_ids))
                chapters = list((await db.execute(stmt)).scalars().all())
                total_chapters = len(chapters)

                # Initialize canonical character dossier
                chars = await CharacterService.get_project_characters(project_id, db)
                known_characters: list[dict[str, Any]] = [
                    {
                        "canonical_name": c.name,
                        "aliases": list(c.aliases or []),
                        "gender": c.gender,
                    }
                    for c in chars
                    if not c.is_system and c.name.lower() != "narrator" and not cls.is_invalid_character_name(c.name)
                ]

            failed_chapters: list[dict[str, Any]] = []

            async def _process_chapter(chap_idx: int, chapter: ChapterModel) -> None:
                nonlocal total_api_calls, total_prompt_tokens, total_completion_tokens
                nonlocal total_tokens, total_cache_hit_tokens, total_cache_miss_tokens
                nonlocal processed_chapters_count

                # Load chapter segments
                async with factory() as db:
                    seg_stmt = (
                        select(ScriptSegmentModel)
                        .where(ScriptSegmentModel.chapter_id == chapter.id)
                        .order_by(ScriptSegmentModel.order_index.asc())
                    )
                    segments = list((await db.execute(seg_stmt)).scalars().all())

                if not segments:
                    processed_chapters_count += 1
                    return

                # Check if chapter is already fully tagged when resuming
                is_chapter_already_tagged = (
                    not force
                    and resume
                    and len(segments) > 0
                    and all(s.speaker is not None for s in segments)
                )

                if is_chapter_already_tagged:
                    logger.info("Chapter '%s' is already tagged; loading context and skipping LLM calls", chapter.title)
                    for seg in segments:
                        processed_segment_ids.add(seg.id)
                        all_decisions.append({
                            "segment_id": seg.id,
                            "delivery_type": seg.delivery_type,
                            "is_dialogue": seg.is_dialogue,
                            "is_internal_thought": seg.is_internal_thought,
                            "speaker": seg.speaker,
                            "raw_speaker_tag": seg.raw_speaker_tag,
                            "gender": seg.speaker_gender or "male",
                            "paralinguistic_tag": seg.emotion,
                        })
                    processed_chapters_count += 1

                    async with factory() as db:
                        job = await db.get(TaggingJobModel, job_id)
                        if job:
                            job.processed_chapters = processed_chapters_count
                            job.processed_segments = len(processed_segment_ids)
                            if job.total_segments > 0:
                                pct = (len(processed_segment_ids) / job.total_segments) * 100
                                job.progress_percent = min(99.0, round(pct, 1))
                            job.current_chapter_title = f"Chapter {chapter.chapter_number}: {chapter.title}"
                            job.current_step = f"Reused existing tags for Chapter {chap_idx + 1} of {total_chapters}..."
                            await db.commit()
                    return

                # Update job status before processing chapter windows
                async with factory() as db:
                    job = await db.get(TaggingJobModel, job_id)
                    if job:
                        job.current_chapter_title = f"Chapter {chapter.chapter_number}: {chapter.title}"
                        job.current_step = f"Processing Chapter {chap_idx + 1} of {total_chapters}..."
                        await db.commit()

                cfg = project.settings or {}
                active_window_size = int(cfg.get("tagging_window_size", window_size or 120))
                active_max_dialogues = int(cfg.get("tagging_max_dialogue_targets", 30))
                active_overlap = int(cfg.get("tagging_window_overlap", overlap or 8))

                narrative_pov = cls.detect_narrative_pov(
                    segments=segments,
                    project_settings=project.settings,
                    known_characters=known_characters,
                )

                chapter_windows = cls.partition_chapter_into_windows(
                    segments=segments,
                    max_context=active_window_size,
                    max_dialogue_targets=active_max_dialogues,
                    overlap=active_overlap,
                )
                total_windows_in_chap = max(1, len(chapter_windows))

                for window_idx, win_info in enumerate(chapter_windows):
                    window = win_info["segments"]
                    start_idx = win_info["start_idx"]
                    is_new_scene = win_info["is_new_scene"]
                    target_ids = {s.id for s in window if s.id not in processed_segment_ids} if start_idx > 0 else None

                    # If starting a new scene, wipe prior conversational context to prevent character bleed
                    prior_context = [] if is_new_scene else all_decisions

                    async with factory() as db:
                        job = await db.get(TaggingJobModel, job_id)
                        if job:
                            job.current_step = (
                                f"Chapter {chap_idx + 1}/{total_chapters}: "
                                f"Batch {window_idx + 1}/{total_windows_in_chap} "
                                f"(segments {start_idx + 1}-{win_info['end_idx']})..."
                            )
                            await db.commit()

                    # Call DeepSeek with dynamic scene-bounded window
                    tag_res = await cls.tag_window_with_deepseek(
                        window_segments=window,
                        prior_decisions=prior_context,
                        project_settings=project.settings,
                        allow_offline_heuristic=allow_offline_heuristic,
                        known_characters=known_characters,
                        target_segment_ids=target_ids,
                        narrative_pov=narrative_pov,
                        return_merge_spans=True,
                    )
                    if len(tag_res) == 3:
                        window_decisions, usage, merge_spans = tag_res
                    else:
                        window_decisions, usage = tag_res
                        merge_spans = []

                    deleted_ids: set[str] = set()
                    if merge_spans:
                        async with factory() as db:
                            _, deleted_ids = await cls.apply_merge_spans(merge_spans, chapter.id, db)

                    # Cooperative pacing between window requests to prevent bursting quota limits
                    await asyncio.sleep(1.5)

                    if usage:
                        total_api_calls += 1
                        p_tok = usage.get("prompt_tokens", 0)
                        c_tok = usage.get("completion_tokens", 0)
                        t_tok = usage.get("total_tokens", p_tok + c_tok)
                        hit_tok = usage.get("prompt_cache_hit_tokens", 0)
                        miss_tok = usage.get("prompt_cache_miss_tokens", max(0, p_tok - hit_tok))

                        total_prompt_tokens += p_tok
                        total_completion_tokens += c_tok
                        total_tokens += t_tok
                        total_cache_hit_tokens += hit_tok
                        total_cache_miss_tokens += miss_tok

                    decision_map = {d["segment_id"]: d for d in window_decisions if "segment_id" in d}

                    # Persist segment decisions to DB
                    async with factory() as db:
                        for seg in window:
                            if seg.id in deleted_ids:
                                processed_segment_ids.add(seg.id)
                                continue
                            processed_segment_ids.add(seg.id)
                            if seg.id in decision_map:
                                dec = decision_map[seg.id]
                                is_diag = bool(dec.get("is_dialogue", False))
                                is_thought = bool(dec.get("is_internal_thought", False))
                                deliv_type = dec.get("delivery_type") or ("dialogue" if is_diag else ("internal_thought" if is_thought else "narration"))

                                await db.execute(
                                    update(ScriptSegmentModel)
                                    .where(ScriptSegmentModel.id == seg.id)
                                    .values(
                                        delivery_type=str(deliv_type)[:30] if deliv_type else "narration",
                                        is_dialogue=is_diag,
                                        is_internal_thought=is_thought,
                                        speaker=str(dec["speaker"])[:255] if dec.get("speaker") else None,
                                        speaker_gender=str(dec["gender"])[:50] if dec.get("gender") else None,
                                        emotion=str(dec["paralinguistic_tag"])[:100] if dec.get("paralinguistic_tag") else None,
                                        raw_speaker_tag=str(dec.get("raw_speaker_tag"))[:100] if dec.get("raw_speaker_tag") else None,
                                    )
                                )
                        await db.commit()

                    # Dynamically update in-memory known_characters
                    for dec in window_decisions:
                        spk = dec.get("speaker")
                        if spk and spk not in {"Narrator", "System / Interface", "General Male", "General Female"}:
                            if cls.is_invalid_character_name(spk):
                                continue
                            existing_entry = next((k for k in known_characters if k["canonical_name"].lower() == spk.lower()), None)
                            raw_tag = dec.get("raw_speaker_tag")
                            dec_gender = dec.get("gender") or "male"
                            if not existing_entry:
                                aliases = [raw_tag] if (raw_tag and raw_tag.lower() != spk.lower()) else []
                                known_characters.append({
                                    "canonical_name": spk,
                                    "aliases": aliases,
                                    "gender": dec_gender,
                                })
                            else:
                                if dec_gender == "female" and existing_entry.get("gender") != "female":
                                    existing_entry["gender"] = "female"
                                if raw_tag and raw_tag.lower() != spk.lower() and raw_tag not in existing_entry["aliases"]:
                                    existing_entry["aliases"].append(raw_tag)

                    existing_dec_ids = {d["segment_id"] for d in all_decisions if "segment_id" in d}
                    all_decisions.extend([d for d in window_decisions if d.get("segment_id") not in existing_dec_ids])

                    # Dynamic ETA and live LLM report calculation
                    elapsed = time.monotonic() - start_time
                    unique_done = len(processed_segment_ids)
                    rate = unique_done / elapsed if elapsed > 0 else 0

                    diag_count = sum(1 for d in all_decisions if d.get("is_dialogue"))
                    narr_count = len(all_decisions) - diag_count

                    live_report = cls._compile_llm_report(
                        model=settings.DEEPSEEK_MODEL if total_api_calls > 0 else "offline_heuristic",
                        start_time=start_time,
                        total_api_calls=total_api_calls,
                        prompt_tokens=total_prompt_tokens,
                        completion_tokens=total_completion_tokens,
                        total_tokens=total_tokens,
                        cache_hit_tokens=total_cache_hit_tokens,
                        cache_miss_tokens=total_cache_miss_tokens,
                        total_segments=unique_done,
                        dialogue_segments=diag_count,
                        narration_segments=narr_count,
                        status="running",
                    )

                    async with factory() as db:
                        job = await db.get(TaggingJobModel, job_id)
                        if job:
                            job.processed_segments = min(job.total_segments, unique_done)
                            if job.total_segments > 0:
                                calculated_pct = (unique_done / job.total_segments) * 100
                                # Cap strictly at 99.0% while running so 100.0% is only shown upon completion
                                job.progress_percent = min(99.0, round(calculated_pct, 1))
                            rem_segs = max(0, job.total_segments - unique_done)
                            job.eta_seconds = int(rem_segs / rate) if rate > 0 else None
                            job.llm_report = live_report
                            await db.commit()

                # Chapter-wide validation pass for dialogue chain parity & split-dialogue consistency
                async with factory() as db:
                    seg_stmt = (
                        select(ScriptSegmentModel)
                        .where(ScriptSegmentModel.chapter_id == chapter.id)
                        .order_by(ScriptSegmentModel.order_index.asc())
                    )
                    chap_segments = list((await db.execute(seg_stmt)).scalars().all())

                    chap_decisions = [
                        {
                            "segment_id": s.id,
                            "delivery_type": s.delivery_type,
                            "is_dialogue": s.is_dialogue,
                            "is_internal_thought": s.is_internal_thought,
                            "speaker": s.speaker,
                            "raw_speaker_tag": s.raw_speaker_tag,
                            "gender": s.speaker_gender or "male",
                            "paralinguistic_tag": s.emotion,
                            "confidence": 0.9,
                        }
                        for s in chap_segments
                    ]

                    validated_decisions = cls.enforce_dialogue_chain_turn_taking(
                        chap_segments, chap_decisions, known_characters
                    )

                    val_map = {d["segment_id"]: d for d in validated_decisions}
                    for s in chap_segments:
                        vd = val_map.get(s.id)
                        if vd and (
                            s.speaker != vd["speaker"]
                            or s.speaker_gender != vd["gender"]
                            or s.delivery_type != vd["delivery_type"]
                            or s.raw_speaker_tag != vd.get("raw_speaker_tag")
                        ):
                            await db.execute(
                                update(ScriptSegmentModel)
                                .where(ScriptSegmentModel.id == s.id)
                                .values(
                                    delivery_type=str(vd["delivery_type"])[:30] if vd.get("delivery_type") else "narration",
                                    speaker=str(vd["speaker"])[:255] if vd.get("speaker") else None,
                                    speaker_gender=str(vd["gender"])[:50] if vd.get("gender") else None,
                                    raw_speaker_tag=str(vd.get("raw_speaker_tag"))[:100] if vd.get("raw_speaker_tag") else None,
                                )
                            )
                    await db.commit()

                # Mark chapter as tagged in database
                async with factory() as db:
                    ch_obj = await db.get(ChapterModel, chapter.id)
                    if ch_obj:
                        ch_obj.status = "tagged"
                        await db.commit()

                processed_chapters_count += 1
                async with factory() as db:
                    job = await db.get(TaggingJobModel, job_id)
                    if job:
                        job.processed_chapters = processed_chapters_count
                        await db.commit()

            for chap_idx, chapter in enumerate(chapters):
                try:
                    await _process_chapter(chap_idx, chapter)
                except asyncio.CancelledError:
                    raise
                except Exception as chap_err:
                    logger.exception(
                        "Tagging failed for Chapter %s ('%s'): %s; continuing to next chapter",
                        chapter.chapter_number,
                        chapter.title,
                        chap_err,
                    )
                    failed_chapters.append({
                        "chapter_id": chapter.id,
                        "chapter_number": chapter.chapter_number,
                        "title": chapter.title,
                        "error": str(chap_err),
                    })
                    processed_chapters_count += 1
                    async with factory() as db:
                        ch_obj = await db.get(ChapterModel, chapter.id)
                        if ch_obj:
                            ch_obj.status = "parsed"
                        job = await db.get(TaggingJobModel, job_id)
                        if job:
                            job.processed_chapters = processed_chapters_count
                            job.current_step = (
                                f"Warning: Chapter {chapter.chapter_number} failed ({str(chap_err)[:50]}); "
                                f"continuing to next chapter..."
                            )
                            await db.commit()

            # Finalize: update current step before character sync
            async with factory() as db:
                job = await db.get(TaggingJobModel, job_id)
                if job:
                    job.current_step = "Synchronizing character casting & finalizing metrics..."
                    await db.commit()

            # Synchronize characters once all chapters are complete
            async with factory() as db:
                synced_chars = await CharacterService.sync_characters_from_segments(project_id, db)
                balance_remaining, balance_currency = await cls._fetch_deepseek_balance()

                diag_count = sum(1 for d in all_decisions if d.get("is_dialogue"))
                narr_count = len(all_decisions) - diag_count

                final_report = cls._compile_llm_report(
                    model=settings.DEEPSEEK_MODEL if total_api_calls > 0 else "offline_heuristic",
                    start_time=start_time,
                    total_api_calls=total_api_calls,
                    prompt_tokens=total_prompt_tokens,
                    completion_tokens=total_completion_tokens,
                    total_tokens=total_tokens,
                    cache_hit_tokens=total_cache_hit_tokens,
                    cache_miss_tokens=total_cache_miss_tokens,
                    total_segments=len(processed_segment_ids),
                    dialogue_segments=diag_count,
                    narration_segments=narr_count,
                    characters_synced=[
                        {"name": c.name, "gender": c.gender, "lines": c.dialogue_count}
                        for c in synced_chars
                        if c.name.lower() != "narrator"
                    ],
                    failed_chapters=failed_chapters,
                    balance_remaining=balance_remaining,
                    balance_currency=balance_currency,
                    status="completed",
                )

                job = await db.get(TaggingJobModel, job_id)
                if job:
                    job.status = "completed"
                    job.progress_percent = 100.0
                    job.processed_segments = job.total_segments
                    job.processed_chapters = total_chapters
                    job.eta_seconds = 0
                    job.completed_at = datetime.now(UTC)
                    job.llm_report = final_report
                    if failed_chapters:
                        job.error_type = "partial_warning"
                        failed_str = ", ".join(f"Ch. {fc['chapter_number']}" for fc in failed_chapters)
                        job.error_message = (
                            f"{len(failed_chapters)} chapter(s) were skipped due to errors and remain untagged: {failed_str}."
                        )
                        job.current_step = (
                            f"Completed with warnings. Untagged: {failed_str}. Synced {len(synced_chars)} characters."
                        )
                    else:
                        job.current_step = f"Completed. Synced {len(synced_chars)} characters."
                    await db.commit()

        except asyncio.CancelledError:
            logger.info("Tagging job %s cancelled", job_id)
            try:
                # Synchronize characters discovered up to this point so progress is never lost
                try:
                    async with factory() as db:
                        await CharacterService.sync_characters_from_segments(project_id, db)
                except Exception as sync_err:
                    logger.warning("Could not sync characters on cancellation: %s", sync_err)

                balance_remaining, balance_currency = await cls._fetch_deepseek_balance()
                diag_count = sum(1 for d in all_decisions if d.get("is_dialogue"))
                narr_count = len(all_decisions) - diag_count

                cancelled_report = cls._compile_llm_report(
                    model=settings.DEEPSEEK_MODEL if total_api_calls > 0 else "offline_heuristic",
                    start_time=start_time,
                    total_api_calls=total_api_calls,
                    prompt_tokens=total_prompt_tokens,
                    completion_tokens=total_completion_tokens,
                    total_tokens=total_tokens,
                    cache_hit_tokens=total_cache_hit_tokens,
                    cache_miss_tokens=total_cache_miss_tokens,
                    total_segments=len(processed_segment_ids),
                    dialogue_segments=diag_count,
                    narration_segments=narr_count,
                    balance_remaining=balance_remaining,
                    balance_currency=balance_currency,
                    status="cancelled",
                )

                async with factory() as db:
                    job = await db.get(TaggingJobModel, job_id)
                    if job:
                        job.status = "cancelled"
                        job.current_step = f"Cancelled by user. Processed {len(processed_segment_ids)} segments."
                        job.eta_seconds = 0
                        job.completed_at = datetime.now(UTC)
                        job.llm_report = cancelled_report
                        await db.commit()
            except Exception as cleanup_err:
                logger.error("Error finalizing cancelled job %s: %s", job_id, cleanup_err)
            raise

        except DeepSeekAPIError as exc:
            logger.error("Tagging job %s failed with DeepSeekAPIError: %s", job_id, exc.message)
            try:
                # Synchronize characters discovered up to this point so progress is never lost
                try:
                    async with factory() as db:
                        await CharacterService.sync_characters_from_segments(project_id, db)
                except Exception as sync_err:
                    logger.warning("Could not sync characters on API error: %s", sync_err)

                balance_remaining, balance_currency = await cls._fetch_deepseek_balance()
                diag_count = sum(1 for d in all_decisions if d.get("is_dialogue"))
                narr_count = len(all_decisions) - diag_count

                failed_report = cls._compile_llm_report(
                    model=settings.DEEPSEEK_MODEL if total_api_calls > 0 else "offline_heuristic",
                    start_time=start_time,
                    total_api_calls=total_api_calls,
                    prompt_tokens=total_prompt_tokens,
                    completion_tokens=total_completion_tokens,
                    total_tokens=total_tokens,
                    cache_hit_tokens=total_cache_hit_tokens,
                    cache_miss_tokens=total_cache_miss_tokens,
                    total_segments=len(processed_segment_ids),
                    dialogue_segments=diag_count,
                    narration_segments=narr_count,
                    balance_remaining=balance_remaining,
                    balance_currency=balance_currency,
                    status="failed",
                )

                async with factory() as db:
                    job = await db.get(TaggingJobModel, job_id)
                    if job:
                        job.status = "failed"
                        job.error_type = exc.error_type
                        job.error_message = exc.message
                        job.current_step = f"Failed: {exc.message}"
                        job.eta_seconds = 0
                        job.completed_at = datetime.now(UTC)
                        job.llm_report = failed_report
                        await db.commit()
            except Exception as cleanup_err:
                logger.error("Error recording failure for job %s: %s", job_id, cleanup_err)

        except Exception as exc:
            logger.exception("Tagging job %s failed with unexpected error: %s", job_id, exc)
            try:
                # Synchronize characters discovered up to this point so progress is never lost
                try:
                    async with factory() as db:
                        await CharacterService.sync_characters_from_segments(project_id, db)
                except Exception as sync_err:
                    logger.warning("Could not sync characters on error: %s", sync_err)

                balance_remaining, balance_currency = await cls._fetch_deepseek_balance()
                diag_count = sum(1 for d in all_decisions if d.get("is_dialogue"))
                narr_count = len(all_decisions) - diag_count

                failed_report = cls._compile_llm_report(
                    model=settings.DEEPSEEK_MODEL if total_api_calls > 0 else "offline_heuristic",
                    start_time=start_time,
                    total_api_calls=total_api_calls,
                    prompt_tokens=total_prompt_tokens,
                    completion_tokens=total_completion_tokens,
                    total_tokens=total_tokens,
                    cache_hit_tokens=total_cache_hit_tokens,
                    cache_miss_tokens=total_cache_miss_tokens,
                    total_segments=len(processed_segment_ids),
                    dialogue_segments=diag_count,
                    narration_segments=narr_count,
                    balance_remaining=balance_remaining,
                    balance_currency=balance_currency,
                    status="failed",
                )

                async with factory() as db:
                    job = await db.get(TaggingJobModel, job_id)
                    if job:
                        job.status = "failed"
                        job.error_type = "unknown_error"
                        job.error_message = str(exc)
                        job.current_step = f"Failed: {str(exc)}"
                        job.eta_seconds = 0
                        job.completed_at = datetime.now(UTC)
                        job.llm_report = failed_report
                        await db.commit()
            except Exception as cleanup_err:
                logger.error("Error recording error for job %s: %s", job_id, cleanup_err)

        finally:
            ACTIVE_TAGGING_TASKS.pop(project_id, None)
