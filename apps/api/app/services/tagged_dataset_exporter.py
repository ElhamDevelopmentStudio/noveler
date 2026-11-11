import asyncio
import io
import json
import re
import zipfile
from datetime import UTC, datetime
from typing import Any

from app.models.chapter import ChapterModel, ScriptSegmentModel
from app.models.character import CharacterModel
from app.models.project import ProjectModel
from app.schemas.tagged_dataset import TaggedProjectSummaryResponse
from app.services.attachment import AttachmentService
from novelova_core.exceptions import NotFoundError, ValidationError
from novelova_core.logging import setup_logger
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

logger = setup_logger("novelova.dataset_exporter")

TAGGED_STATUSES = ("tagged", "synthesizing", "complete", "completed", "in_production")


def slugify(text: str) -> str:
    """Generate clean slug safe for directory and file names."""
    clean = re.sub(r"[^\w\s\-]", "", text).strip()
    return re.sub(r"[\s\-]+", "_", clean) or "dataset"


class TaggedDatasetExporterService:
    @staticmethod
    async def get_summary(
        db: AsyncSession,
        user_id: str | None = None,
    ) -> list[TaggedProjectSummaryResponse]:
        """
        Query all projects that contain tagged chapters and return summary statistics.
        """
        # 1. Fetch projects
        proj_stmt = select(ProjectModel).options(selectinload(ProjectModel.thumbnail_attachment))
        if user_id:
            proj_stmt = proj_stmt.where(ProjectModel.user_id == user_id)
        proj_stmt = proj_stmt.order_by(ProjectModel.updated_at.desc())
        projects = list((await db.execute(proj_stmt)).scalars().all())

        if not projects:
            return []

        project_ids = [p.id for p in projects]

        # 2. Query total chapters count per project
        total_ch_stmt = (
            select(ChapterModel.project_id, func.count(ChapterModel.id))
            .where(ChapterModel.project_id.in_(project_ids))
            .group_by(ChapterModel.project_id)
        )
        total_ch_map = dict((await db.execute(total_ch_stmt)).all())

        # 3. Query tagged chapters count and word count per project
        tagged_ch_stmt = (
            select(
                ChapterModel.project_id,
                func.count(ChapterModel.id).label("tagged_count"),
                func.sum(ChapterModel.word_count).label("total_words"),
            )
            .where(
                ChapterModel.project_id.in_(project_ids),
                ChapterModel.status.in_(TAGGED_STATUSES),
            )
            .group_by(ChapterModel.project_id)
        )
        tagged_ch_rows = (await db.execute(tagged_ch_stmt)).all()
        tagged_ch_map = {r.project_id: r.tagged_count for r in tagged_ch_rows}
        tagged_words_map = {r.project_id: int(r.total_words or 0) for r in tagged_ch_rows}

        # 4. Query segment statistics for tagged chapters
        tagged_ch_ids_stmt = select(ChapterModel.id, ChapterModel.project_id).where(
            ChapterModel.project_id.in_(project_ids),
            ChapterModel.status.in_(TAGGED_STATUSES),
        )
        ch_id_rows = (await db.execute(tagged_ch_ids_stmt)).all()
        tagged_chapter_ids = [r[0] for r in ch_id_rows]

        seg_stats_map: dict[str, dict[str, int]] = {p_id: {"total": 0, "dialogue": 0} for p_id in project_ids}

        if tagged_chapter_ids:
            seg_stmt = (
                select(
                    ChapterModel.project_id,
                    func.count(ScriptSegmentModel.id).label("total_segs"),
                    func.count(ScriptSegmentModel.id)
                    .filter(ScriptSegmentModel.is_dialogue.is_(True))
                    .label("dialogue_segs"),
                )
                .join(ChapterModel, ChapterModel.id == ScriptSegmentModel.chapter_id)
                .where(ScriptSegmentModel.chapter_id.in_(tagged_chapter_ids))
                .group_by(ChapterModel.project_id)
            )
            for r in (await db.execute(seg_stmt)).all():
                seg_stats_map[r.project_id] = {
                    "total": int(r.total_segs or 0),
                    "dialogue": int(r.dialogue_segs or 0),
                }

        summaries: list[TaggedProjectSummaryResponse] = []
        for p in projects:
            tagged_count = tagged_ch_map.get(p.id, 0)
            if tagged_count == 0:
                continue

            cover_url = None
            if p.thumbnail_attachment:
                cover_url = AttachmentService.get_presigned_url(p.thumbnail_attachment)

            summaries.append(
                TaggedProjectSummaryResponse(
                    id=p.id,
                    title=p.title,
                    author=p.author,
                    cover_url=cover_url,
                    total_chapters=total_ch_map.get(p.id, 0),
                    tagged_chapters_count=tagged_count,
                    tagged_segments_count=seg_stats_map[p.id]["total"],
                    dialogue_segments_count=seg_stats_map[p.id]["dialogue"],
                    total_words=tagged_words_map.get(p.id, 0),
                    updated_at=p.updated_at,
                )
            )

        summaries.sort(key=lambda s: s.tagged_chapters_count, reverse=True)
        return summaries

    @staticmethod
    async def export_tagged_dataset(
        db: AsyncSession,
        project_ids: list[str] | None = None,
        export_format: str = "json",
        user_id: str | None = None,
    ) -> tuple[io.BytesIO, str]:
        """
        Build and package a complete training dataset archive of tagged chapters.
        Supports 'json' and 'txt' formats.
        """
        export_format = export_format.lower().strip()
        if export_format not in {"json", "txt"}:
            export_format = "json"

        # 1. Resolve candidate projects
        proj_query = select(ProjectModel).options(selectinload(ProjectModel.characters))
        if project_ids:
            proj_query = proj_query.where(ProjectModel.id.in_(project_ids))
        elif user_id:
            proj_query = proj_query.where(ProjectModel.user_id == user_id)

        projects = list((await db.execute(proj_query)).scalars().all())
        if not projects:
            raise NotFoundError("No matching projects found for dataset export")

        now_str = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
        archive_name = f"novelova_tagged_dataset_{export_format}_{now_str}.zip"
        buf = io.BytesIO()

        total_exported_chapters = 0
        total_exported_segments = 0
        total_exported_dialogues = 0
        projects_meta: list[dict[str, Any]] = []

        combined_jsonl_lines: list[str] = []
        combined_txt_lines: list[str] = [
            "=" * 80,
            "NOVELOVA MASTER TAGGED DATASET",
            f"Exported At: {datetime.now(UTC).isoformat()}",
            f"Total Projects Included: {len(projects)}",
            "=" * 80,
            "",
        ]

        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            for project in projects:
                p_slug = slugify(project.title)

                # Fetch all tagged chapters for this project
                ch_stmt = (
                    select(ChapterModel)
                    .where(
                        ChapterModel.project_id == project.id,
                        ChapterModel.status.in_(TAGGED_STATUSES),
                    )
                    .order_by(ChapterModel.order_index, ChapterModel.chapter_number)
                    .options(selectinload(ChapterModel.segments))
                )
                chapters = list((await db.execute(ch_stmt)).scalars().all())
                if not chapters:
                    continue

                # Project character roster
                char_roster = [
                    {
                        "name": c.name,
                        "gender": c.gender,
                        "role": c.role_description or ("Protagonist" if c.is_general else "Character"),
                        "aliases": c.aliases or [],
                        "dialogue_count": c.dialogue_count,
                        "assigned_voice": c.assigned_voice_name,
                    }
                    for c in sorted(project.characters, key=lambda x: x.dialogue_count, reverse=True)
                ]

                proj_settings = project.settings or {}
                narrative_pov = proj_settings.get("narrative_pov") or {
                    "mode": "first_person" if any("I " in s.text for ch in chapters[:2] for s in ch.segments[:5]) else "third_person",
                    "protagonist": next((c.name for c in project.characters if c.dialogue_count > 100), None),
                }

                proj_info = {
                    "id": project.id,
                    "title": project.title,
                    "author": project.author,
                    "genre": project.genre,
                    "narrative_pov": narrative_pov,
                    "total_tagged_chapters": len(chapters),
                    "total_characters": len(char_roster),
                }
                projects_meta.append(proj_info)

                # Write project character dossier into ZIP
                if export_format == "json":
                    zf.writestr(
                        f"{p_slug}/character_roster.json",
                        json.dumps(
                            {
                                "project_id": project.id,
                                "project_title": project.title,
                                "narrative_pov": narrative_pov,
                                "characters": char_roster,
                            },
                            indent=2,
                            ensure_ascii=False,
                        ),
                    )
                else:
                    char_txt = [
                        "=" * 80,
                        f"CHARACTER ROSTER & DOSSIER: {project.title}",
                        f"Narrative POV: {narrative_pov.get('mode', 'unknown')} | Protagonist: {narrative_pov.get('protagonist', 'N/A')}",
                        "=" * 80,
                        "",
                    ]
                    for c in char_roster:
                        aliases_str = f" [Aliases: {', '.join(c['aliases'])}]" if c["aliases"] else ""
                        char_txt.append(f"- {c['name']} ({c['gender']}) - {c['role']}{aliases_str}")
                    zf.writestr(f"{p_slug}/character_roster.txt", "\n".join(char_txt))

                # Process each chapter
                for ch in chapters:
                    sorted_segs = sorted(ch.segments, key=lambda s: s.order_index)
                    ch_slug = slugify(ch.title)
                    ch_filename = f"ch_{ch.chapter_number:03d}_{ch_slug}"
                    total_exported_chapters += 1

                    # Identify characters present in this chapter
                    names_in_ch = {
                        s.speaker
                        for s in sorted_segs
                        if s.speaker and s.speaker != "Narrator" and s.speaker != "System / Interface"
                    }

                    # JSON Format
                    if export_format == "json":
                        ch_data = {
                            "dataset_version": "1.0",
                            "project": {
                                "id": project.id,
                                "title": project.title,
                                "author": project.author,
                                "narrative_pov": narrative_pov,
                            },
                            "chapter": {
                                "id": ch.id,
                                "chapter_number": ch.chapter_number,
                                "title": ch.title,
                                "word_count": ch.word_count,
                                "total_segments": len(sorted_segs),
                                "dialogue_count": sum(1 for s in sorted_segs if s.is_dialogue),
                            },
                            "character_bible": char_roster,
                            "characters_present_in_chapter": sorted(list(names_in_ch)),
                            "segments": [
                                {
                                    "order_index": s.order_index,
                                    "text": s.text,
                                    "delivery_type": s.delivery_type,
                                    "continuation_type": s.continuation_type,
                                    "speaker": s.speaker,
                                    "speaker_gender": s.speaker_gender,
                                    "emotion": s.emotion or "neutral",
                                    "is_dialogue": s.is_dialogue,
                                    "is_internal_thought": s.is_internal_thought,
                                    "raw_speaker_tag": s.raw_speaker_tag,
                                    "dialogue_chain_id": s.dialogue_chain_id,
                                }
                                for s in sorted_segs
                            ],
                        }
                        total_exported_segments += len(sorted_segs)
                        total_exported_dialogues += ch_data["chapter"]["dialogue_count"]

                        zf.writestr(
                            f"{p_slug}/chapters/{ch_filename}.json",
                            json.dumps(ch_data, indent=2, ensure_ascii=False),
                        )

                        # Create sliding window training samples for fine-tuning JSONL (25 segments per window with 5 overlap)
                        window_size = 25
                        step = 20
                        for start_idx in range(0, len(sorted_segs), step):
                            window = sorted_segs[start_idx : start_idx + window_size]
                            if not window:
                                continue
                            window_dialogue = [s for s in window if s.is_dialogue]
                            if not window_dialogue:
                                continue

                            transcript_input = [
                                {
                                    "segment_id": s.id,
                                    "order_index": s.order_index,
                                    "type": "dialogue" if s.is_dialogue else s.delivery_type,
                                    "text": s.text,
                                }
                                for s in window
                            ]
                            dialogue_targets = [
                                {
                                    "segment_id": s.id,
                                    "order_index": s.order_index,
                                    "text": s.text,
                                }
                                for s in window_dialogue
                            ]
                            ground_truth_attributions = [
                                {
                                    "segment_id": s.id,
                                    "speaker": s.speaker or "General Male",
                                    "gender": s.speaker_gender or "male",
                                    "delivery_type": s.delivery_type,
                                    "emotion": s.emotion or "neutral",
                                    "is_internal_thought": s.is_internal_thought,
                                }
                                for s in window_dialogue
                            ]

                            prompt_user_content = {
                                "novel_context": {
                                    "title": project.title,
                                    "narrative_pov": narrative_pov,
                                },
                                "character_bible": char_roster[:30],
                                "scene_transcript": transcript_input,
                                "dialogue_targets": dialogue_targets,
                            }

                            sample_line = {
                                "id": f"{p_slug}_ch{ch.chapter_number:03d}_w{start_idx // step:03d}",
                                "messages": [
                                    {
                                        "role": "system",
                                        "content": (
                                            "You are an expert dialogue attribution engine. "
                                            "Given a narrative scene transcript and character dossier, "
                                            "attribute the exact speaker, gender, delivery type, and emotion for each target dialogue turn."
                                        ),
                                    },
                                    {
                                        "role": "user",
                                        "content": json.dumps(prompt_user_content, ensure_ascii=False),
                                    },
                                    {
                                        "role": "assistant",
                                        "content": json.dumps({"attributions": ground_truth_attributions}, ensure_ascii=False),
                                    },
                                ],
                            }
                            combined_jsonl_lines.append(json.dumps(sample_line, ensure_ascii=False))

                    # TXT Format
                    else:
                        ch_dialogues = sum(1 for s in sorted_segs if s.is_dialogue)
                        total_exported_segments += len(sorted_segs)
                        total_exported_dialogues += ch_dialogues

                        txt_lines = [
                            "=" * 80,
                            f"NOVEL: {project.title}",
                            f"CHAPTER: {ch.chapter_number} - {ch.title}",
                            f"WORDS: {ch.word_count:,} | SEGMENTS: {len(sorted_segs)} | DIALOGUES: {ch_dialogues}",
                            f"POV: {narrative_pov.get('mode', 'N/A')} (Protagonist: {narrative_pov.get('protagonist', 'N/A')})",
                            "=" * 80,
                            "",
                            "[CHARACTERS PRESENT IN CHAPTER]",
                        ]
                        if names_in_ch:
                            for name in sorted(names_in_ch):
                                char_match = next((c for c in char_roster if c["name"] == name), None)
                                gnd = char_match["gender"] if char_match else "unknown"
                                txt_lines.append(f"- {name} ({gnd})")
                        else:
                            txt_lines.append("- (No attributed character dialogue)")

                        txt_lines.extend(["", "=" * 80, "[ANNOTATED TRANSCRIPT]", "=" * 80, ""])

                        for s in sorted_segs:
                            if s.is_dialogue or s.delivery_type == "dialogue":
                                speaker_str = s.speaker or "General Character"
                                gender_str = f" ({s.speaker_gender})" if s.speaker_gender else ""
                                emo_str = f" | EMOTION: {s.emotion}" if s.emotion else ""
                                txt_lines.append(f"[{s.order_index:04d}] [DIALOGUE | SPEAKER: {speaker_str}{gender_str}{emo_str}]")
                                txt_lines.append(f"{s.text}\n")
                            elif s.delivery_type == "internal_thought" or s.is_internal_thought:
                                txt_lines.append(f"[{s.order_index:04d}] [THOUGHT | SPEAKER: {s.speaker or 'Narrator'}]")
                                txt_lines.append(f"{s.text}\n")
                            elif s.delivery_type == "system_prompt":
                                txt_lines.append(f"[{s.order_index:04d}] [SYSTEM PROMPT]")
                                txt_lines.append(f"{s.text}\n")
                            else:
                                txt_lines.append(f"[{s.order_index:04d}] [NARRATION]")
                                txt_lines.append(f"{s.text}\n")

                        zf.writestr(f"{p_slug}/chapters/{ch_filename}.txt", "\n".join(txt_lines))

                        # Append to combined text dataset
                        combined_txt_lines.extend([
                            "#" * 80,
                            f"# BOOK: {project.title}",
                            f"## CHAPTER {ch.chapter_number}: {ch.title}",
                            "#" * 80,
                            "",
                        ])
                        combined_txt_lines.extend(txt_lines[7:])
                        combined_txt_lines.append("\n\n")

            # Write manifest and combined dataset files into ZIP root
            if export_format == "json":
                manifest = {
                    "dataset_title": "Novelova Tagged Dialogue Dataset",
                    "exported_at": datetime.now(UTC).isoformat(),
                    "format": "json",
                    "total_projects": len(projects_meta),
                    "total_chapters": total_exported_chapters,
                    "total_segments": total_exported_segments,
                    "total_dialogue_lines": total_exported_dialogues,
                    "projects": projects_meta,
                    "fine_tuning_samples_count": len(combined_jsonl_lines),
                    "fine_tuning_format": "Chat/Instruction JSON Lines (OpenAI / HuggingFace compatible)",
                }
                zf.writestr("dataset_manifest.json", json.dumps(manifest, indent=2, ensure_ascii=False))

                if combined_jsonl_lines:
                    zf.writestr("fine_tuning_train.jsonl", "\n".join(combined_jsonl_lines) + "\n")
            else:
                manifest_txt = [
                    "=" * 80,
                    "NOVELOVA TAGGED DIALOGUE DATASET MANIFEST",
                    "=" * 80,
                    f"Exported At: {datetime.now(UTC).isoformat()}",
                    f"Format: Plain Text Annotated Script (.txt)",
                    f"Total Projects: {len(projects_meta)}",
                    f"Total Chapters: {total_exported_chapters}",
                    f"Total Segments: {total_exported_segments:,}",
                    f"Total Dialogue Turns: {total_exported_dialogues:,}",
                    "",
                    "PROJECTS INCLUDED:",
                ]
                for p in projects_meta:
                    manifest_txt.append(
                        f" - {p['title']} ({p['total_tagged_chapters']} tagged chs, {p['total_characters']} characters)"
                    )
                zf.writestr("dataset_manifest.txt", "\n".join(manifest_txt))

                zf.writestr("all_tagged_dataset.txt", "\n".join(combined_txt_lines))

        buf.seek(0)
        logger.info(
            "Exported tagged dataset (%s): %d projects, %d chapters, %d segments, %d dialogues (%d bytes)",
            export_format,
            len(projects_meta),
            total_exported_chapters,
            total_exported_segments,
            total_exported_dialogues,
            len(buf.getvalue()),
        )
        return buf, archive_name
