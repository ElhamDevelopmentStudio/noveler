import io
import re
import xml.etree.ElementTree as ET
import zipfile
from typing import Any

import inflect
from app.models.project import ProjectModel
from app.schemas.chapter import ParseOptionsSchema
from novelova_core.exceptions import ValidationError
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
    r"‘\'[^\n]+?\'’|"
    r"‘[^\u2019\n]+?’|"
    r"(?<!\w)\'[^\'\n]+?\'(?!\w)"
    r")"
)


class ManuscriptParserService:
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

    @classmethod
    def clean_text(cls, text: str, options: ParseOptionsSchema) -> str:
        """Apply configurable cleaning options to the raw text."""
        result = text

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
    def segment_text(cls, text: str, options: ParseOptionsSchema) -> list[tuple[str, bool]]:
        """
        Split a chapter's text into segments, identifying dialogue vs narration.
        Returns a list of (segment_text, is_dialogue).
        """
        paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
        segments: list[tuple[str, bool]] = []

        for raw_para in paragraphs:
            para = re.sub(r"[ \t]*\n[ \t]*", " ", raw_para).strip()
            if not options.separate_sentence_wise:
                protected, _ = cls.protect_contractions(para)
                is_diag = bool(QUOTE_SPAN_RE.search(protected))
                segments.append((para, is_diag))
                continue

            # Split paragraph into dialogue parts (quoted) and narration parts
            protected, mapping = cls.protect_contractions(para)
            parts = QUOTE_SPAN_RE.split(protected)
            for part in parts:
                clean_part = cls.restore_contractions(part.strip(), mapping)
                if not clean_part:
                    continue

                prot_clean, _ = cls.protect_contractions(clean_part)
                is_quoted = bool(QUOTE_SPAN_RE.fullmatch(prot_clean))
                if is_quoted:
                    segments.append((clean_part, True))
                else:
                    sentences = cls.split_sentence_fragments(clean_part)
                    for s in sentences:
                        s_clean = s.strip()
                        if s_clean:
                            segments.append((s_clean, False))

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

        # Regex for common chapter headings: Chapter 1, Chapter 0, Prologue, Epilogue, 1. Title, etc.
        chapter_regex = re.compile(
            r"^(?:#{1,3}\s*)?(?:Chapter\s+(?:[0-9IVXLCDM]+|[A-Za-z]+)|[0-9]+\.\s+[^\n]+|Prologue|Epilogue|Front\s+Matter|\[Chapter\s+[0-9IVXLCDM]+\]).*$",
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
            title = match.group(0).strip()
            # Clean markdown hashes from heading title if present
            title = re.sub(r"^#{1,3}\s*", "", title)
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
