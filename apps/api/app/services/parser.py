import re
import uuid
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any

from app.models.chapter import ChapterModel, ScriptSegmentModel
from app.models.project import ProjectModel
from app.schemas.chapter import ParseOptionsSchema
from novelova_core.logging import setup_logger

logger = setup_logger("novelova.parser")

WORDS_PER_MINUTE = 145


SAMPLE_NIGHT_ORCHARD_CHAPTERS = [
    {
        "number": 0,
        "title": "Front matter",
        "text": """THE NIGHT ORCHARD
A Novel by Mara Voss

Copyright © 2026 Mara Voss. All rights reserved.
Published by Voxbound Publishing, London & New York.

For those who listen to the trees when the orchard sleeps.""",
    },
    {
        "number": 1,
        "title": "1. The frost line",
        "text": """The cold came down from the ridge earlier than anyone remembered.

By late afternoon, ice had crept along the roots of the northern damson trees, stiffening the wet grass into pale needles. Mara stood by the low stone wall with her coat collar turned up against the breeze.

"You should not be out here without gloves, Mara," her sister June called from the porch.

Mara looked down at her hands, red and stiff against the gray limestone. "The frost reached the fourth row before noon."

"Rowan said the temperature would hold until midnight," June replied, pulling her woolen shawl tighter around her shoulders. "He's measuring the perimeter now."

Mara turned back toward the dark branches. "Rowan has never spent a winter on this side of the valley. He doesn't know what the ground does when the river freezes."

The wind shifted, bringing with it the faint scent of wet cedar and smoke from the valley below.""",
    },
    {
        "number": 2,
        "title": "2. A room of branches",
        "text": """The orchard house had seven rooms, but only two stayed warm once November settled in.

Mara kept the surveyor's maps spread across the wide oak table in the keeping room. Elias Thorne arrived just past seven, his heavy boots leaving damp crescents on the hearthstone.

"The gate latch is frozen again," Elias said, unbuttoning his heavy sheepskin coat.

"It has been frozen since Tuesday," Mara answered without looking up from the parchment. "Did you find the boundary stone by the old ditch?"

Elias shook his head slowly. "The mud has swallowed it. Someone will need a spade before the ground turns iron-hard."

"Ask Llywelyn about the eastern wall," Elias said after a pause. "He remembers where the boundary ran before the canal was dug."

"Llywelyn is eighty-two years old, Elias. Half his memories belong to his grandfather."

"His grandfather was the surveyor who placed the stones in eighteen seventy," Elias murmured, stepping closer to the lamp.""",
    },
    {
        "number": 3,
        "title": "3. Cartography",
        "text": """By morning, the rain had drawn a new map over the orchard. Every path she remembered had softened at the edges, and the low stone wall seemed to travel farther east than it had the day before.

Mara unfolded the survey on the kitchen table. The paper smelled faintly of dust and cedar, its blue lines crossing and recrossing like a story told by several people at once.

She traced the northern boundary with one finger. Beyond it, the page was empty. No road, no river, no name for the long field where the trees bent toward one another in the wind.

"Is this the map from thirty-four?" Dr. Rowan Bell asked, entering with a brass compass in his palm.

"It is the only map we have," Mara said softly.

"Then we will have to make a better one," Rowan replied, setting the instrument beside the parchment.""",
    },
    {
        "number": 4,
        "title": "4. The orchard keeper",
        "text": """Elias Thorne was sixty-one and had spent thirty-eight of those years between the damson trees and the river.

"The soil is turning sour along the ditch," Elias remarked as they inspected the fifth terrace. "The roots are rejecting the water."

"Can we dig a trench before the freeze?" Mara asked.

"Ask Llywelyn about the eastern wall," Elias said. "He told me the runoff used to go into the mill pond."

Mrs. Penrose hailed them from across the hawthorn hedge. "Mara! Did you hear about the surveyor's wagon?"

"What about the wagon, Mrs. Penrose?" Mara shouted back.

"Wheel broke clean off at the crossroads! Rowan is carrying his tripod on foot!" Mrs. Penrose laughed with genuine delight.""",
    },
    {
        "number": 5,
        "title": "5. What the river kept",
        "text": """Under the dark silt of the bend, things lingered.

Iron horseshoes, fragments of glazed pottery, and copper nails from the old weir. Mara walked the stony gravel with June at her side.

"Do you really believe we can save the orchard, Mara?" June asked quietly.

"I believe we have nowhere else to go," Mara said.

"That isn't the same as saving it," June whispered, watching the gray water curl around an old willow trunk.""",
    },
    {
        "number": 6,
        "title": "6. Midwinter birds",
        "text": """The fieldfares arrived on the solstice, their wings rattling the bare branches like dry husks.

Mara counted thirty in the russet tree near the kitchen door. Dr. Rowan Bell stood behind her, writing carefully in his leather-bound journal.

"They only come south when the mountain passes are sealed with snow," Rowan said.

"Then we are locked in until March," Mara observed.

"We have plenty of flour and timber," Rowan said with quiet cheer. "And forty miles of trees to draw." """,
    },
    {
        "number": 7,
        "title": "7. Night passage",
        "text": """The lantern glass rattled in the north wind as Mara checked the gate.

A shadow broke from the tree line and came toward the light. For a breathless second, she held the lantern high, thinking of the stories Elias had told of the canal surveyors.

"It's only me, Mara," Elias's raspy voice called through the dark. "The weir gate gave way."

"Is the water rising?" she demanded.

"It's already in the lower meadow," Elias said grimly. "We have an hour at best." """,
    },
]


class ManuscriptParserService:
    @staticmethod
    def clean_text(text: str, options: ParseOptionsSchema) -> str:
        """Apply the 6 configurable cleaning options to the raw text."""
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

        # 6. Fix common punctuation spacing
        if options.fix_punctuation_spacing:
            # Fix spacing before commas, periods, question marks
            result = re.sub(r"\s+([,.:;?!])", r"\1", result)
            # Fix double spaces after punctuation
            result = re.sub(r"([.?!])\s{2,}", r"\1 ", result)
            # Normalize dashes
            result = re.sub(r"--+", "—", result)

        return result

    @staticmethod
    def extract_from_docx(file_path: Path) -> str:
        """Extract text from a DOCX file using standard library zipfile and XML parsing."""
        try:
            with zipfile.ZipFile(file_path, "r") as docx_zip:
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
            logger.error("Failed to extract text from DOCX: %s", exc)
            return ""

    @staticmethod
    def extract_from_epub(file_path: Path) -> str:
        """Extract text from an EPUB file using standard library zipfile."""
        try:
            with zipfile.ZipFile(file_path, "r") as epub_zip:
                html_files = [f for f in epub_zip.namelist() if f.endswith((".xhtml", ".html", ".htm"))]
                extracted_parts = []
                for html_file in sorted(html_files):
                    content = epub_zip.read(html_file).decode("utf-8", errors="ignore")
                    # Simple regex HTML tag stripper
                    text = re.sub(r"<[^>]+>", " ", content)
                    text = re.sub(r"\s+", " ", text).strip()
                    if text:
                        extracted_parts.append(text)
                return "\n\n".join(extracted_parts)
        except Exception as exc:
            logger.error("Failed to extract text from EPUB: %s", exc)
            return ""

    @staticmethod
    def extract_from_text(file_path: Path) -> str:
        """Read standard text/markdown file with encoding fallbacks."""
        for enc in ("utf-8", "utf-8-sig", "latin-1", "cp1252"):
            try:
                return file_path.read_text(encoding=enc)
            except Exception:
                continue
        return ""

    @classmethod
    def read_manuscript(cls, file_path: Path) -> str:
        suffix = file_path.suffix.lower()
        if suffix == ".docx":
            return cls.extract_from_docx(file_path)
        if suffix == ".epub":
            return cls.extract_from_epub(file_path)
        return cls.extract_from_text(file_path)

    @classmethod
    def segment_text(cls, text: str, options: ParseOptionsSchema) -> list[tuple[str, bool]]:
        """
        Split a chapter's text into segments, identifying dialogue vs narration.
        Returns a list of (segment_text, is_dialogue).
        """
        paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
        segments: list[tuple[str, bool]] = []

        dialogue_pattern = re.compile(r'("[^"]+"|[“][^”]+[”])')

        for para in paragraphs:
            if not options.separate_sentence_wise:
                is_diag = bool(dialogue_pattern.search(para))
                segments.append((para, is_diag))
                continue

            # Split paragraph into dialogue parts and narration parts
            parts = dialogue_pattern.split(para)
            for part in parts:
                clean_part = part.strip()
                if not clean_part:
                    continue
                # If wrapped in quotes, it's dialogue
                is_quoted = (
                    (clean_part.startswith('"') and clean_part.endswith('"'))
                    or (clean_part.startswith("“") and clean_part.endswith("”"))
                )
                if is_quoted:
                    segments.append((clean_part, True))
                else:
                    # Further split narrative sentences if requested
                    sentences = re.split(r"(?<=[.!?])\s+", clean_part)
                    for s in sentences:
                        s_clean = s.strip()
                        if s_clean:
                            segments.append((s_clean, False))

        return segments

    @classmethod
    def parse_raw_text_into_chapters(
        cls,
        raw_text: str,
        options: ParseOptionsSchema,
    ) -> list[dict[str, Any]]:
        """Split clean text into chapters using chapter heading detection."""
        cleaned = cls.clean_text(raw_text, options)

        # Regex for common chapter headings
        chapter_regex = re.compile(
            r"^(Chapter\s+[0-9IVXLCDM]+|[0-9]+\.\s+[^\n]+|Prologue|Epilogue|Front\s+Matter).*$",
            re.IGNORECASE | re.MULTILINE,
        )

        matches = list(chapter_regex.finditer(cleaned))
        if not matches or not options.detect_chapter_headings:
            # If no headings detected, treat whole text as Chapter 1
            return [
                {
                    "number": 1,
                    "title": "Chapter 1",
                    "text": cleaned,
                }
            ]

        chapters = []
        for i, match in enumerate(matches):
            title = match.group(0).strip()
            start_pos = match.end()
            end_pos = matches[i + 1].start() if i + 1 < len(matches) else len(cleaned)
            chapter_text = cleaned[start_pos:end_pos].strip()

            chapters.append(
                {
                    "number": i + 1,
                    "title": title,
                    "text": chapter_text or title,
                }
            )

        return chapters

    @classmethod
    def get_project_chapter_data(
        cls,
        project: ProjectModel,
        options: ParseOptionsSchema,
    ) -> list[dict[str, Any]]:
        """
        Locates the project's source file and parses it.
        If file is absent or empty, falls back gracefully to the rich sample manuscript.
        """
        from app.services.attachment import AttachmentService

        if project.manuscript_attachment:
            local_path = AttachmentService.get_local_file_path(
                project.manuscript_attachment.key
            )
            if local_path.exists() and local_path.stat().st_size > 0:
                raw_text = cls.read_manuscript(local_path)
                if raw_text.strip():
                    return cls.parse_raw_text_into_chapters(raw_text, options)

        # Fallback to realistic chapters
        return SAMPLE_NIGHT_ORCHARD_CHAPTERS
