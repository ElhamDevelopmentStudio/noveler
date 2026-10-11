import io
import json
import math
import re
import zipfile
from collections.abc import Sequence
from datetime import UTC, datetime

from app.models.chapter import ChapterModel, ScriptSegmentModel
from app.models.character import CharacterModel
from app.models.project import STATUS_LABELS, ProjectModel, ProjectStatus
from app.models.pronunciation import PronunciationRuleModel
from app.models.user import UserModel
from app.schemas.project import (
    ProjectCounts,
    ProjectCreate,
    ProjectListResponse,
    ProjectResponse,
    ProjectUpdate,
    RawContentResponse,
)
from app.services.attachment import AttachmentService
from app.services.parser import ManuscriptParserService
from novelova_core.exceptions import NotFoundError, ValidationError
from novelova_core.logging import setup_logger
from novelova_core.models import PaginationMeta
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

logger = setup_logger("novelova.project")


def utc_now() -> datetime:
    return datetime.now(UTC)


def infer_source_from_filename(filename: str | None) -> str | None:
    if not filename:
        return None
    lower = filename.lower()
    if lower.endswith(".docx"):
        return "DOCX"
    if lower.endswith(".pdf"):
        return "PDF"
    if lower.endswith(".epub"):
        return "EPUB"
    if lower.endswith(".rtf"):
        return "RTF"
    if lower.endswith(".txt"):
        return "TXT"
    if lower.endswith(".md"):
        return "MD"
    parts = filename.rsplit(".", 1)
    if len(parts) > 1:
        return parts[1].upper()
    return None


class ProjectService:
    @staticmethod
    def project_to_response(project: ProjectModel) -> ProjectResponse:
        thumbnail_url: str | None = None
        if project.thumbnail_attachment:
            thumbnail_url = AttachmentService.get_presigned_url(project.thumbnail_attachment)

        manuscript_url: str | None = None
        manuscript_filename: str | None = None
        manuscript_size: int | None = None

        if project.manuscript_attachment:
            manuscript_url = AttachmentService.get_presigned_url(project.manuscript_attachment)
            manuscript_filename = project.manuscript_attachment.filename
            manuscript_size = project.manuscript_attachment.size

        status_label = STATUS_LABELS.get(project.status, project.status.replace("_", " ").title())

        return ProjectResponse(
            id=project.id,
            title=project.title,
            author=project.author,
            owner=project.owner,
            source=project.source,
            status=project.status,
            status_label=status_label,
            language=project.language,
            genre=project.genre,
            publication_date=project.publication_date,
            created_date=project.created_date,
            isbn=project.isbn,
            thumbnail_attachment_id=project.thumbnail_attachment_id,
            thumbnail_url=thumbnail_url,
            manuscript_attachment_id=project.manuscript_attachment_id,
            manuscript_filename=manuscript_filename,
            manuscript_size=manuscript_size,
            manuscript_url=manuscript_url,
            settings=project.settings or {},
            created_at=project.created_at,
            updated_at=project.updated_at,
        )

    @staticmethod
    async def list_projects(
        db: AsyncSession,
        current_user: UserModel,
        search: str | None = None,
        status: str | None = None,
        sort_by: str = "updated_at",
        sort_order: str = "desc",
        page: int = 1,
        page_size: int = 50,
    ) -> ProjectListResponse:
        """List and filter projects, returning status counts and paginated items."""
        # Calculate counts across all accessible projects
        base_query = select(ProjectModel)

        all_projects_result = await db.execute(base_query)
        all_projects = all_projects_result.scalars().all()

        counts = ProjectCounts(
            all=len(all_projects),
            in_production=sum(
                1 for p in all_projects if p.status == ProjectStatus.IN_PRODUCTION.value
            ),
            needs_review=sum(1 for p in all_projects if p.status == ProjectStatus.REVIEW.value),
            complete=sum(1 for p in all_projects if p.status == ProjectStatus.COMPLETE.value),
            ready_to_parse=sum(
                1 for p in all_projects if p.status == ProjectStatus.READY_TO_PARSE.value
            ),
        )

        # Build filtered query
        query = select(ProjectModel).options(
            selectinload(ProjectModel.thumbnail_attachment),
            selectinload(ProjectModel.manuscript_attachment),
        )

        if search and search.strip():
            term = f"%{search.strip().lower()}%"
            query = query.where(
                or_(
                    func.lower(ProjectModel.title).like(term),
                    func.lower(ProjectModel.author).like(term),
                )
            )

        if status and status != "all":
            if status in ("review", "needs_review"):
                query = query.where(ProjectModel.status == ProjectStatus.REVIEW.value)
            elif status == "in_production":
                query = query.where(ProjectModel.status == ProjectStatus.IN_PRODUCTION.value)
            elif status == "complete":
                query = query.where(ProjectModel.status == ProjectStatus.COMPLETE.value)
            elif status == "ready_to_parse":
                query = query.where(ProjectModel.status == ProjectStatus.READY_TO_PARSE.value)
            else:
                query = query.where(ProjectModel.status == status)

        # Total filtered count
        count_query = select(func.count()).select_from(query.subquery())
        total_items = (await db.execute(count_query)).scalar() or 0

        # Sorting
        sort_column = getattr(ProjectModel, sort_by, ProjectModel.updated_at)
        if sort_order.lower() == "asc":
            query = query.order_by(sort_column.asc())
        else:
            query = query.order_by(sort_column.desc())

        # Pagination
        offset = (page - 1) * page_size
        query = query.offset(offset).limit(page_size)

        result = await db.execute(query)
        items: Sequence[ProjectModel] = result.scalars().all()

        total_pages = max(1, math.ceil(total_items / page_size)) if total_items > 0 else 1

        meta = PaginationMeta(
            page=page,
            page_size=page_size,
            total_items=total_items,
            total_pages=total_pages,
        )

        return ProjectListResponse(
            items=[ProjectService.project_to_response(p) for p in items],
            counts=counts,
            meta=meta,
        )

    @staticmethod
    async def get_project_by_id(
        project_id: str,
        db: AsyncSession,
    ) -> ProjectModel:
        query = (
            select(ProjectModel)
            .options(
                selectinload(ProjectModel.thumbnail_attachment),
                selectinload(ProjectModel.manuscript_attachment),
            )
            .where(ProjectModel.id == project_id)
        )
        result = await db.execute(query)
        project = result.scalar_one_or_none()
        if not project:
            raise NotFoundError(f"Project '{project_id}' not found")
        return project

    @staticmethod
    async def create_project(
        payload: ProjectCreate,
        current_user: UserModel,
        db: AsyncSession,
    ) -> ProjectModel:
        # Claim attachments if supplied
        if payload.thumbnail_attachment_id:
            await AttachmentService.claim_attachment(payload.thumbnail_attachment_id, db)

        source = payload.source
        if payload.manuscript_attachment_id:
            manuscript = await AttachmentService.claim_attachment(
                payload.manuscript_attachment_id, db
            )
            if not source:
                source = infer_source_from_filename(manuscript.filename)

        author = payload.author or current_user.name
        owner = payload.owner or current_user.handle

        project = ProjectModel(
            title=payload.title,
            author=author,
            owner=owner,
            source=source,
            status=payload.status or ProjectStatus.IN_PRODUCTION.value,
            language=payload.language,
            genre=payload.genre,
            publication_date=payload.publication_date,
            created_date=payload.created_date or utc_now().strftime("%Y-%m-%d"),
            isbn=payload.isbn,
            thumbnail_attachment_id=payload.thumbnail_attachment_id,
            manuscript_attachment_id=payload.manuscript_attachment_id,
            user_id=current_user.id,
        )

        db.add(project)
        await db.flush()
        logger.info("Created project: %s (id: %s)", project.title, project.id)
        return await ProjectService.get_project_by_id(project.id, db)

    @staticmethod
    async def update_project(
        project_id: str,
        payload: ProjectUpdate,
        db: AsyncSession,
    ) -> ProjectModel:
        project = await ProjectService.get_project_by_id(project_id, db)

        if payload.title is not None:
            project.title = payload.title
        if payload.author is not None:
            project.author = payload.author
        if payload.owner is not None:
            project.owner = payload.owner
        if payload.source is not None:
            project.source = payload.source
        if payload.status is not None:
            project.status = payload.status
        if payload.language is not None:
            project.language = payload.language
        if payload.genre is not None:
            project.genre = payload.genre
        if payload.publication_date is not None:
            project.publication_date = payload.publication_date
        if payload.created_date is not None:
            project.created_date = payload.created_date
        if payload.isbn is not None:
            project.isbn = payload.isbn

        if payload.thumbnail_attachment_id is not None:
            if payload.thumbnail_attachment_id == "":
                project.thumbnail_attachment_id = None
                project.thumbnail_attachment = None
            else:
                await AttachmentService.claim_attachment(payload.thumbnail_attachment_id, db)
                project.thumbnail_attachment_id = payload.thumbnail_attachment_id

        if payload.manuscript_attachment_id is not None:
            if payload.manuscript_attachment_id == "":
                project.manuscript_attachment_id = None
                project.manuscript_attachment = None
            else:
                manuscript = await AttachmentService.claim_attachment(
                    payload.manuscript_attachment_id, db
                )
                project.manuscript_attachment_id = payload.manuscript_attachment_id
                if not project.source:
                    project.source = infer_source_from_filename(manuscript.filename)

        project.updated_at = utc_now()
        await db.flush()
        logger.info("Updated project: %s (id: %s)", project.title, project.id)
        return await ProjectService.get_project_by_id(project.id, db)

    @staticmethod
    async def delete_project(
        project_id: str,
        db: AsyncSession,
    ) -> None:
        project = await ProjectService.get_project_by_id(project_id, db)
        await db.delete(project)
        await db.flush()
        logger.info("Deleted project: %s (id: %s)", project.title, project_id)

    @staticmethod
    async def get_raw_manuscript_chunk(
        project_id: str,
        offset: int = 0,
        limit: int = 150_000,
        db: AsyncSession | None = None,
    ) -> RawContentResponse:
        """
        Fetch a paginated slice of the raw unparsed manuscript text with cursor pagination.
        Slices cleanly at paragraph/newline boundaries to optimize rendering speed and network bandwidth.
        """
        if db is None:
            raise ValidationError("Database session required")

        stmt = (
            select(ProjectModel)
            .where(ProjectModel.id == project_id)
            .options(selectinload(ProjectModel.manuscript_attachment))
        )
        res = await db.execute(stmt)
        project = res.scalar_one_or_none()
        if not project:
            raise NotFoundError(f"Project with ID '{project_id}' not found")

        if not project.manuscript_attachment:
            raise ValidationError("No manuscript file has been uploaded for this project.")

        # Resolve local cache path for extracted raw text
        raw_cache_path = AttachmentService.get_local_file_path(f"{project.id}_raw_text.txt")

        raw_text = None
        if raw_cache_path.exists():
            try:
                raw_text = raw_cache_path.read_text(encoding="utf-8", errors="replace")
            except Exception:
                raw_text = None

        if raw_text is None:
            content_bytes = await AttachmentService.get_attachment_bytes(project.manuscript_attachment)
            if not content_bytes or len(content_bytes) == 0:
                raise ValidationError("The attached manuscript file is empty.")

            filename = project.manuscript_attachment.filename or "manuscript.txt"
            raw_text = ManuscriptParserService.read_manuscript_bytes(content_bytes, filename)
            if not raw_text.strip():
                raise ValidationError(f"Could not extract any readable text from '{filename}'.")

            try:
                raw_cache_path.parent.mkdir(parents=True, exist_ok=True)
                raw_cache_path.write_text(raw_text, encoding="utf-8", errors="replace")
            except Exception as exc:
                logger.warning("Could not persist raw text cache for project %s: %s", project.id, exc)

        total_chars = len(raw_text)
        safe_offset = max(0, min(offset, total_chars))
        effective_limit = max(10, min(limit, 500_000))

        if safe_offset >= total_chars:
            return RawContentResponse(
                project_id=project.id,
                offset=safe_offset,
                limit=effective_limit,
                chunk_size=0,
                total_characters=total_chars,
                has_more=False,
                next_offset=None,
                content="",
            )

        end_idx = min(total_chars, safe_offset + effective_limit)
        # Snap cleanly to paragraph break (\n\n) or newline (\n) in the last 2000 chars of the window if not at EOF
        if end_idx < total_chars:
            search_start = max(safe_offset, end_idx - 2000)
            search_zone = raw_text[search_start:end_idx]
            last_double_nl = search_zone.rfind("\n\n")
            if last_double_nl != -1:
                end_idx = search_start + last_double_nl + 2
            else:
                last_nl = search_zone.rfind("\n")
                if last_nl != -1:
                    end_idx = search_start + last_nl + 1

        chunk = raw_text[safe_offset:end_idx]
        has_more = end_idx < total_chars
        next_offset = end_idx if has_more else None

        return RawContentResponse(
            project_id=project.id,
            offset=safe_offset,
            limit=effective_limit,
            chunk_size=len(chunk),
            total_characters=total_chars,
            has_more=has_more,
            next_offset=next_offset,
            content=chunk,
        )

    @staticmethod
    async def export_project_archive(
        project_id: str,
        db: AsyncSession,
    ) -> tuple[io.BytesIO, str]:
        """
        Builds a complete, self-contained ZIP archive containing:
        - README.md (LLM system manifesto & project overview)
        - project-metadata.json
        - characters/characters.json & characters/dramatis-personae.md
        - pronunciation/rules.json & pronunciation/glossary.md
        - chapters/chapter-XX.md & chapters/chapter-XX.jsonl
        - full-script/complete-script.md & full-script/complete-script.jsonl
        - source/[original-filename]
        """
        project = await ProjectService.get_project_by_id(project_id, db)

        # 1. Fetch chapters with segments
        ch_stmt = (
            select(ChapterModel)
            .where(ChapterModel.project_id == project_id)
            .order_by(ChapterModel.order_index, ChapterModel.chapter_number)
            .options(selectinload(ChapterModel.segments))
        )
        chapters = list((await db.execute(ch_stmt)).scalars().all())

        # 2. Fetch characters
        char_stmt = (
            select(CharacterModel)
            .where(CharacterModel.project_id == project_id)
            .order_by(CharacterModel.dialogue_count.desc())
        )
        characters = list((await db.execute(char_stmt)).scalars().all())

        # 3. Fetch pronunciation rules
        rules_stmt = (
            select(PronunciationRuleModel)
            .where(PronunciationRuleModel.project_id == project_id)
            .order_by(PronunciationRuleModel.phrase)
        )
        pronunciation_rules = list((await db.execute(rules_stmt)).scalars().all())

        # 4. Total statistics
        total_words = sum(ch.word_count for ch in chapters)
        all_segments: list[tuple[int, ScriptSegmentModel]] = []
        for ch in chapters:
            for seg in ch.segments:
                all_segments.append((ch.chapter_number, seg))

        total_segments = len(all_segments)
        dialogue_segments = [s for _, s in all_segments if s.is_dialogue]
        total_dialogues = len(dialogue_segments)
        tagged_dialogues = sum(
            1 for s in dialogue_segments if s.speaker and s.speaker != "Narrator"
        )
        tag_ratio = (tagged_dialogues / total_dialogues * 100) if total_dialogues > 0 else 0.0

        # Slug for filenames
        slug = re.sub(r"[^a-z0-9]+", "-", (project.title or "project").lower()).strip("-")
        archive_name = f"novelova-{(slug or 'project')}-raw-export.zip"

        buf = io.BytesIO()
        with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
            # A. project-metadata.json
            metadata_dict = {
                "project_id": project.id,
                "title": project.title,
                "author": project.author or "Unknown",
                "source": project.source,
                "status": project.status,
                "language": project.language or "en",
                "genre": project.genre,
                "total_chapters": len(chapters),
                "total_words": total_words,
                "total_segments": total_segments,
                "total_dialogue_lines": total_dialogues,
                "tagged_dialogue_lines": tagged_dialogues,
                "tagged_percentage": round(tag_ratio, 1),
                "settings": project.settings or {},
                "exported_at": utc_now().isoformat(),
            }
            zf.writestr("project-metadata.json", json.dumps(metadata_dict, indent=2))

            # B. characters/characters.json & dramatis-personae.md
            chars_list = [
                {
                    "id": c.id,
                    "name": c.name,
                    "slug": c.slug,
                    "gender": c.gender,
                    "role_description": c.role_description,
                    "dialogue_count": c.dialogue_count,
                    "word_count": c.word_count,
                    "chapters_span": c.chapters_span,
                    "assigned_voice_name": c.assigned_voice_name,
                    "is_system": c.is_system,
                    "aliases": c.aliases or [],
                }
                for c in characters
            ]
            zf.writestr("characters/characters.json", json.dumps(chars_list, indent=2))

            dp_md_lines = [
                f"# Dramatis Personae: {project.title}",
                f"**Total Characters Discovered:** {len(characters)}",
                "",
                "| Character | Gender | Aliases | Lines | Words | Voice Casting |",
                "| :--- | :--- | :--- | :---: | :---: | :--- |",
            ]
            for c in characters:
                alias_str = ", ".join(c.aliases) if c.aliases else "—"
                voice_str = c.assigned_voice_name or "Unassigned"
                dp_md_lines.append(
                    f"| **{c.name}** | {c.gender} | {alias_str} | {c.dialogue_count} | {c.word_count} | {voice_str} |"
                )
            zf.writestr("characters/dramatis-personae.md", "\n".join(dp_md_lines) + "\n")

            # C. pronunciation/rules.json & glossary.md
            rules_list = [
                {
                    "id": r.id,
                    "phrase": r.phrase,
                    "replacement": r.replacement,
                    "match_case": r.match_case,
                    "scope": r.scope,
                    "occurrences_count": r.occurrences_count,
                    "is_active": r.is_active,
                }
                for r in pronunciation_rules
            ]
            zf.writestr("pronunciation/rules.json", json.dumps(rules_list, indent=2))

            glossary_lines = [
                f"# Pronunciation & Universe Glossary: {project.title}",
                f"**Active Rules:** {len([r for r in pronunciation_rules if r.is_active])} of {len(pronunciation_rules)}",
                "",
                "| Original Phrase / Term | Spoken Replacement / Phonetics | Match Case | Scope |",
                "| :--- | :--- | :---: | :--- |",
            ]
            for r in pronunciation_rules:
                mc = "Yes" if r.match_case else "No"
                glossary_lines.append(f"| **{r.phrase}** | `{r.replacement}` | {mc} | {r.scope} |")
            zf.writestr("pronunciation/glossary.md", "\n".join(glossary_lines) + "\n")

            # D. chapters/ and full-script/
            full_script_md_parts: list[str] = [
                f"# Complete Script: {project.title}",
                f"**Author:** {project.author or 'Unknown'}",
                "",
            ]
            full_script_jsonl_lines: list[str] = []

            for ch in chapters:
                ch_num = ch.chapter_number
                ch_md_lines = [f"# Chapter {ch_num}: {ch.title}", ""]
                ch_jsonl_lines = []

                full_script_md_parts.append(f"## Chapter {ch_num}: {ch.title}")
                full_script_md_parts.append("")

                for seg in ch.segments:
                    spk = seg.speaker or ("Narrator" if not seg.is_dialogue else "Unassigned")
                    emotion_tag = f" {seg.emotion}" if seg.emotion else ""

                    if seg.is_dialogue:
                        md_line = f"[{spk}]{emotion_tag}\n{seg.text}"
                    elif seg.delivery_type == "internal_thought" or seg.is_internal_thought:
                        md_line = f"[internal_thought]\n{seg.text}"
                    elif seg.delivery_type == "system_prompt":
                        md_line = f"[system_prompt]\n{seg.text}"
                    else:
                        md_line = f"[Narrator]\n{seg.text}"

                    ch_md_lines.append(md_line)
                    ch_md_lines.append("")

                    full_script_md_parts.append(md_line)
                    full_script_md_parts.append("")

                    seg_record = {
                        "chapter_id": ch.id,
                        "chapter_number": ch_num,
                        "order_index": seg.order_index,
                        "text": seg.text,
                        "delivery_type": seg.delivery_type,
                        "continuation_type": seg.continuation_type,
                        "is_dialogue": seg.is_dialogue,
                        "is_internal_thought": seg.is_internal_thought,
                        "speaker": seg.speaker,
                        "speaker_gender": seg.speaker_gender,
                        "emotion": seg.emotion,
                        "character_id": seg.character_id,
                    }
                    rec_str = json.dumps(seg_record, ensure_ascii=False)
                    ch_jsonl_lines.append(rec_str)
                    full_script_jsonl_lines.append(rec_str)

                zf.writestr(f"chapters/chapter-{ch_num:02d}.md", "\n".join(ch_md_lines))
                zf.writestr(f"chapters/chapter-{ch_num:02d}.jsonl", "\n".join(ch_jsonl_lines) + "\n")

            zf.writestr("full-script/complete-script.md", "\n".join(full_script_md_parts))
            zf.writestr("full-script/complete-script.jsonl", "\n".join(full_script_jsonl_lines) + "\n")

            # E. README.md
            readme_text = f"""# Novelova Project Context: {project.title}
**Author:** {project.author or "Unknown"}
**Language:** {project.language or "en"}
**Total Chapters:** {len(chapters)}
**Total Words:** {total_words}
**Total Dialogue Lines:** {total_dialogues}
**Tagged Dialogue Ratio:** {tagged_dialogues} / {total_dialogues} ({tag_ratio:.1f}%)
**Export Timestamp:** {utc_now().isoformat()}

---

## 1. Project Overview & LLM System Prompt
This archive contains the complete parsed, formatted, and attributed script for the novel **"{project.title}"**.
When ingesting this project for continuing the story, writing dialogue, performing character consistency checks, generating audio scripts, or translation:
- Refer to `characters/dramatis-personae.md` for canonical character names, aliases, assigned genders, and vocal archetypes.
- Refer to `pronunciation/glossary.md` for universe-specific terms, acronym expansions, and phonetic replacements.
- Refer to `chapters/` for chapter-by-chapter scripts in both Markdown (`.md`) and structured JSON Lines (`.jsonl`).
- Refer to `full-script/complete-script.md` for a single-file continuous reading stream.

---

## 2. Formatting & Delivery Conventions
In the Markdown script files (`.md`):
- `[Speaker Name]`: Spoken dialogue delivered by an attributed character.
- `[Speaker Name] [emotion]`: Spoken dialogue with paralinguistic or emotional delivery cues (e.g., `[whisper]`, `[sigh]`, `[laugh]`, `[groan]`).
- `[Narrator]`: Third-person or descriptive narrative prose beats.
- `[internal_thought]`: Silent internal monologue (recalled memories or introspection).
- `[system_prompt]`: In-universe blue-screen system interface messages, skill activations, or quest notifications.

---

## 3. Dramatis Personae Summary
| Character | Gender | Aliases | Lines | Words | Voice Casting |
| :--- | :--- | :--- | :---: | :---: | :--- |
"""
            for c in characters[:25]:
                alias_str = ", ".join(c.aliases) if c.aliases else "—"
                voice_str = c.assigned_voice_name or "Unassigned"
                readme_text += f"| **{c.name}** | {c.gender} | {alias_str} | {c.dialogue_count} | {c.word_count} | {voice_str} |\n"

            if len(characters) > 25:
                readme_text += f"\n*(Showing top 25 of {len(characters)} characters. See `characters/dramatis-personae.md` for complete list)*\n"

            readme_text += """
---

## 4. Archive Layout
- `README.md`: This context manifesto.
- `project-metadata.json`: Machine-readable project configuration.
- `characters/`: Character bible (`characters.json`) and reference table (`dramatis-personae.md`).
- `pronunciation/`: Phonetic substitutions (`rules.json`) and glossary table (`glossary.md`).
- `chapters/`: Individual chapter scripts in Markdown and JSONL.
- `full-script/`: Concatenated whole-novel script (`complete-script.md`, `complete-script.jsonl`).
- `source/`: Original source manuscript file as uploaded (if attached).
"""
            zf.writestr("README.md", readme_text)

            # F. source/
            if project.manuscript_attachment:
                try:
                    src_bytes = await AttachmentService.get_attachment_bytes(project.manuscript_attachment)
                    zf.writestr(f"source/{project.manuscript_attachment.filename}", src_bytes)
                except Exception as exc:
                    logger.warning("Could not include original manuscript in export: %s", exc)

        buf.seek(0)
        return buf, archive_name

