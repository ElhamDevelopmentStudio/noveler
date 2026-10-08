import json
import re
from typing import Any
import httpx

from app.core.config import settings
from app.models.chapter import ChapterModel, ScriptSegmentModel
from app.models.project import ProjectModel
from app.services.character import CharacterService
from novelova_core.exceptions import NotFoundError, ValidationError
from novelova_core.logging import setup_logger
from sqlalchemy import select
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

1. Speaker Attribution Priority:
   For every dialogue segment, you must do your absolute utmost using narrative context, dialogue beats, speech tags (e.g., 'said Seo', 'she replied', 'Elias murmured'), character actions, conversational alternation, and narrative proximity to identify:
   - The EXACT character who spoke the line (e.g. "Seo", "Mara", "Dr. Rowan Bell").
   - The character's gender ("male" or "female").

2. Anonymous Fallback (strictly for the absolute worst case):
   Only when the speaker is genuinely anonymous, an unnamed background crowd member, or deliberately hidden by the book author:
   - Gender: Infer from surrounding context if available. If completely unknown, strictly default to "male".
   - Speaker: Set speaker to "General Male" if male, or "General Female" if female.

3. Narration:
   For non-dialogue prose, set speaker to "Narrator", gender to "neutral".

4. Paralinguistic Sound Tags:
   ONLY when explicitly indicated by the immediate narrative or speech action (AND ONLY WHEN STRICTLY NECESSARY, NEVER CASUALLY), assign one of these exact tags to paralinguistic_tag:
   - [laugh]
   - [sigh]
   - [gasp]
   - [groan]
   - [chuckle]
   - [cough]
   - [sniff]
   - [shush]
   - [clear throat]
   If no sound cue is present, set paralinguistic_tag to null. Never use any tag outside this exact list.

JSON schema:
{
  "decisions": [
    {
      "segment_id": "string",
      "speaker": "string",
      "gender": "male" | "female" | "neutral",
      "paralinguistic_tag": "string" | null,
      "confidence": 0.0 - 1.0
    }
  ]
}
"""


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
        # Find exact canonical tag
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
    def apply_local_heuristic_attribution(
        cls,
        segments: list[ScriptSegmentModel],
        project_settings: dict[str, Any] | None,
    ) -> list[dict[str, Any]]:
        """
        Fallback heuristic when DeepSeek API is not reachable or offline.
        Uses speech verbs, pronouns, and alternation to determine speaker.
        """
        decisions: list[dict[str, Any]] = []
        last_speaker = "General Male"
        last_gender = "male"

        for idx, seg in enumerate(segments):
            if not seg.is_dialogue:
                decisions.append({
                    "segment_id": seg.id,
                    "speaker": "Narrator",
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

            # Look for attribution verbs: said Name, replied Name, Name asked
            speaker = None
            gender = None

            # Pattern: said/asked/whispered [Name]
            verb_after = re.search(
                r'(?:said|replied|asked|whispered|shouted|murmured|muttered|cried)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)',
                context,
            )
            # Pattern: [Name] said/asked/whispered
            verb_before = re.search(
                r'([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:said|replied|asked|whispered|shouted|murmured|muttered|cried)',
                context,
            )

            if verb_after:
                candidate = verb_after.group(1).strip()
                if candidate.lower() not in {"he", "she", "they", "it"}:
                    speaker = candidate
            elif verb_before:
                candidate = verb_before.group(1).strip()
                if candidate.lower() not in {"he", "she", "they", "it"}:
                    speaker = candidate

            # Inferred gender
            if re.search(r'\b(?:she|her|hers|woman|girl|lady|mother|sister)\b', context, re.IGNORECASE):
                gender = "female"
            elif re.search(r'\b(?:he|him|his|man|boy|gentleman|father|brother)\b', context, re.IGNORECASE):
                gender = "male"
            elif speaker and (
                speaker.lower() in {"mara", "elena", "clara", "sarah", "mary", "anna", "alice", "jane", "june", "emma"}
                or any(speaker.startswith(title) for title in ("Mrs.", "Ms.", "Miss"))
            ):
                gender = "female"

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

            # Fallback logic strictly matching requirements:
            # If gender not specified, default to "male"
            final_gender = gender or "male"
            if not speaker:
                speaker = "General Female" if final_gender == "female" else "General Male"

            tag = cls.filter_paralinguistic_tag(paralinguistic_tag, project_settings)

            decisions.append({
                "segment_id": seg.id,
                "speaker": speaker,
                "gender": final_gender,
                "paralinguistic_tag": tag,
                "confidence": 0.85 if speaker not in {"General Male", "General Female"} else 0.5,
            })
            last_speaker = speaker
            last_gender = final_gender

        return decisions

    @classmethod
    async def tag_window_with_deepseek(
        cls,
        window_segments: list[ScriptSegmentModel],
        prior_decisions: list[dict[str, Any]],
        project_settings: dict[str, Any] | None,
    ) -> list[dict[str, Any]]:
        """
        Call DeepSeek chat API with sliding window payload and return structured decisions.
        """
        if not settings.DEEPSEEK_API_KEY:
            logger.warning("DEEPSEEK_API_KEY is not configured; using heuristic attribution.")
            return cls.apply_local_heuristic_attribution(window_segments, project_settings)

        payload_segments = [
            {
                "segment_id": s.id,
                "is_dialogue": s.is_dialogue,
                "text": s.text,
            }
            for s in window_segments
        ]

        user_content = json.dumps({
            "recent_context": prior_decisions[-15:],
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
            "response_format": {"type": "json_object"},
        }

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(
                    f"{settings.DEEPSEEK_BASE_URL.rstrip('/')}/chat/completions",
                    json=request_body,
                    headers=headers,
                )
                resp.raise_for_status()
                data = resp.json()
                content = data["choices"][0]["message"]["content"]
                parsed = json.loads(content)
                decisions_raw = parsed.get("decisions", [])

                clean_decisions: list[dict[str, Any]] = []
                for d in decisions_raw:
                    seg_id = d.get("segment_id")
                    speaker = d.get("speaker", "General Male")
                    gender = d.get("gender", "male").lower()
                    if gender not in {"male", "female", "neutral"}:
                        gender = "male"

                    # Apply fallback if speaker empty or unknown
                    if not speaker or speaker.lower() in {"unknown", "unspecified", "anonymous"}:
                        speaker = "General Female" if gender == "female" else "General Male"

                    tag = cls.filter_paralinguistic_tag(d.get("paralinguistic_tag"), project_settings)

                    clean_decisions.append({
                        "segment_id": seg_id,
                        "speaker": speaker,
                        "gender": gender,
                        "paralinguistic_tag": tag,
                        "confidence": float(d.get("confidence", 0.9)),
                    })
                return clean_decisions

        except Exception as e:
            logger.error("Failed DeepSeek API call (%s); falling back to heuristic attribution", e)
            return cls.apply_local_heuristic_attribution(window_segments, project_settings)

    @classmethod
    async def tag_chapter_segments(
        cls,
        chapter_id: str,
        db: AsyncSession,
        window_size: int = 100,
        overlap: int = 15,
    ) -> int:
        """
        Execute Stage B tagging over a chapter using sliding context windows (100 size, 15 overlap).
        """
        chapter = await db.get(ChapterModel, chapter_id)
        if not chapter:
            raise NotFoundError(f"Chapter '{chapter_id}' not found")

        project = await db.get(ProjectModel, chapter.project_id)
        if not project:
            raise NotFoundError(f"Project '{chapter.project_id}' not found")

        stmt = (
            select(ScriptSegmentModel)
            .where(ScriptSegmentModel.chapter_id == chapter_id)
            .order_by(ScriptSegmentModel.order_index.asc())
        )
        segments = list((await db.execute(stmt)).scalars().all())
        if not segments:
            return 0

        step = max(1, window_size - overlap)
        total_tagged = 0
        all_decisions: list[dict[str, Any]] = []

        for start_idx in range(0, len(segments), step):
            window = segments[start_idx : start_idx + window_size]
            window_decisions = await cls.tag_window_with_deepseek(
                window_segments=window,
                prior_decisions=all_decisions,
                project_settings=project.settings,
            )

            decision_map = {d["segment_id"]: d for d in window_decisions if "segment_id" in d}

            # Update the segments in current window
            for seg in window:
                if seg.id in decision_map:
                    dec = decision_map[seg.id]
                    seg.speaker = dec["speaker"]
                    seg.speaker_gender = dec["gender"]
                    seg.emotion = dec["paralinguistic_tag"]
                    total_tagged += 1

            all_decisions.extend(window_decisions)

        await db.commit()

        # Synchronize and aggregate characters
        await CharacterService.sync_characters_from_segments(project.id, db)

        return total_tagged

    @classmethod
    async def tag_project(
        cls,
        project_id: str,
        db: AsyncSession,
    ) -> dict[str, Any]:
        """
        Run Stage B tagging across all chapters of a project.
        """
        project = await db.get(ProjectModel, project_id)
        if not project:
            raise NotFoundError(f"Project '{project_id}' not found")

        stmt = (
            select(ChapterModel)
            .where(ChapterModel.project_id == project_id)
            .order_by(ChapterModel.order_index.asc())
        )
        chapters = list((await db.execute(stmt)).scalars().all())

        total_segments_tagged = 0
        for chap in chapters:
            tagged = await cls.tag_chapter_segments(chap.id, db)
            total_segments_tagged += tagged

        # Fetch resulting cast summary
        characters = await CharacterService.get_project_characters(project_id, db)

        return {
            "project_id": project_id,
            "chapters_tagged": len(chapters),
            "total_segments_tagged": total_segments_tagged,
            "total_characters": len(characters),
        }
