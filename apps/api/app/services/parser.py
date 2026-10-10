import io
import re
import uuid
import xml.etree.ElementTree as ET
import zipfile
from dataclasses import dataclass
from typing import Any

import inflect
from app.models.project import ProjectModel
from app.schemas.chapter import ParseOptionsSchema
from novelova_core.exceptions import ValidationError
from novelova_core.linguistics import (
    DISCOURSE_AND_GRAMMAR_STOPWORDS,
    DISCOURSE_IDIOMS,
    GENERIC_TITLES_OF_ADDRESS,
    SPEECH_VERBS,
    is_invalid_character_name,
)
from novelova_core.logging import setup_logger

logger = setup_logger("novelova.parser")

WORDS_PER_MINUTE = 145

_inflect_engine = inflect.engine()

PROTECTED_NUMBER_RE = re.compile(
    r"(?:\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b|"  # dates like 12/04/2024
    r"[$€£]\s?\d[\d,]*(?:\.\d+)?|"             # currencies with symbol
    r"\b\d[\d,]*(?:\.\d+)?\s?(?:USD|EUR|GBP)\b|" # currencies with code
    r"\b(?:1\d{3}|20\d{2}|21\d{2})\b|"         # 4-digit years like 1998, 2024
    r"\b\d+(?:\.\d+)?\s*[-–—]\s*\d+(?:\.\d+)?\b|" # numeric ranges
    r"\b\d+(?:\.\d+)?\s*(?:km|cm|mm|kg|mg|m|ft|mph|kph|Hz|kHz|MHz|GHz)\b|"  # measurements
    r"\b(?:Chapter|Section|Book|Volume|Part)\s+\d+\b)",  # chapter & section headings
    re.IGNORECASE,
)
UNAMBIGUOUS_NUMBER_RE = re.compile(r"(?<![\w\]])(-?\d+(?:\.\d+)?)(?![\w\[])")

SENTENCE_BOUNDARY = re.compile(
    r"(?<=[.!?])(?P<closing>[\"'\u201d\u2019\]\)]*)\s+(?=[A-Z0-9\u201c\"'\[(])"
)
NON_TERMINAL_ABBREVIATIONS = frozenset(
    {"dr.", "mr.", "mrs.", "ms.", "st.", "vs.", "etc.", "e.g.", "i.e."}
)
QUOTE_SPAN_RE = re.compile(
    r"("
    r"\[[^\]\n]+\]|"
    r"【[^】\n]+】|"
    r"「[^」\n]+」|"
    r"『[^』\n]+』|"
    r"(?:“[\'\"]?|\"[\'\"]?)[^\u201d\"\n]+?(?:[\'\"]?”|[\'\"]?\")|"
    r"(?<!\w)[‘'\u2018][^'’\u2018\u2019\n]+?[’'\u2019](?!\w)"
    r")"
)

SYSTEM_PROMPT_RE = re.compile(
    r"^(?:\[|【)\s*(?:"
    r"System|Status|Notice|Alert|Skill|Quest|Warning|Notification|"
    r"Attribute|Level\s*Up|Item|Inventory|Reward|Passive|Active|Title|Buff|Debuff|Mission"
    r")(?:\s*[:\s\n-]|\]|】)",
    re.IGNORECASE,
)

TRANSLATOR_NOTE_RE = re.compile(
    r"^(?:\[|【|\{)\s*(?:TN|TL|PR|ED|Note|Author|Translator|Editor)\b",
    re.IGNORECASE,
)

INLINE_SINGLE_QUOTE_RE = re.compile(
    r"(?<!\w)([‘'\u2018])([^'’\u2018\u2019\n\r]+?)([’'\u2019])(?!\w)"
)

SPEECH_VERB_PREFIX_RE = re.compile(
    rf"(?:{SPEECH_VERBS})\s*[,:]\s*$",
    re.IGNORECASE,
)

SPEECH_VERB_SUFFIX_RE = re.compile(
    rf"^\s*[,]?\s*(?:{SPEECH_VERBS})\b",
    re.IGNORECASE,
)


@dataclass
class ParsedSegment:
    text: str
    is_dialogue: bool
    delivery_type: str = "narration"
    continuation_type: str = "none"
    parent_turn_id: str | None = None
    dialogue_chain_id: str | None = None
    is_internal_thought: bool = False
    speaker: str | None = None
    speaker_gender: str | None = None
    raw_speaker_tag: str | None = None

    def __iter__(self):
        yield self.text
        yield self.is_dialogue

    def __getitem__(self, index: int):
        if index == 0:
            return self.text
        if index == 1:
            return self.is_dialogue
        raise IndexError("ParsedSegment index out of range")


class ManuscriptParserService:
    @staticmethod
    def is_invalid_character_name(name: str | None) -> bool:
        """Expose linguistic validator on parser service."""
        return is_invalid_character_name(name)

    @classmethod
    def speak_unambiguous_numbers(cls, text: str) -> str:
        """Convert plain numbers to spoken words using inflect while preserving dates, currencies, years, and measurements."""
        if not text:
            return ""

        protected_spans = [(m.start(), m.end()) for m in PROTECTED_NUMBER_RE.finditer(text)]

        def replace_match(match: re.Match[str]) -> str:
            start, end = match.start(), match.end()
            if any(p_start <= start < p_end for p_start, p_end in protected_spans):
                return match.group(0)

            token = match.group(1)
            try:
                if "." in token:
                    parts = token.split(".", 1)
                    whole = _inflect_engine.number_to_words(int(parts[0]))
                    fraction = " ".join(_inflect_engine.number_to_words(int(d)) for d in parts[1])
                    return f"{whole} point {fraction}"
                val = int(token)
                if abs(val) > 999_999_999:
                    return token
                return _inflect_engine.number_to_words(val)
            except Exception:
                return match.group(0)

        return UNAMBIGUOUS_NUMBER_RE.sub(replace_match, text)

    @staticmethod
    def normalize_dialogue_quotes(text: str) -> str:
        """
        Normalize pseudo-double quotes and malformed web-novel quotation marks:
        - Consecutive single quotes ('' or ‘' or '’ or ‘’) simulating double quotes -> "
        - Asymmetric curly/straight quote combinations
        """
        if not text:
            return ""
        res = re.sub(r"''", '"', text)
        res = re.sub(r"[‘\u2018]'", '"', res)
        res = re.sub(r"'[’\u2019]", '"', res)
        res = re.sub(r"[‘\u2018][’\u2019]", '"', res)
        res = re.sub(r"[’\u2019]'", '"', res)
        return res

    @classmethod
    def clean_text(cls, text: str, options: ParseOptionsSchema) -> str:
        """Apply configurable cleaning options to the raw text."""
        result = text

        # 0. Always normalize malformed quote patterns
        result = cls.normalize_dialogue_quotes(result)

        # 1. Remove extra whitespace
        if options.remove_whitespace:
            result = result.replace("\u00a0", " ").replace("\u200b", "")
            result = re.sub(r"[ \t]+", " ", result)
            result = "\n".join(line.strip() for line in result.splitlines())

        # 2. Normalize paragraph breaks
        if options.normalize_paragraphs:
            result = re.sub(r"\r\n|\r", "\n", result)
            result = re.sub(r"\n{3,}", "\n\n", result)

        # 3. Fix common punctuation spacing (horizontal spaces only so paragraphs are preserved)
        if options.fix_punctuation_spacing:
            result = re.sub(r"[ \t]+([,.:;?!])", r"\1", result)
            result = re.sub(r"([.?!])[ \t]{2,}", r"\1 ", result)
            result = re.sub(r"--+", "—", result)

        # 4. Spoken number conversion via inflect
        if options.speak_unambiguous_numbers:
            result = cls.speak_unambiguous_numbers(result)

        return result

    @staticmethod
    def extract_from_docx_bytes(data: bytes) -> str:
        """Extract text from DOCX bytes using standard library zipfile and XML parsing."""
        try:
            with zipfile.ZipFile(io.BytesIO(data), "r") as docx_zip:
                xml_content = docx_zip.read("word/document.xml")
                root = ET.fromstring(xml_content)
                namespaces = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
                paragraphs = []
                for p in root.iterfind(".//w:p", namespaces):
                    texts = [t.text for t in p.iterfind(".//w:t", namespaces) if t.text]
                    if texts:
                        paragraphs.append("".join(texts))
                return "\n\n".join(paragraphs)
        except Exception as exc:
            logger.error("Failed to extract text from DOCX bytes: %s", exc)
            return ""

    @staticmethod
    def extract_from_epub_bytes(data: bytes) -> str:
        """Extract text from EPUB bytes using standard library zipfile."""
        try:
            with zipfile.ZipFile(io.BytesIO(data), "r") as epub_zip:
                html_files = [
                    f for f in epub_zip.namelist() if f.endswith((".xhtml", ".html", ".htm"))
                ]
                extracted_parts = []
                for html_file in sorted(html_files):
                    content = epub_zip.read(html_file).decode("utf-8", errors="ignore")
                    text = re.sub(r"<[^>]+>", " ", content)
                    text = re.sub(r"\s+", " ", text).strip()
                    if text:
                        extracted_parts.append(text)
                return "\n\n".join(extracted_parts)
        except Exception as exc:
            logger.error("Failed to extract text from EPUB bytes: %s", exc)
            return ""

    @staticmethod
    def extract_from_text_bytes(data: bytes) -> str:
        """Decode plain text bytes with multi-encoding fallbacks."""
        for enc in ("utf-8", "utf-8-sig", "latin-1", "cp1252"):
            try:
                return data.decode(encoding=enc)
            except Exception:
                continue
        return data.decode("utf-8", errors="ignore")

    @classmethod
    def read_manuscript_bytes(cls, data: bytes, filename: str) -> str:
        """Route manuscript bytes to the proper extractor based on filename extension."""
        suffix = filename.lower().split(".")[-1] if "." in filename else "txt"
        if suffix == "docx":
            return cls.extract_from_docx_bytes(data)
        if suffix == "epub":
            return cls.extract_from_epub_bytes(data)
        return cls.extract_from_text_bytes(data)

    @classmethod
    def split_sentence_fragments(cls, text: str) -> list[str]:
        """Split text into sentence units respecting closing quotes and ignoring common non-terminal abbreviations."""
        if not text:
            return []
        fragments: list[str] = []
        start = 0
        for match in SENTENCE_BOUNDARY.finditer(text):
            prefix = text[: match.start()].rstrip().lower()
            previous = prefix.rsplit(maxsplit=1)[-1].lstrip("\"'“‘([") if prefix else ""
            if previous in NON_TERMINAL_ABBREVIATIONS:
                continue
            boundary = match.start() + len(match.group("closing"))
            fragment = text[start:boundary].strip()
            if fragment:
                fragments.append(fragment)
            start = match.end()
        tail = text[start:].strip()
        if tail:
            fragments.append(tail)
        return fragments

    @classmethod
    def is_short_bracket_system_prompt(cls, text: str) -> bool:
        """
        Check if a bracketed segment [...] or 【...】 is a skill invocation or system label
        (e.g. [Flash], [Heavy Strike], [Status], [Inspect]) rather than spoken telepathy.
        """
        t = text.strip()
        if not ((t.startswith("[") and t.endswith("]")) or (t.startswith("【") and t.endswith("】"))):
            return False
        if SYSTEM_PROMPT_RE.search(t):
            return True
        inner = t[1:-1].strip()
        # Telepathic dialogue usually contains conversational clauses, questions, or terminal periods
        if inner.endswith("?") or re.search(r"[.!?]\s+[A-Z]", inner):
            return False
        words = inner.split()
        return len(words) <= 4 and not inner.endswith(".")

    @classmethod
    def is_inline_single_quote(cls, text: str, start: int, end: int, inner: str) -> bool:
        """
        Determine whether a single-quoted span is an inline proper noun, title, or concept
        (e.g., 'Familiar Contract Ceremony', 'Arcanum', 'Tumultus', 'protagonist')
        embedded within a narration clause, rather than standalone dialogue.
        """
        inner_stripped = inner.strip()
        if not inner_stripped:
            return False
        # If inner text ends with terminal sentence punctuation, it is likely a spoken utterance or thought
        if inner_stripped[-1] in ".!?":
            return False
        # Multiple sentences inside single quotes is not an inline term
        if re.search(r"[.!?]\s+", inner_stripped):
            return False

        prefix = text[:start].rstrip()
        suffix = text[end:].lstrip()

        # If suffix or prefix is an overt speech attribution tag, treat as dialogue
        if SPEECH_VERB_SUFFIX_RE.search(suffix) or SPEECH_VERB_PREFIX_RE.search(prefix):
            return False

        is_mid_sentence_prefix = bool(prefix) and prefix[-1] not in ".!?\n\r\"“"
        is_mid_sentence_suffix = bool(suffix) and (
            suffix[0].islower()
            or suffix.startswith((",", ";", ":", "—", "–", "...", "-"))
            or not suffix[0].isupper()
        )

        words = inner_stripped.split()
        return len(words) <= 10 and (is_mid_sentence_prefix or is_mid_sentence_suffix)

    @classmethod
    def protect_inline_single_quotes(cls, text: str) -> tuple[str, dict[str, str]]:
        """Temporarily protect inline single-quoted terms from QUOTE_SPAN_RE splitting."""
        mapping: dict[str, str] = {}

        def repl(m: re.Match[str]) -> str:
            if cls.is_inline_single_quote(text, m.start(), m.end(), m.group(2)):
                key = f"\uE002{len(mapping)}\uE003"
                mapping[key] = m.group(0)
                return key
            return m.group(0)

        subbed = INLINE_SINGLE_QUOTE_RE.sub(repl, text)
        return subbed, mapping

    @classmethod
    def restore_inline_single_quotes(cls, text: str, mapping: dict[str, str]) -> str:
        """Restore protected inline single-quoted terms to their original text."""
        res = text
        for k, v in mapping.items():
            res = res.replace(k, v)
        return res

    @classmethod
    def protect_contractions(cls, text: str) -> tuple[str, dict[str, str]]:
        """Temporarily protect word-internal contractions (e.g. didn't, I'm, it's) from single quote splitting."""
        mapping: dict[str, str] = {}

        def repl(match: re.Match[str]) -> str:
            key = f"\uE000{len(mapping)}\uE001"
            mapping[key] = match.group(0)
            return key

        subbed = re.sub(r"(?<=[a-zA-Z])['\u2019](?=[a-zA-Z])", repl, text)
        return subbed, mapping

    @classmethod
    def restore_contractions(cls, text: str, mapping: dict[str, str]) -> str:
        """Restore protected contractions to their original representation."""
        res = text
        for k, v in mapping.items():
            res = res.replace(k, v)
        return res

    @classmethod
    def segment_text(cls, text: str, options: ParseOptionsSchema) -> list[ParsedSegment]:
        """
        Split a chapter's text into segments, identifying dialogue vs narration,
        detecting LitRPG/system prompts, linking split-dialogue continuations,
        and grouping conversational ping-pong dialogue chains.
        Returns a list of ParsedSegment (supports tuple unpacking (text, is_dialogue)).
        """
        text = cls.normalize_dialogue_quotes(text)
        paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
        segments: list[ParsedSegment] = []

        for raw_para in paragraphs:
            para = re.sub(r"[ \t]*\n[ \t]*", " ", raw_para).strip()
            if not para:
                continue

            if not options.separate_sentence_wise:
                protected, _ = cls.protect_contractions(para)
                protected, _ = cls.protect_inline_single_quotes(protected)
                is_sys = bool(SYSTEM_PROMPT_RE.search(para)) or cls.is_short_bracket_system_prompt(para)
                is_diag = bool(QUOTE_SPAN_RE.search(protected)) and not is_sys
                deliv = "system_prompt" if is_sys else ("dialogue" if is_diag else "narration")
                spk = "System / Interface" if is_sys else ("Narrator" if not is_diag else None)
                gnd = "neutral" if (is_sys or not is_diag) else None
                segments.append(
                    ParsedSegment(
                        text=para,
                        is_dialogue=is_diag,
                        delivery_type=deliv,
                        speaker=spk,
                        speaker_gender=gnd,
                    )
                )
                continue

            # Split paragraph into dialogue parts (quoted) and narration parts
            protected_contractions, mapping_contractions = cls.protect_contractions(para)
            protected, mapping_inline = cls.protect_inline_single_quotes(protected_contractions)
            parts = QUOTE_SPAN_RE.split(protected)
            para_segments: list[ParsedSegment] = []

            for part in parts:
                clean_part = cls.restore_inline_single_quotes(part.strip(), mapping_inline)
                clean_part = cls.restore_contractions(clean_part, mapping_contractions)
                if not clean_part:
                    continue

                prot_clean, _ = cls.protect_contractions(clean_part)
                prot_clean, _ = cls.protect_inline_single_quotes(prot_clean)
                is_quoted = bool(QUOTE_SPAN_RE.fullmatch(prot_clean))
                is_dialogue_silence = bool(re.fullmatch(r'["“][.…]*["”]|\[[.…]*\]', clean_part))

                # Discard orphan quote debris or stray punctuation without alphanumeric content
                if not re.search(r"\w", clean_part) and not is_dialogue_silence:
                    continue

                if is_quoted:
                    is_sys = bool(SYSTEM_PROMPT_RE.search(clean_part)) or cls.is_short_bracket_system_prompt(clean_part)
                    is_tn = bool(TRANSLATOR_NOTE_RE.search(clean_part))
                    if is_tn:
                        para_segments.append(
                            ParsedSegment(
                                text=clean_part,
                                is_dialogue=False,
                                delivery_type="narration",
                                speaker="Narrator",
                                speaker_gender="neutral",
                            )
                        )
                    elif is_sys:
                        para_segments.append(
                            ParsedSegment(
                                text=clean_part,
                                is_dialogue=False,
                                delivery_type="system_prompt",
                                speaker="System / Interface",
                                speaker_gender="neutral",
                            )
                        )
                    else:
                        para_segments.append(
                            ParsedSegment(
                                text=clean_part,
                                is_dialogue=True,
                                delivery_type="dialogue",
                            )
                        )
                else:
                    sentences = cls.split_sentence_fragments(clean_part)
                    for s in sentences:
                        s_clean = s.strip()
                        if not s_clean:
                            continue
                        if not re.search(r"\w", s_clean) and not is_dialogue_silence:
                            continue

                        is_sys = bool(SYSTEM_PROMPT_RE.search(s_clean)) or cls.is_short_bracket_system_prompt(s_clean)
                        is_tn = bool(TRANSLATOR_NOTE_RE.search(s_clean))
                        if is_tn:
                            para_segments.append(
                                ParsedSegment(
                                    text=s_clean,
                                    is_dialogue=False,
                                    delivery_type="narration",
                                    speaker="Narrator",
                                    speaker_gender="neutral",
                                )
                            )
                        elif is_sys:
                            para_segments.append(
                                ParsedSegment(
                                    text=s_clean,
                                    is_dialogue=False,
                                    delivery_type="system_prompt",
                                    speaker="System / Interface",
                                    speaker_gender="neutral",
                                )
                            )
                        else:
                            para_segments.append(
                                ParsedSegment(
                                    text=s_clean,
                                    is_dialogue=False,
                                    delivery_type="narration",
                                    speaker="Narrator",
                                    speaker_gender="neutral",
                                )
                            )

            # Detect split dialogue within this paragraph
            # e.g., Quote 1 (starts_phrase) -> Interstitial Narration (1 or more sentences) -> Quote 2 (completes_phrase)
            idx = 0
            while idx < len(para_segments) - 1:
                p0 = para_segments[idx]
                if not p0.is_dialogue:
                    idx += 1
                    continue

                # Look ahead for the resuming dialogue quote in the same paragraph (up to 4 intervening narration sentences)
                target_idx = None
                for j in range(idx + 1, min(len(para_segments), idx + 5)):
                    cand = para_segments[j]
                    if cand.is_dialogue:
                        target_idx = j
                        break
                    # Only neutral narration can serve as interstitial beat
                    if cand.delivery_type != "narration":
                        break

                if target_idx is not None and target_idx > idx + 1:
                    interstitial_beats = para_segments[idx + 1 : target_idx]
                    target_seg = para_segments[target_idx]

                    p0_tail = p0.text.rstrip("\"'”’』」 ").rstrip()
                    p0_ends_non_terminal = p0_tail.endswith((",", "—", "–", "...", ";", ":", "-"))
                    total_inter_words = sum(len(s.text.split()) for s in interstitial_beats)
                    # Short narrative action beats within same paragraph (max 50 words across beats)
                    beats_are_short = total_inter_words <= 50
                    last_beat_ends_stop = interstitial_beats[-1].text.rstrip().endswith(("!", "?"))

                    if (p0_ends_non_terminal or beats_are_short) and not last_beat_ends_stop:
                        turn_id = str(uuid.uuid4())
                        p0.continuation_type = "starts_phrase"
                        p0.parent_turn_id = turn_id

                        for b in interstitial_beats:
                            b.continuation_type = "interstitial_beat"
                            b.parent_turn_id = turn_id

                        target_seg.continuation_type = "completes_phrase"
                        target_seg.parent_turn_id = turn_id

                        idx = target_idx
                        continue

                idx += 1

            segments.extend(para_segments)

        # Detect dialogue chains (Ping-Pong Groups) across chapter segments:
        # Sequences of >= 3 dialogue lines
        chain_segments: list[ParsedSegment] = []
        dialogue_in_chain_count = 0

        for seg in segments:
            if seg.is_dialogue:
                chain_segments.append(seg)
                dialogue_in_chain_count += 1
            elif seg.continuation_type == "interstitial_beat":
                chain_segments.append(seg)
            elif seg.delivery_type == "narration" and len(seg.text.split()) <= 10:
                chain_segments.append(seg)
            else:
                if dialogue_in_chain_count >= 3:
                    chain_id = str(uuid.uuid4())
                    for s in chain_segments:
                        if s.is_dialogue:
                            s.dialogue_chain_id = chain_id
                chain_segments = []
                dialogue_in_chain_count = 0

        if dialogue_in_chain_count >= 3:
            chain_id = str(uuid.uuid4())
            for s in chain_segments:
                if s.is_dialogue:
                    s.dialogue_chain_id = chain_id

        return segments

    @staticmethod
    def compute_batch_number(chapter_number: int) -> int:
        """
        Compute the 10-chapter chunk batch index.
        Prologue/front matter (chapter 0) is included in Batch 1.
        Chapters 1-10 -> Batch 1.
        Chapters 11-20 -> Batch 2.
        Chapters 21-30 -> Batch 3, etc.
        """
        if chapter_number <= 0:
            return 1
        return ((chapter_number - 1) // 10) + 1

    @classmethod
    def parse_raw_text_into_chapters(
        cls,
        raw_text: str,
        options: ParseOptionsSchema,
    ) -> list[dict[str, Any]]:
        """Split clean text into chapters using chapter heading detection."""
        cleaned = cls.clean_text(raw_text, options)

        if not options.detect_chapter_headings:
            return [
                {
                    "number": 1,
                    "title": "Chapter 1",
                    "text": cleaned,
                }
            ]

        # Regex for common chapter headings across markdown, web novels, and standard manuscripts:
        # Handles:
        # - Markdown headers: # Chapter 1, ## Chapter 2, ### Chapter 3
        # - Wiki / decorative headers: === Chapter 10: Title ===, --- Chapter 1 ---, *** Chapter 1 ***, ~~~ Chapter 1 ~~~
        # - Bracketed / enclosed: [Chapter 10], 【Chapter 10】, (Chapter 10)
        # - Subtitled / numbered: Chapter 10: A Failure in Class S (three), Chapter 10 - Title, Chapter 10 (three)
        # - Abbreviations: Ch. 1, Ch. 10
        # - Standard forms: Chapter 1, Chapter One, Chapter X
        # - Prologues & Epilogues: Prologue, Epilogue, Prologue [one], Prologue [1]
        # - Standalone numbered chapters: 1. A Failure in Class S
        chapter_regex = re.compile(
            r"^[ \t]*"
            r"(?:[#=\-~*_]{1,6}\s*)?"  # Leading decorators like ===, ###, ---, ***, ~~~
            r"(?:"
                r"(?:\[|【|\()?\s*Chapter\s+(?:[0-9IVXLCDM]+|[A-Za-z]+)(?:\s*[:\-–—\.]\s*[^\n]+|\s*\(.*?\))?(?:\s*(?:\]|】|\)))?"
                r"|(?:\[|【|\()?\s*Ch\.\s*[0-9]+(?:\s*[:\-–—\.]\s*[^\n]+)?(?:\s*(?:\]|】|\)))?"
                r"|Episode\s+[0-9]+(?:\s*[:\-–—\.]\s*[^\n]+)?"
                r"|Prologue(?:\s*[:\-–—\.]\s*[^\n]+|\s*\[.*?\]|\s*\(.*?\))?"
                r"|Epilogue(?:\s*[:\-–—\.]\s*[^\n]+|\s*\[.*?\]|\s*\(.*?\))?"
                r"|Front\s+Matter"
                r"|(?<!\[)\b[0-9]{1,3}\.\s+[A-Z][^\n]+"
            r")"
            r"(?:\s*[#=\-~*_]{1,6})?"  # Trailing decorators like ===, ---, ***
            r"[ \t]*$",
            re.IGNORECASE | re.MULTILINE,
        )

        matches = list(chapter_regex.finditer(cleaned))
        if not matches:
            return [
                {
                    "number": 1,
                    "title": "Chapter 1",
                    "text": cleaned,
                }
            ]

        chapters: list[dict[str, Any]] = []

        # If there is content before the first matched heading, capture it as front matter
        if matches[0].start() > 0:
            pre_text = cleaned[: matches[0].start()].strip()
            if pre_text:
                chapters.append(
                    {
                        "number": 0,
                        "title": "Front matter",
                        "text": pre_text,
                    }
                )

        for i, match in enumerate(matches):
            raw_title = match.group(0).strip()
            # Clean decorators: leading/trailing hashes, equals, dashes, tildes, asterisks, underscores
            title = re.sub(r"^[#=\-~*_\s]+|[#=\-~*_\s]+$", "", raw_title).strip()
            start_pos = match.end()
            end_pos = matches[i + 1].start() if i + 1 < len(matches) else len(cleaned)
            chapter_text = cleaned[start_pos:end_pos].strip()

            chapters.append(
                {
                    "number": len(chapters)
                    + (1 if not any(c["number"] == 0 for c in chapters) else 0),
                    "title": title,
                    "text": chapter_text or title,
                }
            )

        return chapters

    @classmethod
    async def get_project_chapter_data(
        cls,
        project: ProjectModel,
        options: ParseOptionsSchema,
    ) -> list[dict[str, Any]]:
        """
        Locates the project's source file and parses it into structured chapters.
        Raises ValidationError if manuscript is missing, empty, or unreadable.
        """
        from app.services.attachment import AttachmentService

        if not project.manuscript_attachment:
            raise ValidationError("No manuscript file has been uploaded for this project.")

        content_bytes = await AttachmentService.get_attachment_bytes(project.manuscript_attachment)
        if not content_bytes or len(content_bytes) == 0:
            raise ValidationError("The attached manuscript file is empty.")

        filename = project.manuscript_attachment.filename or "manuscript.txt"
        raw_text = cls.read_manuscript_bytes(content_bytes, filename)
        if not raw_text.strip():
            raise ValidationError(f"Could not extract any readable text from '{filename}'.")

        chapters = cls.parse_raw_text_into_chapters(raw_text, options)
        if not chapters:
            raise ValidationError("No chapters could be parsed from the manuscript.")

        return chapters
