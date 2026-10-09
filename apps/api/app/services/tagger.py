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
from app.services.parser import QUOTE_SPAN_RE, SYSTEM_PROMPT_RE
from novelova_core.exceptions import NotFoundError, ValidationError
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
Analyze text segments in sequence.

1. Delivery Modes: Spoken Dialogue vs. Internal Thoughts vs. System Windows vs. Narration:
   You determine the delivery type of each segment: "dialogue", "internal_thought", "system_prompt", or "narration".

   A. SPOKEN DIALOGUE ("delivery_type": "dialogue", "is_dialogue": true, "is_internal_thought": false):
      - Words spoken ALOUD by a character to another person, spoken out loud to a room, direct vocal speech, shouting, or direct vocal telepathy/divine speech addressed to another entity (e.g. [I accept your tribute...]).
      - Enclosed in DOUBLE QUOTES ("...", “...”), bracketed speech ([...]), Asian dialogue quotes (「...」), OR has spoken speech verbs addressed to others ('Deputy Manager Seo...', 'Director Kim asked').
      - Set "delivery_type": "dialogue", "is_dialogue": true, "is_internal_thought": false, and attribute to the speaking character ("speaker": "Director Kim", "speaker": "Jeon Myeong-hoon", etc.).

   B. INTERNAL THOUGHTS ("delivery_type": "internal_thought", "is_dialogue": false, "is_internal_thought": true, "speaker": "Narrator", "gender": "neutral"):
      - Unspoken mental reflections, thoughts in a character's mind, silent musings, memories, or internal monologues that are NOT spoken out loud to others.
      - Typically enclosed in SINGLE QUOTES ('...' or ‘...’) without external speech verbs.
      - AUDIOBOOK RULE FOR INTERNAL THOUGHTS:
        In audiobook production, silent internal thoughts are voiced by the Narrator!
        You MUST set "delivery_type": "internal_thought", "is_dialogue": false, "is_internal_thought": true, "speaker": "Narrator", "gender": "neutral".
        NEVER assign an internal thought to a character name! NEVER set "is_dialogue": true for internal thoughts!

   C. SYSTEM WINDOWS / LITRPG PROMPTS ("delivery_type": "system_prompt", "is_dialogue": false, "is_internal_thought": false, "speaker": "System / Interface", "gender": "neutral"):
      - System notifications, LitRPG status screens, quest alerts, skill popups, or game chimes (e.g. [System: Alert], 【Quest Completed】, [Skill: Wind Blade]).
      - You MUST set "delivery_type": "system_prompt", "is_dialogue": false, "is_internal_thought": false, "speaker": "System / Interface", "gender": "neutral".

   D. NARRATION ("delivery_type": "narration", "is_dialogue": false, "is_internal_thought": false, "speaker": "Narrator", "gender": "neutral"):
      - Descriptive prose, exposition, action beats, scene descriptions, and quoted narrative terms.
      - Always set "delivery_type": "narration", "is_dialogue": false, "is_internal_thought": false, "speaker": "Narrator", "gender": "neutral".

2. Speaker Attribution Priority & Canonical Alias Resolution:
   - For every spoken dialogue segment ("delivery_type": "dialogue"):
     - Check the provided "known_characters" list. If a character is referred to by a known alias, title, rank, or nickname (e.g., "Section Chief Jeon", "Elder Jeon", "Senior Brother" -> canonical name "Jeon Myeong-hoon"):
       * Attribute the CANONICAL character name to "speaker" ("speaker": "Jeon Myeong-hoon").
       * Record the verbatim text tag or title in "raw_speaker_tag" (e.g., "Section Chief Jeon").
     - If the character is not yet in "known_characters", use narrative context and speech tags to identify the character name. Set "speaker" to that name, and "raw_speaker_tag" to the verbatim tag if different or if a specific title was used.
     - Specify the character's gender ("male" or "female").
   - For non-dialogue ("internal_thought", "system_prompt", "narration"), set "raw_speaker_tag": null.

3. Turn-Taking Alternation in Dialogue Chains (Ping-Pong Dialogue):
   - In rapid-fire exchanges where two characters speak back-and-forth without explicit speech tags ("Did you see him?" / "No." / "Where did he go?" / "Toward the gate."):
     - Characters strictly ALTERNATE turns (Character A, Character B, Character A, Character B).
     - NEVER attribute consecutive untagged dialogue turns to the same character in a two-person back-and-forth conversation. Maintain parity across the entire unbroken exchange.

4. Anonymous Fallback (only when speaker is genuinely unnamed/crowd):
   - "General Male" if male, or "General Female" if female.

5. Paralinguistic Sound Tags:
   ONLY when explicitly indicated by the narrative, assign one of:
   [laugh], [sigh], [gasp], [groan], [chuckle], [cough], [sniff], [shush], [clear throat].
   Otherwise null.

JSON schema:
{
  "decisions": [
    {
      "segment_id": "string",
      "delivery_type": "dialogue" | "internal_thought" | "system_prompt" | "narration",
      "is_dialogue": true | false,
      "is_internal_thought": true | false,
      "speaker": "string",
      "raw_speaker_tag": "string" | null,
      "gender": "male" | "female" | "neutral",
      "paralinguistic_tag": "string" | null,
      "confidence": 0.0 - 1.0
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
    @staticmethod
    def filter_paralinguistic_tag(
        tag: str | None,
        project_settings: dict[str, Any] | None,
    ) -> str | None:
        """
        Enforce project settings and strict 9 allowed tags constraint.
        """
        if not tag:
            return None
        cleaned = tag.strip().lower()
        canonical = None
        for allowed_tag in ALLOWED_PARALINGUISTIC_TAGS:
            if allowed_tag.lower() == cleaned:
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

    @classmethod
    def find_textual_speaker_tag(cls, text: str) -> str | None:
        """
        Check if text has an explicit speech tag pattern naming a person.
        e.g., 'said Holmes', 'Watson whispered', 'she warned'.
        Returns candidate string or None.
        """
        if not text:
            return None
        verb_after = re.search(
            r'(?:said|replied|asked|whispered|shouted|murmured|muttered|cried|warned|sighed|laughed|yelled|demanded)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)',
            text,
        )
        verb_before = re.search(
            r'([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:said|replied|asked|whispered|shouted|murmured|muttered|cried|warned|sighed|laughed|yelled|demanded)',
            text,
        )
        candidate = None
        if verb_after:
            candidate = verb_after.group(1).strip()
        elif verb_before:
            candidate = verb_before.group(1).strip()

        if candidate and candidate.lower() not in {"he", "she", "they", "it", "someone", "everyone", "nobody"}:
            return candidate
        return None

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

        def infer_name_gender(name: str) -> str:
            n_lower = name.lower()
            if (
                n_lower in {"mara", "elena", "clara", "sarah", "mary", "anna", "alice", "jane", "june", "emma", "lucy", "kate"}
                or any(name.startswith(title) for title in ("Mrs.", "Ms.", "Miss"))
            ):
                return "female"
            return "male"

        if not known_characters:
            return cleaned, infer_name_gender(cleaned), None

        # 1. Exact match on canonical_name
        for char in known_characters:
            c_name = char.get("canonical_name", "")
            if c_name and c_name.lower() == cleaned_lower:
                return c_name, char.get("gender", infer_name_gender(c_name)), None

        # 2. Exact match on aliases
        for char in known_characters:
            c_name = char.get("canonical_name", "")
            aliases = char.get("aliases") or []
            for alias in aliases:
                if alias and alias.lower() == cleaned_lower:
                    return c_name, char.get("gender", infer_name_gender(c_name)), cleaned

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
                        return c_name, char.get("gender", infer_name_gender(c_name)), cleaned

        return cleaned, infer_name_gender(cleaned), None

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

                    # Check textual speech verb
                    match = cls.find_textual_speaker_tag(s.text)
                    if match:
                        canonical, can_gnd, _ = cls.resolve_canonical_speaker(match, known_characters)
                        found_anchor = (canonical, can_gnd, match)
                        break

                    # Check decision raw_speaker_tag
                    if raw_tag and raw_tag not in {"General Male", "General Female", "Narrator"}:
                        canonical, can_gnd, _ = cls.resolve_canonical_speaker(raw_tag, known_characters)
                        found_anchor = (canonical, can_gnd, raw_tag)
                        break

                    # Check decision speaker if named character with high confidence
                    if spk and spk not in {"General Male", "General Female", "Narrator", "System / Interface"}:
                        if float(d.get("confidence", 0.0)) >= 0.8:
                            canonical, can_gnd, rtag = cls.resolve_canonical_speaker(spk, known_characters)
                            found_anchor = (canonical, can_gnd, rtag or spk)
                            break

                if found_anchor:
                    anchors[t_idx] = found_anchor

            unique_speakers = list(dict.fromkeys(name for name, _, _ in anchors.values()))

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
                for turn_segs in turns:
                    for s in turn_segs:
                        d = dec_map.get(s.id)
                        if d:
                            spk = d.get("speaker")
                            if spk and spk != name_a and spk not in {"Narrator", "System / Interface", "General Male", "General Female"}:
                                other_candidates.append(spk)

                if other_candidates:
                    best_other = max(set(other_candidates), key=other_candidates.count)
                    can_other, gnd_other, _ = cls.resolve_canonical_speaker(best_other, known_characters)
                    speaker_b = (can_other, gnd_other)
                elif prior_decisions:
                    for pd in reversed(prior_decisions):
                        spk = pd.get("speaker")
                        if spk and spk != name_a and spk not in {"Narrator", "System / Interface", "General Male", "General Female"}:
                            can_other, gnd_other, _ = cls.resolve_canonical_speaker(spk, known_characters)
                            speaker_b = (can_other, gnd_other)
                            break

                if not speaker_b and known_characters:
                    for kc in known_characters:
                        c_name = kc.get("canonical_name")
                        if c_name and c_name != name_a:
                            speaker_b = (c_name, kc.get("gender", "male"))
                            break

                if not speaker_b:
                    b_gender = "female" if gnd_a == "male" else "male"
                    b_name = "General Female" if b_gender == "female" else "General Male"
                    speaker_b = (b_name, b_gender)

            elif len(unique_speakers) == 0:
                chain_speakers = [
                    dec_map[s.id].get("speaker")
                    for turn_segs in turns
                    for s in turn_segs
                    if s.id in dec_map and dec_map[s.id].get("speaker") not in {"Narrator", "System / Interface"}
                ]
                distinct = list(dict.fromkeys(s for s in chain_speakers if s))
                if len(distinct) >= 2:
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
            is_sys = (
                getattr(seg, "delivery_type", "") == "system_prompt"
                or bool(SYSTEM_PROMPT_RE.search(text_stripped))
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

            is_single_quote_thought = bool(re.match(r"^['‘].+['’][.?!]?$", text_stripped))
            is_diag = seg.is_dialogue or bool(QUOTE_SPAN_RE.search(seg.text))

            if not is_diag:
                deliv = "internal_thought" if is_single_quote_thought else "narration"
                decisions.append({
                    "segment_id": seg.id,
                    "delivery_type": deliv,
                    "is_dialogue": False,
                    "is_internal_thought": is_single_quote_thought,
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
    async def tag_window_with_deepseek(
        cls,
        window_segments: list[ScriptSegmentModel],
        prior_decisions: list[dict[str, Any]],
        project_settings: dict[str, Any] | None,
        allow_offline_heuristic: bool = False,
        known_characters: list[dict[str, Any]] | None = None,
    ) -> tuple[list[dict[str, Any]], dict[str, Any]]:
        """
        Call DeepSeek chat API with sliding window payload and return structured decisions and usage stats.
        Raises DeepSeekAPIError on connection, auth, or rate limit failures so they are surfaced clearly.
        """
        if not settings.DEEPSEEK_API_KEY:
            if allow_offline_heuristic or settings.ENVIRONMENT == "test":
                logger.warning("DEEPSEEK_API_KEY is not configured; using offline heuristic.")
                return cls.apply_local_heuristic_attribution(window_segments, project_settings, known_characters), {}
            raise DeepSeekAPIError(
                "DEEPSEEK_API_KEY is missing. Please set your DeepSeek API key in environment or settings.",
                error_type="missing_api_key",
            )

        payload_segments = [
            {
                "segment_id": s.id,
                "text": s.text,
                "delivery_type": s.delivery_type,
                "dialogue_chain_id": s.dialogue_chain_id,
                "continuation_type": s.continuation_type,
            }
            for s in window_segments
        ]

        user_content = json.dumps({
            "recent_context": prior_decisions[-15:],
            "known_characters": (known_characters or [])[-30:],
            "segments_to_attribute": payload_segments,
        })

        headers = {
            "Authorization": f"Bearer {settings.DEEPSEEK_API_KEY}",
            "Content-Type": "application/json",
        }

        request_body = {
            "model": settings.DEEPSEEK_MODEL,
            "messages": [
                {"role": "system", "content": STAGE_B_SYSTEM_PROMPT},
                {"role": "user", "content": user_content},
            ],
            "temperature": 0.1,
            "max_tokens": 8192,
            "response_format": {"type": "json_object"},
        }

        max_attempts = 3
        backoff = 2.0

        for attempt in range(1, max_attempts + 1):
            try:
                async with httpx.AsyncClient(timeout=60.0) as client:
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
                    if resp.status_code == 429:
                        if attempt < max_attempts:
                            logger.warning("DeepSeek 429 rate limit hit. Backing off for %.1fs...", backoff)
                            await asyncio.sleep(backoff)
                            backoff *= 2
                            continue
                        raise DeepSeekAPIError(
                            "DeepSeek API rate limit reached (HTTP 429). Please slow down or check tier limits.",
                            error_type="rate_limit",
                            status_code=429,
                        )
                    if resp.status_code >= 500:
                        if attempt < max_attempts:
                            await asyncio.sleep(backoff)
                            continue
                        raise DeepSeekAPIError(
                            f"DeepSeek internal server error (HTTP {resp.status_code}): Service temporarily unavailable.",
                            error_type="server_error",
                            status_code=resp.status_code,
                        )

                    resp.raise_for_status()
                    data = resp.json()
                    content = data["choices"][0]["message"]["content"]
                    finish_reason = data["choices"][0].get("finish_reason")

                    try:
                        parsed = json.loads(content)
                        decisions_raw = parsed.get("decisions", [])
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
                        decisions_raw = []
                        for m in raw_matches:
                            try:
                                dec = json.loads(m)
                                if "segment_id" in dec:
                                    decisions_raw.append(dec)
                            except Exception:
                                continue

                        if not decisions_raw:
                            if attempt < max_attempts:
                                await asyncio.sleep(backoff)
                                backoff *= 2
                                continue
                            raise DeepSeekAPIError(
                                f"DeepSeek response was truncated or contained invalid JSON: {json_err}",
                                error_type="malformed_response",
                            ) from json_err
                        logger.info(
                            "Rescued %d decisions from truncated JSON via pattern extraction.",
                            len(decisions_raw),
                        )

                    clean_decisions: list[dict[str, Any]] = []
                    seg_by_id = {s.id: s for s in window_segments}
                    for d in decisions_raw:
                        seg_id = d.get("segment_id")
                        deliv_type = d.get("delivery_type")
                        is_diag = bool(d.get("is_dialogue", False))
                        is_thought = bool(d.get("is_internal_thought", False))
                        speaker = d.get("speaker")
                        raw_tag = d.get("raw_speaker_tag")
                        gender = (d.get("gender") or "male").lower()
                        if gender not in {"male", "female", "neutral"}:
                            gender = "neutral" if not is_diag else "male"

                        seg_obj = seg_by_id.get(seg_id)
                        text_stripped = seg_obj.text.strip() if seg_obj else ""
                        is_system_seg = (
                            (seg_obj and seg_obj.delivery_type == "system_prompt")
                            or deliv_type == "system_prompt"
                            or bool(SYSTEM_PROMPT_RE.search(text_stripped))
                        )

                        if is_system_seg:
                            deliv_type = "system_prompt"
                            is_diag = False
                            is_thought = False
                            speaker = "System / Interface"
                            gender = "neutral"
                            raw_tag = None
                        elif is_thought or deliv_type == "internal_thought":
                            deliv_type = "internal_thought"
                            is_diag = False
                            is_thought = True
                            speaker = "Narrator"
                            gender = "neutral"
                            raw_tag = None
                        elif not speaker or speaker.lower() == "narrator" or (deliv_type == "narration" and not is_diag):
                            deliv_type = "narration"
                            is_diag = False
                            is_thought = False
                            speaker = "Narrator"
                            gender = "neutral"
                            raw_tag = None
                        else:
                            deliv_type = "dialogue"
                            is_diag = True
                            is_thought = False
                            if speaker.lower() in {"unknown", "unspecified", "anonymous"}:
                                speaker = "General Female" if gender == "female" else "General Male"
                            else:
                                canonical, can_gnd, canonical_raw = cls.resolve_canonical_speaker(speaker, known_characters)
                                speaker = canonical
                                if canonical_raw and not raw_tag:
                                    raw_tag = canonical_raw
                                if can_gnd:
                                    gender = can_gnd

                        tag = cls.filter_paralinguistic_tag(d.get("paralinguistic_tag"), project_settings)

                        clean_decisions.append({
                            "segment_id": seg_id,
                            "delivery_type": deliv_type,
                            "is_dialogue": is_diag,
                            "is_internal_thought": is_thought,
                            "speaker": speaker,
                            "raw_speaker_tag": raw_tag,
                            "gender": gender,
                            "paralinguistic_tag": tag,
                            "confidence": float(d.get("confidence", 0.9)),
                        })

                    clean_decisions = cls.enforce_dialogue_chain_turn_taking(
                        window_segments, clean_decisions, known_characters, prior_decisions
                    )

                    usage = data.get("usage", {})
                    return clean_decisions, usage

            except httpx.TimeoutException as exc:
                if attempt < max_attempts:
                    await asyncio.sleep(1.0)
                    continue
                raise DeepSeekAPIError(
                    "DeepSeek API request timed out (connection exceeded 60 seconds).",
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
        balance_remaining: str | None = None,
        balance_currency: str = "USD",
        status: str = "completed",
    ) -> dict[str, Any]:
        """Compile a structured LLM report with usage, pricing, and timing."""
        cost_usd = (
            (cache_miss_tokens * 0.27)
            + (cache_hit_tokens * 0.07)
            + (completion_tokens * 1.10)
        ) / 1_000_000

        return {
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
                "pricing_model": "DeepSeek-V3 ($0.27/1M input miss, $0.07/1M input hit, $1.10/1M output)",
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
        return (await db.execute(stmt)).scalar_one_or_none()

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
            except (asyncio.CancelledError, asyncio.TimeoutError, Exception):
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
        allow_offline_heuristic: bool = False,
    ) -> TaggingJobModel:
        """
        Enqueue an asynchronous Stage B dialogue tagging background job.
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

        # Fetch chapters & count segments
        stmt = (
            select(ChapterModel)
            .where(ChapterModel.project_id == project_id)
            .order_by(ChapterModel.order_index.asc())
        )
        chapters = list((await db.execute(stmt)).scalars().all())
        total_chapters = len(chapters)

        # Count total segments
        seg_count_stmt = (
            select(ScriptSegmentModel.id)
            .join(ChapterModel, ScriptSegmentModel.chapter_id == ChapterModel.id)
            .where(ChapterModel.project_id == project_id)
        )
        total_segments = len((await db.execute(seg_count_stmt)).scalars().all())

        job = TaggingJobModel(
            project_id=project_id,
            status="pending",
            total_chapters=total_chapters,
            processed_chapters=0,
            total_segments=total_segments,
            processed_segments=0,
            progress_percent=0.0,
            current_step="Enqueued in background queue...",
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
                allow_offline_heuristic=allow_offline_heuristic,
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
        allow_offline_heuristic: bool = False,
        window_size: int = 25,
        overlap: int = 5,
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
                    if not c.is_system and c.name.lower() != "narrator"
                ]

            for chap_idx, chapter in enumerate(chapters):
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
                    continue

                # Check if chapter is already fully tagged when resuming
                is_chapter_already_tagged = (
                    resume
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
                    continue

                # Update job status before processing chapter windows
                async with factory() as db:
                    job = await db.get(TaggingJobModel, job_id)
                    if job:
                        job.current_chapter_title = f"Chapter {chapter.chapter_number}: {chapter.title}"
                        job.current_step = f"Processing Chapter {chap_idx + 1} of {total_chapters}..."
                        await db.commit()

                step = max(1, window_size - overlap)
                total_windows_in_chap = max(1, (len(segments) + step - 1) // step)

                for window_idx, start_idx in enumerate(range(0, len(segments), step)):
                    window = segments[start_idx : start_idx + window_size]

                    async with factory() as db:
                        job = await db.get(TaggingJobModel, job_id)
                        if job:
                            job.current_step = (
                                f"Chapter {chap_idx + 1}/{total_chapters}: "
                                f"Batch {window_idx + 1}/{total_windows_in_chap} "
                                f"(segments {start_idx + 1}-{min(len(segments), start_idx + len(window))})..."
                            )
                            await db.commit()

                    # Call DeepSeek with sliding window
                    window_decisions, usage = await cls.tag_window_with_deepseek(
                        window_segments=window,
                        prior_decisions=all_decisions,
                        project_settings=project.settings,
                        allow_offline_heuristic=allow_offline_heuristic,
                        known_characters=known_characters,
                    )

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
                                        delivery_type=deliv_type,
                                        is_dialogue=is_diag,
                                        is_internal_thought=is_thought,
                                        speaker=dec["speaker"],
                                        speaker_gender=dec["gender"],
                                        emotion=dec["paralinguistic_tag"],
                                        raw_speaker_tag=dec.get("raw_speaker_tag"),
                                    )
                                )
                        await db.commit()

                    # Dynamically update in-memory known_characters
                    for dec in window_decisions:
                        spk = dec.get("speaker")
                        if spk and spk not in {"Narrator", "System / Interface", "General Male", "General Female"}:
                            existing_entry = next((k for k in known_characters if k["canonical_name"].lower() == spk.lower()), None)
                            raw_tag = dec.get("raw_speaker_tag")
                            if not existing_entry:
                                aliases = [raw_tag] if (raw_tag and raw_tag.lower() != spk.lower()) else []
                                known_characters.append({
                                    "canonical_name": spk,
                                    "aliases": aliases,
                                    "gender": dec.get("gender", "male"),
                                })
                            else:
                                if raw_tag and raw_tag.lower() != spk.lower() and raw_tag not in existing_entry["aliases"]:
                                    existing_entry["aliases"].append(raw_tag)

                    all_decisions.extend(window_decisions)

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
                                    delivery_type=vd["delivery_type"],
                                    speaker=vd["speaker"],
                                    speaker_gender=vd["gender"],
                                    raw_speaker_tag=vd.get("raw_speaker_tag"),
                                )
                            )
                    await db.commit()

                processed_chapters_count += 1
                async with factory() as db:
                    job = await db.get(TaggingJobModel, job_id)
                    if job:
                        job.processed_chapters = processed_chapters_count
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
                    job.current_step = f"Completed. Synced {len(synced_chars)} characters."
                    await db.commit()

        except asyncio.CancelledError:
            logger.info("Tagging job %s cancelled", job_id)
            try:
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
