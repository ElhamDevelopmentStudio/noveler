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
from app.services.parser import QUOTE_SPAN_RE
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

1. Spoken Dialogue vs. Internal Thoughts vs. Narration:
   You determine whether each segment is spoken dialogue ("is_dialogue": true) or non-dialogue narration ("is_dialogue": false).

   A. SPOKEN DIALOGUE ("is_dialogue": true):
      - Words spoken aloud to other characters, direct verbal speech, shouting, or direct telepathic/divine communication (e.g. [I accept your tribute...]).
      - Enclosed in double quotes ("...", “...”), nested quotes (e.g. ‘'I'm sorry, Section Chief Jeon...'’), Asian quotes (「...」), bracketed speech ([...]), or spoken aloud with dialogue speech tags ('said Seo', 'he shouted').
      - Set "is_dialogue": true and attribute to the speaking character ("speaker": "Seo Eun-hyun", etc.).

   B. INTERNAL THOUGHTS ("is_dialogue": false, speaker: "Narrator", gender: "neutral"):
      - Silent mental monologue, unspoken thoughts, memories, reflections, and internal musings inside a character's head that other characters do NOT hear.
      - In fiction and web novels, internal thoughts are often enclosed in single quotes ('...' or ‘...’, e.g., 'Now that I've regressed... How should I live...?', 'The first day! It's the first day we landed in this bizarre world!', 'Has Jeon Myeong-hoon never felt anything like conscience or shame?').
      - In standard audiobook production, silent internal thoughts are voiced by the Narrator.
      - Set "is_dialogue": false, speaker: "Narrator", gender: "neutral" for silent internal thoughts.

   C. NARRATION ("is_dialogue": false, speaker: "Narrator", gender: "neutral"):
      - Descriptive prose, exposition, scene descriptions, and non-spoken narrative actions.

2. Speaker Attribution Priority (for spoken dialogue):
   For every spoken dialogue segment ("is_dialogue": true), you must do your absolute utmost using narrative context, dialogue beats, speech tags (e.g., 'said Seo', 'she replied', 'Elias murmured', 'the fox said'), character actions, conversational alternation, and narrative proximity to identify:
   - The EXACT character who spoke the line (e.g. "Seo Eun-hyun", "Jeon Myeong-hoon", "Director Kim", "Fox").
   - The character's gender ("male" or "female").

3. Anonymous Fallback (strictly for the absolute worst case):
   Only when the speaker is genuinely anonymous, an unnamed background crowd member, or deliberately hidden by the book author:
   - Gender: Infer from surrounding context if available. If completely unknown, strictly default to "male".
   - Speaker: Set speaker to "General Male" if male, or "General Female" if female.

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
      "is_dialogue": true | false,
      "speaker": "string",
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
    def apply_local_heuristic_attribution(
        cls,
        segments: list[ScriptSegmentModel],
        project_settings: dict[str, Any] | None,
    ) -> list[dict[str, Any]]:
        """
        Local deterministic heuristic attribution.
        """
        decisions: list[dict[str, Any]] = []

        for idx, seg in enumerate(segments):
            is_diag = seg.is_dialogue or bool(QUOTE_SPAN_RE.search(seg.text))
            if not is_diag:
                decisions.append({
                    "segment_id": seg.id,
                    "is_dialogue": False,
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

            speaker = None
            gender = None

            verb_after = re.search(
                r'(?:said|replied|asked|whispered|shouted|murmured|muttered|cried)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)',
                context,
            )
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

            final_gender = gender or "male"
            if not speaker:
                speaker = "General Female" if final_gender == "female" else "General Male"

            tag = cls.filter_paralinguistic_tag(paralinguistic_tag, project_settings)

            decisions.append({
                "segment_id": seg.id,
                "is_dialogue": True,
                "speaker": speaker,
                "gender": final_gender,
                "paralinguistic_tag": tag,
                "confidence": 0.85 if speaker not in {"General Male", "General Female"} else 0.5,
            })

        return decisions

    @classmethod
    async def tag_window_with_deepseek(
        cls,
        window_segments: list[ScriptSegmentModel],
        prior_decisions: list[dict[str, Any]],
        project_settings: dict[str, Any] | None,
        allow_offline_heuristic: bool = False,
    ) -> tuple[list[dict[str, Any]], dict[str, Any]]:
        """
        Call DeepSeek chat API with sliding window payload and return structured decisions and usage stats.
        Raises DeepSeekAPIError on connection, auth, or rate limit failures so they are surfaced clearly.
        """
        if not settings.DEEPSEEK_API_KEY:
            if allow_offline_heuristic or settings.ENVIRONMENT == "test":
                logger.warning("DEEPSEEK_API_KEY is not configured; using offline heuristic.")
                return cls.apply_local_heuristic_attribution(window_segments, project_settings), {}
            raise DeepSeekAPIError(
                "DEEPSEEK_API_KEY is missing. Please set your DeepSeek API key in environment or settings.",
                error_type="missing_api_key",
            )

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
                    parsed = json.loads(content)
                    decisions_raw = parsed.get("decisions", [])

                    clean_decisions: list[dict[str, Any]] = []
                    for d in decisions_raw:
                        seg_id = d.get("segment_id")
                        is_diag = bool(d.get("is_dialogue", False))
                        speaker = d.get("speaker", "General Male" if is_diag else "Narrator")
                        gender = d.get("gender", "male").lower()
                        if gender not in {"male", "female", "neutral"}:
                            gender = "neutral" if not is_diag else "male"

                        if not speaker or speaker.lower() in {"unknown", "unspecified", "anonymous"}:
                            speaker = "General Female" if gender == "female" else "General Male"

                        if speaker.lower() == "narrator" or not is_diag:
                            speaker = "Narrator"
                            is_diag = False
                            gender = "neutral"
                        else:
                            is_diag = True

                        tag = cls.filter_paralinguistic_tag(d.get("paralinguistic_tag"), project_settings)

                        clean_decisions.append({
                            "segment_id": seg_id,
                            "is_dialogue": is_diag,
                            "speaker": speaker,
                            "gender": gender,
                            "paralinguistic_tag": tag,
                            "confidence": float(d.get("confidence", 0.9)),
                        })
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
        window_size: int = 100,
        overlap: int = 15,
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
                            "is_dialogue": seg.is_dialogue,
                            "speaker": seg.speaker,
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
                                if dec["speaker"].lower() == "narrator":
                                    is_diag = False
                                else:
                                    is_diag = True

                                await db.execute(
                                    update(ScriptSegmentModel)
                                    .where(ScriptSegmentModel.id == seg.id)
                                    .values(
                                        is_dialogue=is_diag,
                                        speaker=dec["speaker"],
                                        speaker_gender=dec["gender"],
                                        emotion=dec["paralinguistic_tag"],
                                    )
                                )
                        await db.commit()

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
