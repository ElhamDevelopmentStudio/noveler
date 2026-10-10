import asyncio
import json
import os
import re
import time
from typing import Any
import httpx
from sqlalchemy import select

from app.db.session import get_session_factory, init_db
from app.models.chapter import ScriptSegmentModel
from app.models.project import ProjectModel
from app.services.tagger import StageBTaggingService
from novelova_core.linguistics import is_invalid_character_name, infer_name_gender

from app.core.config import settings

# Reference to DeepSeek config from environment
DEEPSEEK_API_KEY = settings.DEEPSEEK_API_KEY or os.getenv("DEEPSEEK_API_KEY", "")
DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
DEEPSEEK_MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-chat")

# Legacy Pre-Optimization System Prompt
OLD_SYSTEM_PROMPT = """You are an expert audiobook dialogue attribution and performance tagger for narrative fiction.
Return strictly valid JSON only. Do not output Markdown codeblocks or conversational text.

Your mission:
Analyze text segments in sequence.

1. Spoken Dialogue vs. Internal Thoughts vs. Narration:
   You determine whether each segment is spoken dialogue ("is_dialogue": true) or non-dialogue narration/thought ("is_dialogue": false).

   A. SPOKEN DIALOGUE ("is_dialogue": true, "is_internal_thought": false):
      - Words spoken ALOUD by a character to another person, spoken out loud to a room, direct vocal speech, shouting, or direct vocal telepathy/divine speech (e.g. [I accept your tribute...]).
      - Enclosed in DOUBLE QUOTES ("...", “...”), bracketed speech ([...]), Asian dialogue quotes (「...」), OR has spoken speech verbs addressed to others ('Deputy Manager Seo...', 'Director Kim asked').
      - Set "is_dialogue": true, "is_internal_thought": false, and attribute to the speaking character ("speaker": "Director Kim", etc.).

   B. INTERNAL THOUGHTS ("is_dialogue": false, "is_internal_thought": true, "speaker": "Narrator", "gender": "neutral"):
      - Unspoken mental reflections, thoughts in a character's mind, silent musings, memories, or internal monologues that are NOT spoken out loud to others.
      - In fiction and web novels, internal thoughts are typically enclosed in SINGLE QUOTES ('...' or ‘...’).
      - AUDIOBOOK RULE FOR INTERNAL THOUGHTS:
        In audiobook production, silent internal thoughts are voiced by the Narrator!
        You MUST set "is_dialogue": false, "is_internal_thought": true, "speaker": "Narrator", "gender": "neutral".
        NEVER assign an internal thought to a character name! NEVER set "is_dialogue": true for internal thoughts!

   C. NARRATION ("is_dialogue": false, "is_internal_thought": false, "speaker": "Narrator", "gender": "neutral"):
      - Descriptive prose, exposition, action beats, scene descriptions, and quoted narrative terms.
      - Always set "is_dialogue": false, "is_internal_thought": false, "speaker": "Narrator", "gender": "neutral".

2. Speaker Attribution Priority (for spoken dialogue):
   For every spoken dialogue segment ("is_dialogue": true, "is_internal_thought": false), use narrative context, speech tags, character actions, conversational alternation, and proximity to identify:
   - The EXACT character who spoke the line.
   - The character's gender ("male" or "female").

3. Anonymous Fallback:
   If speaker is genuinely unknown or crowd, use "General Male" or "General Female".

4. Paralinguistic Sound Tags:
   ONLY when explicitly indicated by narrative, assign: [laugh], [sigh], [gasp], [groan], [chuckle], [cough], [sniff], [shush], [clear throat]. Otherwise null.

JSON schema:
{
  "decisions": [
    {
      "segment_id": "string",
      "delivery_type": "dialogue" | "internal_thought" | "system_prompt" | "narration",
      "is_dialogue": true | false,
      "is_internal_thought": true | false,
      "speaker": "string",
      "gender": "male" | "female" | "neutral",
      "paralinguistic_tag": "string" | null,
      "confidence": 0.0 - 1.0
    }
  ]
}
"""

def legacy_extract_speaker_tag(text: str) -> str | None:
    """Old speech tag regex without quotation stripping."""
    if not text:
        return None
    # Pre-optimization regex that directly matched on text without stripping quotes:
    verb_after = re.search(r'([A-Z][a-zA-Z\s\.\-]{1,35})\s+(?:said|shouted|asked|yelled|whispered|screamed|mumbled|roared|bellowed|groaned|exclaimed)\b', text, re.IGNORECASE)
    if verb_after:
        return verb_after.group(1).strip()
    verb_before = re.search(r'\b(?:said|shouted|asked|yelled|whispered|screamed|mumbled|roared|bellowed|groaned|exclaimed)\s+([A-Z][a-zA-Z\s\.\-]{1,35})', text, re.IGNORECASE)
    if verb_before:
        return verb_before.group(1).strip()
    return None

async def run_old_baseline_window(
    client: httpx.AsyncClient,
    window_segments: list[ScriptSegmentModel],
    known_characters: list[dict[str, Any]],
    prior_decisions: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Runs a single window using the unoptimized pre-fix pipeline."""
    payload = {
        "project_context": {
            "title": "AotTC",
            "genre": "Fantasy",
        },
        "known_characters": [
            {"canonical_name": c["canonical_name"], "gender": c.get("gender", "male")}
            for c in known_characters
        ],
        "window_segments": [
            {
                "segment_id": s.id,
                "text": s.text,
            }
            for s in window_segments
        ],
        "prior_decisions_tail": prior_decisions[-8:] if prior_decisions else [],
    }

    start_t = time.monotonic()
    response = await client.post(
        f"{DEEPSEEK_BASE_URL.rstrip('/')}/chat/completions",
        headers={
            "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
            "Content-Type": "application/json",
        },
        json={
            "model": DEEPSEEK_MODEL,
            "messages": [
                {"role": "system", "content": OLD_SYSTEM_PROMPT},
                {"role": "user", "content": json.dumps(payload)},
            ],
            "response_format": {"type": "json_object"},
            "temperature": 0.1,
            "max_tokens": 4096,
        },
        timeout=90.0,
    )
    call_latency = time.monotonic() - start_t
    res_data = response.json()
    usage = res_data.get("usage", {})
    usage["latency_seconds"] = round(call_latency, 3)

    content = res_data["choices"][0]["message"]["content"]
    parsed = json.loads(content)
    raw_decisions = parsed.get("decisions", [])

    clean_decisions = []
    for d in raw_decisions:
        speaker = d.get("speaker", "Narrator")
        gender = d.get("gender", "male")
        # Legacy line 836 gender override bug:
        can_gnd = infer_name_gender(speaker)
        if can_gnd:
            gender = can_gnd  # Overwrote female characters to male!
        clean_decisions.append({
            "segment_id": d.get("segment_id"),
            "speaker": speaker,
            "gender": gender,
            "delivery_type": d.get("delivery_type", "narration"),
            "is_dialogue": d.get("is_dialogue", False),
            "is_internal_thought": d.get("is_internal_thought", False),
            "paralinguistic_tag": d.get("paralinguistic_tag"),
            "confidence": d.get("confidence", 0.9),
        })

    return clean_decisions, usage

async def run_evaluation():
    await init_db()
    factory = get_session_factory()
    chap_id = "59bda6e7-c3ad-4f72-a75c-fa7a5a600e9e"  # Manuscript Chapter 4 (DB chapter_number 5)
    proj_id = "b5e5236b-c425-4e82-a188-ed12f1012aa2"

    async with factory() as db:
        project = await db.get(ProjectModel, proj_id)
        stmt = (
            select(ScriptSegmentModel)
            .where(ScriptSegmentModel.chapter_id == chap_id)
            .order_by(ScriptSegmentModel.order_index.asc())
        )
        segments = list((await db.execute(stmt)).scalars().all())

    print(f"================================================================================")
    print(f"CONTROLLED EVALUATION: Manuscript Chapter 4 (DB ID: {chap_id[:8]}, {len(segments)} segments)")
    print(f"Model: {DEEPSEEK_MODEL} | Pricing: Miss $0.27/M, Hit $0.07/M, Out $1.10/M")
    print(f"================================================================================\n")

    known_chars = [
        {"canonical_name": "Julien D. Evenus", "aliases": ["julien"], "gender": "male", "role": "protagonist"},
        {"canonical_name": "Herman Chambers", "aliases": [], "gender": "male"},
        {"canonical_name": "Delilah V. Rosemberg", "aliases": [], "gender": "female"},
        {"canonical_name": "Cathrine Riley Graham", "aliases": [], "gender": "female"},
    ]

    # -------------------------------------------------------------------------
    # PART 1A: RUN OLD IMPLEMENTATION (Window 25, Step 20, 9-Field Full JSON)
    # -------------------------------------------------------------------------
    print(">>> 1. Running OLD IMPLEMENTATION (Window 25, Step 20, 9-field full schema)...")
    old_start_t = time.monotonic()
    old_decisions = []
    old_call_records = []
    old_total_prompt = 0
    old_total_comp = 0
    old_total_hit = 0
    old_total_miss = 0

    async with httpx.AsyncClient() as client:
        for w_idx, start_idx in enumerate(range(0, len(segments), 20)):
            window = segments[start_idx : start_idx + 25]
            # Old speech tag extraction (without quotation stripping)
            for s in window:
                old_tag = legacy_extract_speaker_tag(s.text)
                if old_tag and not any(k["canonical_name"].lower() == old_tag.lower() for k in known_chars):
                    # In the old code, this was added to known_characters without validation!
                    known_chars.append({"canonical_name": old_tag, "gender": "male", "aliases": []})

            decs, usage = await run_old_baseline_window(
                client=client,
                window_segments=window,
                known_characters=known_chars,
                prior_decisions=old_decisions,
            )

            p = usage.get("prompt_tokens", 0)
            c = usage.get("completion_tokens", 0)
            hit = usage.get("prompt_cache_hit_tokens", 0)
            miss = usage.get("prompt_cache_miss_tokens", max(0, p - hit))
            lat = usage.get("latency_seconds", 0)

            old_total_prompt += p
            old_total_comp += c
            old_total_hit += hit
            old_total_miss += miss

            old_call_records.append({
                "window_index": w_idx + 1,
                "range": f"{start_idx}-{min(len(segments), start_idx + len(window))}",
                "prompt_tokens": p,
                "cache_hit_tokens": hit,
                "cache_miss_tokens": miss,
                "completion_tokens": c,
                "latency_seconds": lat,
            })
            print(f"  Old Win {w_idx+1:2} (segs {start_idx:3}-{min(len(segments), start_idx+len(window)):3}): prompt={p:4} (hit={hit:4}, miss={miss:4}), comp={c:4}, lat={lat:.2f}s")
            old_decisions.extend(decs)

    old_duration = time.monotonic() - old_start_t
    old_cost = (old_total_miss * 0.27 + old_total_hit * 0.07 + old_total_comp * 1.10) / 1_000_000

    print(f"\n[OLD IMPLEMENTATION TOTALS]")
    print(f"  Calls: {len(old_call_records)} | Latency: {old_duration:.2f}s | Cost: ${old_cost:.6f}")
    print(f"  Prompt Tokens: {old_total_prompt} (Hit: {old_total_hit}, Miss: {old_total_miss})")
    print(f"  Completion Tokens: {old_total_comp}")

    # -------------------------------------------------------------------------
    # PART 1B: RUN OPTIMIZED IMPLEMENTATION (Window 60, Step 50, Dialogue-Only)
    # -------------------------------------------------------------------------
    print("\n>>> 2. Running OPTIMIZED IMPLEMENTATION (Window 60, Step 50, Dialogue-Only)...")
    opt_start_t = time.monotonic()
    opt_decisions = []
    opt_call_records = []
    opt_total_prompt = 0
    opt_total_comp = 0
    opt_total_hit = 0
    opt_total_miss = 0
    processed_ids = set()

    clean_known_chars = [
        {"canonical_name": "Julien D. Evenus", "aliases": ["julien"], "gender": "male", "role": "protagonist"},
        {"canonical_name": "Herman Chambers", "aliases": [], "gender": "male"},
        {"canonical_name": "Delilah V. Rosemberg", "aliases": [], "gender": "female"},
        {"canonical_name": "Cathrine Riley Graham", "aliases": [], "gender": "female"},
    ]

    narrative_pov = StageBTaggingService.detect_narrative_pov(
        segments=segments,
        project_settings={"pov_mode": "first_person", "pov_protagonist": "Julien D. Evenus"},
        known_characters=clean_known_chars,
    )

    for w_idx, start_idx in enumerate(range(0, len(segments), 50)):
        window = segments[start_idx : start_idx + 60]
        target_ids = {s.id for s in window if s.id not in processed_ids} if start_idx > 0 else None

        call_start = time.monotonic()
        decs, usage = await StageBTaggingService.tag_window_with_deepseek(
            window_segments=window,
            prior_decisions=opt_decisions,
            project_settings=project.settings,
            allow_offline_heuristic=False,
            known_characters=clean_known_chars,
            target_segment_ids=target_ids,
            narrative_pov=narrative_pov,
        )
        call_lat = time.monotonic() - call_start

        for s in window:
            processed_ids.add(s.id)

        if usage:
            p = usage.get("prompt_tokens", 0)
            c = usage.get("completion_tokens", 0)
            hit = usage.get("prompt_cache_hit_tokens", 0)
            miss = usage.get("prompt_cache_miss_tokens", max(0, p - hit))

            opt_total_prompt += p
            opt_total_comp += c
            opt_total_hit += hit
            opt_total_miss += miss

            opt_call_records.append({
                "window_index": w_idx + 1,
                "range": f"{start_idx}-{min(len(segments), start_idx + len(window))}",
                "prompt_tokens": p,
                "cache_hit_tokens": hit,
                "cache_miss_tokens": miss,
                "completion_tokens": c,
                "latency_seconds": round(call_lat, 3),
            })
            print(f"  Opt Win {w_idx+1:2} (segs {start_idx:3}-{min(len(segments), start_idx+len(window)):3}): prompt={p:4} (hit={hit:4}, miss={miss:4}), comp={c:4}, lat={call_lat:.2f}s")
        else:
            print(f"  Opt Win {w_idx+1:2} (segs {start_idx:3}-{min(len(segments), start_idx+len(window)):3}): BYPASSED (0 dialogue targets)")

        existing_ids = {d["segment_id"] for d in opt_decisions if "segment_id" in d}
        opt_decisions.extend([d for d in decs if d.get("segment_id") not in existing_ids])

    opt_duration = time.monotonic() - opt_start_t
    opt_cost = (opt_total_miss * 0.27 + opt_total_hit * 0.07 + opt_total_comp * 1.10) / 1_000_000

    print(f"\n[OPTIMIZED IMPLEMENTATION TOTALS]")
    print(f"  Calls: {len(opt_call_records)} | Latency: {opt_duration:.2f}s | Cost: ${opt_cost:.6f}")
    print(f"  Prompt Tokens: {opt_total_prompt} (Hit: {opt_total_hit}, Miss: {opt_total_miss})")
    print(f"  Completion Tokens: {opt_total_comp}")

    # Persist raw run metadata for audit
    with open("eval_raw_baseline.json", "w") as f:
        json.dump({
            "chapter_id": chap_id,
            "chapter_title": "Chapter 4",
            "segments_count": len(segments),
            "calls": len(old_call_records),
            "duration_seconds": round(old_duration, 2),
            "prompt_tokens": old_total_prompt,
            "cache_hit_tokens": old_total_hit,
            "cache_miss_tokens": old_total_miss,
            "completion_tokens": old_total_comp,
            "cost_usd": round(old_cost, 6),
            "per_call_details": old_call_records,
            "decisions": old_decisions,
        }, f, indent=2)

    with open("eval_raw_optimized.json", "w") as f:
        json.dump({
            "chapter_id": chap_id,
            "chapter_title": "Chapter 4",
            "segments_count": len(segments),
            "calls": len(opt_call_records),
            "duration_seconds": round(opt_duration, 2),
            "prompt_tokens": opt_total_prompt,
            "cache_hit_tokens": opt_total_hit,
            "cache_miss_tokens": opt_total_miss,
            "completion_tokens": opt_total_comp,
            "cost_usd": round(opt_cost, 6),
            "per_call_details": opt_call_records,
            "decisions": opt_decisions,
        }, f, indent=2)

    print("\nSaved raw execution traces to eval_raw_baseline.json and eval_raw_optimized.json")

if __name__ == "__main__":
    asyncio.run(run_evaluation())
