import asyncio
import json
import os
import time
from typing import Any
import httpx
from sqlalchemy import select

from app.db.session import get_session_factory, init_db
from app.models.chapter import ScriptSegmentModel
from app.models.character import CharacterModel
from app.models.project import ProjectModel
from app.services.tagger import StageBTaggingService
from evaluate_reference_set import REFERENCE_SET

# DeepSeek Chat pricing ($ / 1M tokens)
PRICING_PROMPT_MISS = 0.27
PRICING_PROMPT_HIT = 0.07
PRICING_COMPLETION = 1.10

CHAPTER_IDS = {
    2: "ec8173eb-c622-4966-826d-88f16d67834f",  # Prologue [one]
    3: "d0a3a07e-866a-41aa-9c30-d07075e41d74",  # Chapter 2
    4: "53712e32-63d5-4968-a56a-c34a8eff107e",  # Chapter 3
    5: "59bda6e7-c3ad-4f72-a75c-fa7a5a600e9e",  # Chapter 4
}
PROJECT_ID = "b5e5236b-c425-4e82-a188-ed12f1012aa2"


def compute_cost(miss_tokens: int, hit_tokens: int, comp_tokens: int) -> float:
    return (
        miss_tokens * PRICING_PROMPT_MISS
        + hit_tokens * PRICING_PROMPT_HIT
        + comp_tokens * PRICING_COMPLETION
    ) / 1_000_000.0


async def run_live_benchmark():
    await init_db()
    factory = get_session_factory()

    # Load baseline Chapter 5 raw run if present
    base_ch5_path = "apps/api/eval_raw_baseline.json" if os.path.exists("apps/api/eval_raw_baseline.json") else "eval_raw_baseline.json"
    eval_base_ch5 = {}
    if os.path.exists(base_ch5_path):
        with open(base_ch5_path) as f:
            raw = json.load(f)
            eval_base_ch5 = {d["segment_id"]: d for d in raw.get("decisions", [])}

    # Load project, known characters, and historical baseline from DB
    async with factory() as db:
        project = await db.get(ProjectModel, PROJECT_ID)
        char_stmt = select(CharacterModel).where(
            CharacterModel.project_id == PROJECT_ID,
            CharacterModel.is_general == False,
            CharacterModel.is_system == False,
        )
        chars = (await db.execute(char_stmt)).scalars().all()
        known_characters = [
            {
                "canonical_name": c.name,
                "gender": c.gender,
                "aliases": c.aliases or [],
                "role": c.role_description,
            }
            for c in chars
            if not StageBTaggingService.is_invalid_character_name(c.name)
        ]

        # Load historical baseline DB records
        seg_stmt = (
            select(
                ScriptSegmentModel.id,
                ScriptSegmentModel.chapter_id,
                ScriptSegmentModel.order_index,
                CharacterModel.name,
                CharacterModel.gender,
            )
            .join(CharacterModel, ScriptSegmentModel.character_id == CharacterModel.id, isouter=True)
        )
        db_history_map = {}
        for row in (await db.execute(seg_stmt)).all():
            sid, cid, oidx, cname, cgnd = row
            db_history_map[(cid, oidx)] = {
                "segment_id": sid,
                "speaker": cname or "Narrator",
                "gender": cgnd or "neutral",
            }

    print("================================================================================")
    print("LIVE SPEAKER-ATTRIBUTION BENCHMARK: PROPOSED LEAN HYBRID PIPELINE")
    print(f"Project: {project.title} (ID: {PROJECT_ID[:8]}) | Target Chapters: 2, 3, 4, 5")
    print(f"Total Reference Benchmark Segments: {len(REFERENCE_SET)}")
    print("================================================================================\n")

    overall_start_t = time.monotonic()
    total_calls = 0
    total_prompt_tokens = 0
    total_hit_tokens = 0
    total_miss_tokens = 0
    total_comp_tokens = 0

    chapter_results = {}
    updated_decisions_by_chap_order = {}

    for cnum in [2, 3, 4, 5]:
        cid = CHAPTER_IDS[cnum]
        print(f"\n--- Processing Chapter {cnum} (DB ID: {cid[:8]}) ---")

        async with factory() as db:
            stmt = (
                select(ScriptSegmentModel)
                .where(ScriptSegmentModel.chapter_id == cid)
                .order_by(ScriptSegmentModel.order_index.asc())
            )
            segments = list((await db.execute(stmt)).scalars().all())

        narrative_pov = StageBTaggingService.detect_narrative_pov(
            segments=segments,
            project_settings=project.settings,
            known_characters=known_characters,
        )

        windows = StageBTaggingService.partition_chapter_into_windows(
            segments=segments,
            max_context=120,
            max_dialogue_targets=30,
            overlap=8,
        )
        print(f"  Segments: {len(segments)} -> Partitioned into {len(windows)} dynamic scene-bounded windows")

        chap_decisions = []
        chap_processed_ids = set()

        for w_idx, win_info in enumerate(windows):
            window = win_info["segments"]
            start_idx = win_info["start_idx"]
            end_idx = win_info["end_idx"]
            is_new_scene = win_info["is_new_scene"]
            target_ids = {s.id for s in window if s.id not in chap_processed_ids} if start_idx > 0 else None

            # Reset conversational context if crossing a scene boundary
            prior_context = [] if is_new_scene else chap_decisions

            call_start = time.monotonic()
            decs, usage = await StageBTaggingService.tag_window_with_deepseek(
                window_segments=window,
                prior_decisions=prior_context,
                project_settings=project.settings,
                allow_offline_heuristic=False,
                known_characters=known_characters,
                target_segment_ids=target_ids,
                narrative_pov=narrative_pov,
            )
            call_lat = time.monotonic() - call_start

            for s in window:
                chap_processed_ids.add(s.id)

            if usage:
                p = usage.get("prompt_tokens", 0)
                c = usage.get("completion_tokens", 0)
                hit = usage.get("prompt_cache_hit_tokens", 0)
                miss = usage.get("prompt_cache_miss_tokens", max(0, p - hit))

                total_calls += 1
                total_prompt_tokens += p
                total_comp_tokens += c
                total_hit_tokens += hit
                total_miss_tokens += miss

                print(f"  Win {w_idx+1}/{len(windows)} (segs {start_idx:3}-{end_idx:3}, new_scene={is_new_scene}): prompt={p:4} (hit={hit:4}, miss={miss:4}), comp={c:4}, lat={call_lat:.2f}s")
            else:
                print(f"  Win {w_idx+1}/{len(windows)} (segs {start_idx:3}-{end_idx:3}, new_scene={is_new_scene}): OFFLINE / BYPASSED")

            existing_ids = {d["segment_id"] for d in chap_decisions if "segment_id" in d}
            chap_decisions.extend([d for d in decs if d.get("segment_id") not in existing_ids])

        # Post-chapter validation & dialogue turn-taking parity enforcement
        validated = StageBTaggingService.enforce_dialogue_chain_turn_taking(
            segments, chap_decisions, known_characters
        )
        val_map = {d["segment_id"]: d for d in validated}

        for s in segments:
            if s.id in val_map:
                updated_decisions_by_chap_order[(cnum, s.order_index)] = val_map[s.id]

    overall_duration = time.monotonic() - overall_start_t
    total_cost = compute_cost(total_miss_tokens, total_hit_tokens, total_comp_tokens)

    # -------------------------------------------------------------------------
    # AUDIT AGAINST 70 REFERENCE SEGMENTS
    # -------------------------------------------------------------------------
    print("\n================================================================================")
    print("EVALUATING ACCURACY ACROSS 70 BENCHMARK REFERENCE SEGMENTS")
    print("================================================================================\n")

    base_correct_count = 0
    base_wrong_char_count = 0
    base_gender_err_count = 0
    base_unresolved_count = 0

    opt_correct_count = 0
    opt_wrong_char_count = 0
    opt_gender_err_count = 0
    opt_unresolved_count = 0

    audit_records = []

    for ref in REFERENCE_SET:
        cnum = ref["chap_num"]
        order = ref["order"]
        cid = CHAPTER_IDS[cnum]
        exp_spk = ref["exp_spk"]
        exp_gnd = ref["exp_gnd"]

        # Baseline attribution
        hist_rec = db_history_map.get((cid, order), {})
        seg_id = hist_rec.get("segment_id")
        if cnum == 5 and seg_id in eval_base_ch5:
            base_spk = eval_base_ch5[seg_id]["speaker"]
            base_gnd = eval_base_ch5[seg_id]["gender"]
        else:
            base_spk = hist_rec.get("speaker", "Narrator")
            base_gnd = hist_rec.get("gender", "neutral")

        # Updated attribution
        opt_rec = updated_decisions_by_chap_order.get((cnum, order), {})
        opt_spk = opt_rec.get("speaker", "Narrator")
        opt_gnd = opt_rec.get("gender", "neutral")

        # Evaluate Baseline
        is_base_spk_correct = (base_spk.lower() == exp_spk.lower())
        is_base_gnd_correct = (base_gnd.lower() == exp_gnd.lower())
        if is_base_spk_correct:
            base_correct_count += 1
        else:
            if base_spk in {"General Male", "General Female", "Narrator"}:
                base_unresolved_count += 1
            else:
                base_wrong_char_count += 1
        if not is_base_gnd_correct:
            base_gender_err_count += 1

        # Evaluate Updated Implementation
        is_opt_spk_correct = (opt_spk.lower() == exp_spk.lower())
        is_opt_gnd_correct = (opt_gnd.lower() == exp_gnd.lower())
        if is_opt_spk_correct:
            opt_correct_count += 1
        else:
            if opt_spk in {"General Male", "General Female", "Narrator"}:
                opt_unresolved_count += 1
            else:
                opt_wrong_char_count += 1
        if not is_opt_gnd_correct:
            opt_gender_err_count += 1

        audit_records.append({
            "chapter": cnum,
            "order": order,
            "category": ref["cat"],
            "text": ref["text"],
            "expected_speaker": exp_spk,
            "expected_gender": exp_gnd,
            "baseline_speaker": base_spk,
            "baseline_gender": base_gnd,
            "baseline_correct": is_base_spk_correct,
            "updated_speaker": opt_spk,
            "updated_gender": opt_gnd,
            "updated_correct": is_opt_spk_correct,
            "notes": ref["notes"],
        })

    total_ref = len(REFERENCE_SET)
    base_acc = (base_correct_count / total_ref) * 100
    opt_acc = (opt_correct_count / total_ref) * 100

    print(f"BENCHMARK SUMMARY (N = {total_ref} representative segments):")
    print(f"  Baseline Accuracy:      {base_correct_count}/{total_ref} ({base_acc:.1f}%)")
    print(f"  Updated Accuracy:       {opt_correct_count}/{total_ref} ({opt_acc:.1f}%)")
    print(f"  Wrong-Character Count:  Baseline = {base_wrong_char_count} -> Updated = {opt_wrong_char_count}")
    print(f"  Gender Errors:          Baseline = {base_gender_err_count} -> Updated = {opt_gender_err_count}")
    print(f"  Unresolved / Generic:   Baseline = {base_unresolved_count} -> Updated = {opt_unresolved_count}")
    print(f"\nRESOURCE USAGE (All 4 Chapters - 932 Segments Total):")
    print(f"  API Calls:              {total_calls}")
    print(f"  Prompt Cache Hit Tok:   {total_hit_tokens}")
    print(f"  Prompt Cache Miss Tok:  {total_miss_tokens}")
    print(f"  Completion Tokens:      {total_comp_tokens}")
    print(f"  Measured Latency:       {overall_duration:.2f}s (avg {overall_duration/max(1, total_calls):.2f}s/call)")
    print(f"  Measured Cost (USD):    ${total_cost:.5f}")

    out_file = "apps/api/eval_benchmark_live_results.json" if os.path.exists("apps/api") else "eval_benchmark_live_results.json"
    with open(out_file, "w") as f:
        json.dump({
            "metrics": {
                "total_reference_segments": total_ref,
                "baseline_accuracy_pct": round(base_acc, 2),
                "baseline_correct": base_correct_count,
                "baseline_wrong_character_assignments": base_wrong_char_count,
                "baseline_gender_errors": base_gender_err_count,
                "baseline_unresolved_cases": base_unresolved_count,
                "updated_accuracy_pct": round(opt_acc, 2),
                "updated_correct": opt_correct_count,
                "updated_wrong_character_assignments": opt_wrong_char_count,
                "updated_gender_errors": opt_gender_err_count,
                "updated_unresolved_cases": opt_unresolved_count,
                "total_api_calls": total_calls,
                "total_prompt_tokens": total_hit_tokens + total_miss_tokens,
                "prompt_cache_hit_tokens": total_hit_tokens,
                "prompt_cache_miss_tokens": total_miss_tokens,
                "completion_tokens": total_comp_tokens,
                "latency_seconds": round(overall_duration, 2),
                "cost_usd": round(total_cost, 6),
            },
            "records": audit_records,
        }, f, indent=2)

    print(f"\nSaved live benchmark audit report to {out_file}")


if __name__ == "__main__":
    asyncio.run(run_live_benchmark())
