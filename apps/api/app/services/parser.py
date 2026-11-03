import html
import io
import re
import uuid
import xml.etree.ElementTree as ET
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import inflect
from app.models.project import ProjectModel
from app.schemas.chapter import ParseOptionsSchema
from novelova_core.exceptions import ValidationError
from novelova_core.linguistics import (
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
LIGATURE_MAP = {
    "\ufb00": "ff",
    "\ufb01": "fi",
    "\ufb02": "fl",
    "\ufb03": "ffi",
    "\ufb04": "ffl",
    "\ufb05": "ft",
    "\ufb06": "st",
}
LIGATURE_TRANS = str.maketrans(LIGATURE_MAP)

QUOTE_SPAN_RE = re.compile(
    r"("
    r"\[[^\]\n]+\]|"
    r"【[^】\n]+】|"
    r"(?:“['\"]?|\"[\'\"]?)[^\u201d\"\n]+?(?:[\'\"]?”|[\'\"]?\")|"
    r"(?<!\w)[‘'\u2018][^'’\u2018\u2019\n]+?[’'\u2019](?!\w)"
    r")"
)

SYSTEM_PROMPT_RE = re.compile(
    r"^(?:\[|【)\s*(?:"
    r"System|Status|Notice|Alert|Skill|Quest|Warning|Notification|"
    r"Attribute|Level\s*Up|Item|Inventory|Reward|Passive|Active|Title|Buff|Debuff|Mission|"
    r"Goal|Top\s*Survival\s*Goal|Side\s*Quest|Mana|HP|MP|EXP|Aptitude|Trait|Traits|Personality|"
    r"Rating|Class|Effects?|Category|Disposition|Job|Initial\s*(?:Job|MP)|Rank|Tier|"
    r"Characteristic|Description|Store\s*currency|Special\s*Effects?|Achievement"
    r")(?:\s*[:\s\n-]|[\]】])",
    re.IGNORECASE,
)

GAME_STAT_LINE_RE = re.compile(
    r"^(?:"
    r"[◆■★▲▼●○◈◇▶▷►◄\*\-•◦‣]\s*"
    r"|[┏┣┗┌├└│─┃━╔╠╚║═┠┨┬┴┼┐┘]\s*"
    r"|:\s*[A-Za-z0-9]"
    r"|[─\-_=~*#\s]*[「『][^」』\n]+[」』][─\-_=~*#\s]*$"
    r")"
)

TRANSLATOR_NOTE_RE = re.compile(
    r"^(?:\[|【|\{)\s*(?:TN|TL|PR|ED|Note|Author|Translator|Editor)\b",
    re.IGNORECASE,
)

INLINE_QUOTE_RE = re.compile(
    r'(?<!\w)([‘\'\u2018"“])([^"”\'’\u2018\u2019\n\r]+?)([’\'\u2019"”])(?!\w)'
)
INLINE_SINGLE_QUOTE_RE = INLINE_QUOTE_RE  # Backward compatibility
INLINE_BRACKET_RE = re.compile(r"(\[|【)([^\]【\n\r]+?)(\]|】)")

SPEECH_VERB_PREFIX_RE = re.compile(
    rf"(?:{SPEECH_VERBS})\s*[,:]\s*$",
    re.IGNORECASE,
)

SPEECH_VERB_SUFFIX_RE = re.compile(
    rf"^\s*[,]?\s*(?:(?:(?:he|she|they|i|we|[A-Z][a-zA-Z0-9_\'-]*)\s+)?(?:{SPEECH_VERBS})|(?:{SPEECH_VERBS})\s+(?:he|she|they|i|we|[A-Z][a-zA-Z0-9_\'-]*))\b",
    re.IGNORECASE,
)

INLINE_CONNECTIVE_RE = re.compile(
    r"\b(?:called|named|titled|known as|term|category|trait|word|concept|quote|status|header|spelled|from|became|model(?:ed)? after|fianc[eé]e? of|under the|were|was|such as|is|into)\s*(?:the|a|an)?\s*[:]?\s*$",
    re.IGNORECASE,
)

DANGLING_PREP_RE = re.compile(
    r"\b(?:of|using|with|in|on|at|to|for|by|from|as|into|like|through|after|over|between|out|against|during|without|before|under|around|among|and|or|but|nor|so|yet|that|which|who|whom|whose|where|when|why|how|because|although|since|unless|while|is|was|were|became|called|named|titled|known as)\s*$",
    re.IGNORECASE,
)
BRACKET_ONLY_RE = re.compile(r"^(\[|【|「|『)[^\]】」』\n\r]+(\]|】|」|』)$")
TERMINAL_PUNCT_RE = re.compile(r"[.!?…:;\"”'’\]】」』]$")


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
            start = match.start()
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

        # -1. Normalize manuscript ligatures (e.g. ﬀ -> ff, ﬃ -> ffi)
        result = result.translate(LIGATURE_TRANS)

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
        """Extract structured text from EPUB bytes using standard library zipfile with HTML block preservation and spine ordering."""
        try:
            with zipfile.ZipFile(io.BytesIO(data), "r") as epub_zip:
                # 1. Attempt to resolve reading order via EPUB spine (content.opf)
                ordered_files: list[str] = []
                try:
                    opf_files = [f for f in epub_zip.namelist() if f.endswith(".opf")]
                    if opf_files:
                        opf_path = opf_files[0]
                        opf_dir = str(Path(opf_path).parent)
                        if opf_dir == ".":
                            opf_dir = ""
                        opf_data = epub_zip.read(opf_path)
                        root = ET.fromstring(opf_data)
                        manifest: dict[str, str] = {}
                        for item in root.iter():
                            if item.tag.endswith("item") and "id" in item.attrib and "href" in item.attrib:
                                href = item.attrib["href"]
                                full_href = f"{opf_dir}/{href}".lstrip("/") if opf_dir else href
                                manifest[item.attrib["id"]] = full_href
                        for itemref in root.iter():
                            if itemref.tag.endswith("itemref") and "idref" in itemref.attrib:
                                idref = itemref.attrib["idref"]
                                if idref in manifest and manifest[idref] in epub_zip.namelist():
                                    ordered_files.append(manifest[idref])
                except Exception as opf_err:
                    logger.debug("Could not parse EPUB spine, falling back to sorted files: %s", opf_err)

                if not ordered_files:
                    ordered_files = sorted([
                        f for f in epub_zip.namelist() if f.endswith((".xhtml", ".html", ".htm"))
                    ])

                extracted_parts: list[str] = []
                for html_file in ordered_files:
                    raw_html = epub_zip.read(html_file).decode("utf-8", errors="ignore")
                    # 1. Strip non-content tags and their contents (head, style, script, svg, noscript)
                    cleaned = re.sub(
                        r"<(head|style|script|svg|noscript)[^>]*>.*?</\1>",
                        "",
                        raw_html,
                        flags=re.DOTALL | re.IGNORECASE,
                    )
                    # 2. Convert breaks and block tags to explicit newlines
                    cleaned = re.sub(r"<br\s*/?>", "\n", cleaned, flags=re.IGNORECASE)
                    cleaned = re.sub(
                        r"</?(?:p|div|h[1-6]|li|blockquote|section|article|header|footer|aside|tr|hr)[^>]*>",
                        "\n\n",
                        cleaned,
                        flags=re.IGNORECASE,
                    )
                    # 3. Strip all remaining inline HTML tags
                    cleaned = re.sub(r"<[^>]+>", "", cleaned)
                    # 4. Unescape HTML entities (&amp;, &quot;, &#39;, &lt;, &gt;, etc.)
                    cleaned = html.unescape(cleaned)
                    # 5. Clean whitespace on each line while preserving paragraph breaks
                    lines = [re.sub(r"[ \t\u00a0]+", " ", line).strip() for line in cleaned.splitlines()]
                    text = "\n".join(lines)
                    text = re.sub(r"\n{3,}", "\n\n", text).strip()
                    if text:
                        extracted_parts.append(text)
                return "\n\n\n".join(extracted_parts)
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
        Check if a bracketed segment [...] or 【...】 or 「...」 or 『...』 is a skill invocation
        or system label (e.g. [Flash], [Heavy Strike], [Status], [Inspect], 「Scorching Fire」)
        rather than spoken telepathy.
        """
        t = text.strip()
        is_enclosed = (
            (t.startswith("[") and t.endswith("]"))
            or (t.startswith("【") and t.endswith("】"))
            or (t.startswith("「") and t.endswith("」"))
            or (t.startswith("『") and t.endswith("』"))
        )
        if not is_enclosed:
            return False
        if TRANSLATOR_NOTE_RE.search(t):
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
    def is_inline_quote(cls, text: str, start: int, end: int, inner: str) -> bool:
        """
        Determine whether a single- or double-quoted span is an inline proper noun, title, or concept
        (e.g., 'Familiar Contract Ceremony', 'Arcanum', 'Tumultus', 'protagonist', "Noble Etiquette", "Imperial University")
        embedded within a narration clause, rather than standalone dialogue.
        """
        inner_stripped = inner.strip()
        if not inner_stripped:
            return False
        # If inner text ends with terminal sentence punctuation, it is likely a spoken utterance or thought
        if inner_stripped[-1] in ".!?":
            return False
        # Multiple sentences inside quotes is not an inline term
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
            or (suffix[0] in ".!?" and is_mid_sentence_prefix)
        )

        has_connective = bool(INLINE_CONNECTIVE_RE.search(prefix))

        words = inner_stripped.split()
        if len(words) > 20:
            return False

        if has_connective:
            return True

        return (is_mid_sentence_prefix and is_mid_sentence_suffix) or (
            is_mid_sentence_prefix and (not suffix or suffix.startswith("."))
        )

    # Retain alias for backward compatibility
    is_inline_single_quote = is_inline_quote

    @classmethod
    def protect_inline_quotes(cls, text: str) -> tuple[str, dict[str, str]]:
        """Temporarily protect inline single- and double-quoted terms from QUOTE_SPAN_RE splitting."""
        mapping: dict[str, str] = {}

        def repl(m: re.Match[str]) -> str:
            if cls.is_inline_quote(text, m.start(), m.end(), m.group(2)):
                key = f"\uE002{len(mapping)}\uE003"
                mapping[key] = m.group(0)
                return key
            return m.group(0)

        subbed = INLINE_QUOTE_RE.sub(repl, text)
        return subbed, mapping

    # Retain alias for backward compatibility
    protect_inline_single_quotes = protect_inline_quotes

    @classmethod
    def restore_inline_quotes(cls, text: str, mapping: dict[str, str]) -> str:
        """Restore protected inline quoted terms to their original text."""
        res = text
        for k, v in mapping.items():
            res = res.replace(k, v)
        return res

    # Retain alias for backward compatibility
    restore_inline_single_quotes = restore_inline_quotes

    @classmethod
    def is_inline_bracket(cls, text: str, start: int, end: int, inner: str) -> bool:
        """
        Check if a bracketed term [Skill], 【Skill】 is an inline syntactic constituent
        (e.g. 'using [Vision]', 'of [Psychokinesis] was slow') rather than a standalone
        system card, notification banner, or dialogue quote.
        """
        inner_stripped = inner.strip()
        if not inner_stripped:
            return False

        # If it explicitly matches system prompt header syntax (System:, Notice:, Quest:), do not treat as inline
        if SYSTEM_PROMPT_RE.search(f"[{inner_stripped}]"):
            return False

        # If it matches translator notes, do not treat as inline bracket
        if TRANSLATOR_NOTE_RE.search(f"[{inner_stripped}]"):
            return False

        # If inner text has multiple sentences or ends in terminal sentence punctuation, it's not an inline term
        if inner_stripped[-1] in ".!?" or re.search(r"[.!?]\s+[A-Z]", inner_stripped):
            return False

        prefix = text[:start].rstrip()
        suffix = text[end:].lstrip()

        # If prefix is empty or ends with sentence-terminal punctuation, it starts a new thought/card
        if not prefix or prefix[-1] in ".!?\n\r":
            return False

        is_mid_sentence_prefix = bool(prefix) and prefix[-1] not in ".!?\n\r\"“"
        is_mid_sentence_suffix = bool(suffix) and (
            suffix[0].islower()
            or suffix.startswith((",", ";", ":", "—", "–", "...", "-"))
            or (suffix[0] in ".!?" and is_mid_sentence_prefix)
        )

        words = inner_stripped.split()
        if len(words) > 10:
            return False

        return (is_mid_sentence_prefix and is_mid_sentence_suffix) or (
            is_mid_sentence_prefix and (not suffix or suffix.startswith("."))
        )

    @classmethod
    def protect_inline_brackets(cls, text: str) -> tuple[str, dict[str, str]]:
        """Temporarily protect inline bracketed skill/item nouns from QUOTE_SPAN_RE splitting."""
        mapping: dict[str, str] = {}

        def repl(m: re.Match[str]) -> str:
            if cls.is_inline_bracket(text, m.start(), m.end(), m.group(2)):
                key = f"\uE004{len(mapping)}\uE005"
                mapping[key] = m.group(0)
                return key
            return m.group(0)

        subbed = INLINE_BRACKET_RE.sub(repl, text)
        return subbed, mapping

    @classmethod
    def restore_inline_brackets(cls, text: str, mapping: dict[str, str]) -> str:
        """Restore protected inline bracketed terms to their original text."""
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
    def stitch_dangling_paragraphs(cls, paragraphs: list[str]) -> list[str]:
        """
        Stitch together paragraphs that were accidentally split mid-sentence by EPUB/HTML block tags
        or scraper formatting (e.g. 'The Memorize of' + '[Psychokinesis]' + 'was unbelievably slow.'
        or 'I saw the condition of Memorize using' + '[Vision]' followed by a status window).
        Preserves complete grammatical units and prevents sentence amputation.
        """
        if not paragraphs:
            return []
        stitched: list[str] = []
        i = 0
        n = len(paragraphs)
        while i < n:
            curr = paragraphs[i].strip()
            if not curr:
                i += 1
                continue

            # Check if curr ends without terminal punctuation
            if not TERMINAL_PUNCT_RE.search(curr):
                # Lookahead 1: curr + bracket term + lowercase continuation
                if i + 1 < n and BRACKET_ONLY_RE.match(paragraphs[i + 1].strip()):
                    next_p = paragraphs[i + 1].strip()
                    if i + 2 < n and paragraphs[i + 2].strip() and (
                        paragraphs[i + 2].strip()[0].islower()
                        or paragraphs[i + 2].strip().startswith((",", ";", "—", "–"))
                    ):
                        third_p = paragraphs[i + 2].strip()
                        curr = f"{curr} {next_p} {third_p}"
                        i += 3
                        while i < n and (
                            paragraphs[i].strip()
                            and (
                                paragraphs[i].strip()[0].islower()
                                or paragraphs[i].strip().startswith((",", ";", "—", "–"))
                            )
                        ):
                            curr = f"{curr} {paragraphs[i].strip()}"
                            i += 1
                        stitched.append(curr)
                        continue
                    elif DANGLING_PREP_RE.search(curr):
                        curr = f"{curr} {next_p}."
                        stitched.append(curr)
                        i += 2
                        continue
                # Lookahead 2: curr + lowercase continuation (hard-wrap or broken paragraph)
                elif (
                    i + 1 < n
                    and paragraphs[i + 1].strip()
                    and (
                        paragraphs[i + 1].strip()[0].islower()
                        or paragraphs[i + 1].strip().startswith((",", ";", "—", "–"))
                    )
                    and not BRACKET_ONLY_RE.match(paragraphs[i + 1].strip())
                    and not GAME_STAT_LINE_RE.search(curr)
                    and not SYSTEM_PROMPT_RE.search(curr)
                ):
                    curr = f"{curr} {paragraphs[i + 1].strip()}"
                    i += 2
                    while i < n and (
                        paragraphs[i].strip()
                        and (
                            paragraphs[i].strip()[0].islower()
                            or paragraphs[i].strip().startswith((",", ";", "—", "–"))
                        )
                    ):
                        curr = f"{curr} {paragraphs[i].strip()}"
                        i += 1
                    stitched.append(curr)
                    continue

            stitched.append(curr)
            i += 1
        return stitched

    @classmethod
    def consolidate_contiguous_system_prompts(
        cls, segments: list[ParsedSegment], max_words: int = 150
    ) -> list[ParsedSegment]:
        """
        Consolidate consecutive system/stat lines (e.g. status windows, skill trees,
        box-drawing menus) into coherent multi-line system prompt segments.
        Prevents status screens from fragmenting into dozens of tiny disjointed takes.
        Only consolidates clusters that contain game stat / box-drawing markers.
        """
        if not segments:
            return []

        def flush_cluster(cluster: list[ParsedSegment]) -> list[ParsedSegment]:
            if not cluster:
                return []
            if len(cluster) == 1:
                return cluster
            # Only consolidate multi-line clusters if at least one line has game stat / box-drawing symbols
            has_stat_marker = any(bool(GAME_STAT_LINE_RE.search(s.text)) for s in cluster)
            if not has_stat_marker:
                return cluster

            merged_text = "\n".join(s.text.strip() for s in cluster if s.text.strip())
            return [
                ParsedSegment(
                    text=merged_text,
                    is_dialogue=False,
                    delivery_type="system_prompt",
                    speaker="System / Interface",
                    speaker_gender="neutral",
                )
            ]

        consolidated: list[ParsedSegment] = []
        current_sys_cluster: list[ParsedSegment] = []
        cluster_words = 0

        for seg in segments:
            is_sys = (
                seg.delivery_type == "system_prompt"
                or (seg.speaker and seg.speaker.lower() in {"system / interface", "system"})
            ) and not seg.is_dialogue

            if is_sys:
                seg_words = len(seg.text.split())
                if current_sys_cluster and (cluster_words + seg_words > max_words):
                    consolidated.extend(flush_cluster(current_sys_cluster))
                    current_sys_cluster = [seg]
                    cluster_words = seg_words
                else:
                    current_sys_cluster.append(seg)
                    cluster_words += seg_words
            else:
                if current_sys_cluster:
                    consolidated.extend(flush_cluster(current_sys_cluster))
                    current_sys_cluster = []
                    cluster_words = 0
                consolidated.append(seg)

        if current_sys_cluster:
            consolidated.extend(flush_cluster(current_sys_cluster))

        return consolidated

    @classmethod
    def segment_text(cls, text: str, options: ParseOptionsSchema) -> list[ParsedSegment]:
        """
        Split a chapter's text into segments, identifying dialogue vs narration,
        detecting LitRPG/system prompts, linking split-dialogue continuations,
        and grouping conversational ping-pong dialogue chains.
        Returns a list of ParsedSegment (supports tuple unpacking (text, is_dialogue)).
        """
        text = cls.normalize_dialogue_quotes(text)
        raw_paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
        paragraphs = cls.stitch_dangling_paragraphs(raw_paragraphs)
        segments: list[ParsedSegment] = []

        for raw_para in paragraphs:
            para = re.sub(r"[ \t]*\n[ \t]*", " ", raw_para).strip()
            if not para:
                continue

            # Translator notes take precedence over short bracket system prompts (e.g. [TN: Chapter Note])
            if bool(TRANSLATOR_NOTE_RE.search(para)):
                segments.append(
                    ParsedSegment(
                        text=para,
                        is_dialogue=False,
                        delivery_type="narration",
                        speaker="Narrator",
                        speaker_gender="neutral",
                    )
                )
                continue

            # If the entire paragraph is a system prompt or game stat line, emit it as a single
            # system_prompt segment instead of splitting on inner brackets or colons:
            is_para_sys = (
                bool(SYSTEM_PROMPT_RE.search(para))
                or cls.is_short_bracket_system_prompt(para)
                or bool(GAME_STAT_LINE_RE.search(para))
            )
            if is_para_sys:
                segments.append(
                    ParsedSegment(
                        text=para,
                        is_dialogue=False,
                        delivery_type="system_prompt",
                        speaker="System / Interface",
                        speaker_gender="neutral",
                    )
                )
                continue

            if not options.separate_sentence_wise:
                protected, _ = cls.protect_contractions(para)
                protected, _ = cls.protect_inline_single_quotes(protected)
                protected, _ = cls.protect_inline_brackets(protected)
                is_diag = bool(QUOTE_SPAN_RE.search(protected))
                segments.append(
                    ParsedSegment(
                        text=para,
                        is_dialogue=is_diag,
                        delivery_type="dialogue" if is_diag else "narration",
                        speaker="Narrator" if not is_diag else None,
                        speaker_gender="neutral" if not is_diag else None,
                    )
                )
                continue

            # Split paragraph into dialogue parts (quoted) and narration parts
            protected_contractions, mapping_contractions = cls.protect_contractions(para)
            protected_quotes, mapping_inline = cls.protect_inline_single_quotes(protected_contractions)
            protected, mapping_brackets = cls.protect_inline_brackets(protected_quotes)
            parts = QUOTE_SPAN_RE.split(protected)
            para_segments: list[ParsedSegment] = []

            for part in parts:
                clean_part = cls.restore_inline_brackets(part.strip(), mapping_brackets)
                clean_part = cls.restore_inline_single_quotes(clean_part, mapping_inline)
                clean_part = cls.restore_contractions(clean_part, mapping_contractions)
                if not clean_part:
                    continue

                prot_clean, _ = cls.protect_contractions(clean_part)
                prot_clean, _ = cls.protect_inline_single_quotes(prot_clean)
                prot_clean, _ = cls.protect_inline_brackets(prot_clean)
                is_quoted = bool(QUOTE_SPAN_RE.fullmatch(prot_clean))
                is_dialogue_silence = bool(re.fullmatch(r'["“][.…]*["”]|\[[.…]*\]', clean_part))

                # Discard orphan quote debris or stray punctuation without alphanumeric content
                if not re.search(r"\w", clean_part) and not is_dialogue_silence:
                    continue

                if is_quoted:
                    is_sys = bool(SYSTEM_PROMPT_RE.search(clean_part)) or cls.is_short_bracket_system_prompt(clean_part) or bool(GAME_STAT_LINE_RE.search(clean_part))
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

                        is_sys = bool(SYSTEM_PROMPT_RE.search(s_clean)) or cls.is_short_bracket_system_prompt(s_clean) or bool(GAME_STAT_LINE_RE.search(s_clean))
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

        # Consolidate consecutive system/stat lines (e.g. status windows, skill trees)
        # into coherent multi-line system prompt segments:
        segments = cls.consolidate_contiguous_system_prompts(segments)

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
                r"(?:\[|【|\()?\s*Chapter\s+(?:[0-9IVXLCDM]+|[A-Za-z]+)(?:\s*[:\-–—\.]\s*[^\n]{1,150}|\s*\(.*?\))?(?:\s*(?:\]|】|\)))?"
                r"|(?:\[|【|\()?\s*Ch\.\s*[0-9]+(?:\s*[:\-–—\.]\s*[^\n]{1,150})?(?:\s*(?:\]|】|\)))?"
                r"|Episode\s+[0-9]+(?:\s*[:\-–—\.]\s*[^\n]{1,150})?"
                r"|Prologue(?:\s*[:\-–—\.]\s*[^\n]{1,150}|\s*\[.*?\]|\s*\(.*?\))?"
                r"|Epilogue(?:\s*[:\-–—\.]\s*[^\n]{1,150}|\s*\[.*?\]|\s*\(.*?\))?"
                r"|Front\s+Matter"
                r"|(?<!\[)\b[0-9]{1,3}\.\s+[A-Z][^\n]{1,150}"
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
            # Defense-in-depth: If title has multiple lines or exceeds 200 chars, truncate gracefully
            if "\n" in title:
                title = title.split("\n", 1)[0].strip()
            if len(title) > 200:
                title = title[:197].rstrip() + "..."
            if not title:
                title = f"Chapter {len(chapters) + 1}"

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
