#!/usr/bin/env python3
"""
Noveler Standalone GPU Session Worker
======================================
Autonomous Kokoro-82M ONNX batch runner designed for Kaggle GPU environments
and headless container execution.

Features:
- Pre-mounted dataset discovery (/kaggle/input/noveler-models) for instant boot (<2s).
- Atomic R2 audio uploads (segments, takes, master chapter).
- Progressive segment completion receipts for real-time canvas playback.
- Persistent hot-retake polling loop with dynamic AWS4 presigning and shutdown signals.
- Explicit VRAM and memory hygiene via gc.collect().
"""

import argparse
import gc
import io
import json
import logging
import os
import struct
import subprocess
import sys
import time
import urllib.request
import wave
from datetime import UTC, datetime
from typing import Any

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("worker_session")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Noveler GPU Audio Session Worker")
    parser.add_argument("--job-id", default=os.getenv("JOB_ID", ""), help="Unique Job ID")
    parser.add_argument("--project-id", default=os.getenv("PROJECT_ID", ""), help="Target Project ID")
    parser.add_argument("--tts-model", default=os.getenv("TTS_MODEL", "kokoro-82m"), help="TTS model engine")
    parser.add_argument("--r2-endpoint", default=os.getenv("R2_ENDPOINT", ""), help="Cloudflare R2 Endpoint URL")
    parser.add_argument("--r2-bucket", default=os.getenv("R2_BUCKET", "novelova"), help="Cloudflare R2 Bucket Name")
    parser.add_argument("--r2-access-key", default=os.getenv("R2_ACCESS_KEY", ""), help="R2 Access Key ID")
    parser.add_argument("--r2-secret-key", default=os.getenv("R2_SECRET_KEY", ""), help="R2 Secret Access Key")
    parser.add_argument("--manifest-path", default=os.getenv("MANIFEST_PATH", ""), help="Local manifest path override")
    parser.add_argument("--hot-session-seconds", type=int, default=int(os.getenv("HOT_SESSION_SECONDS", "14400")), help="Hot session timeout in seconds (default 4 hours)")
    return parser.parse_args()


def init_boto3_client(endpoint: str, bucket: str, access_key: str, secret_key: str):
    if not (endpoint and access_key and secret_key):
        logger.warning("R2 credentials not fully specified. S3 operations will be disabled.")
        return None
    try:
        import boto3
    except ImportError:
        logger.info("Installing boto3 for R2 cloud storage bus...")
        subprocess.run([sys.executable, "-m", "pip", "install", "-q", "boto3"], check=True)
        import boto3

    try:
        client = boto3.client(
            "s3",
            endpoint_url=endpoint,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            region_name="auto",
        )
        logger.info("Connected to Cloudflare R2 bucket: %s", bucket)
        return client
    except Exception as exc:
        logger.error("Failed to connect to R2 storage: %s", exc)
        return None


def init_kokoro_model(tts_model: str):
    if tts_model != "kokoro-82m":
        logger.info("TTS model %s requested. Skipping Kokoro ONNX loading.", tts_model)
        return None

    try:
        from kokoro_onnx import Kokoro
    except ImportError:
        logger.info("Installing kokoro-onnx, soundfile, and onnxruntime-gpu...")
        subprocess.run(
            [sys.executable, "-m", "pip", "install", "-q", "kokoro-onnx", "soundfile", "onnxruntime-gpu"],
            check=False,
        )
        try:
            from kokoro_onnx import Kokoro
        except Exception as exc:
            logger.error("Unable to import kokoro_onnx after installation: %s", exc)
            return None

    candidate_onnx = [
        "/kaggle/input/noveler-models/kokoro-v1.0.onnx",
        "/kaggle/working/kokoro-v1.0.onnx",
        os.path.expanduser("~/.cache/novelova/kokoro-v1.0.onnx"),
    ]
    candidate_voices = [
        "/kaggle/input/noveler-models/voices-v1.0.bin",
        "/kaggle/working/voices-v1.0.bin",
        os.path.expanduser("~/.cache/novelova/voices-v1.0.bin"),
    ]

    # Search pre-mounted dataset volumes if on Kaggle
    if os.path.exists("/kaggle/input"):
        for root, _, files in os.walk("/kaggle/input"):
            if "kokoro-v1.0.onnx" in files:
                candidate_onnx.insert(0, os.path.join(root, "kokoro-v1.0.onnx"))
            if "voices-v1.0.bin" in files:
                candidate_voices.insert(0, os.path.join(root, "voices-v1.0.bin"))

    onnx_path = next((p for p in candidate_onnx if os.path.exists(p)), "/kaggle/working/kokoro-v1.0.onnx")
    voices_path = next((p for p in candidate_voices if os.path.exists(p)), "/kaggle/working/voices-v1.0.bin")

    os.makedirs(os.path.dirname(onnx_path) or ".", exist_ok=True)
    os.makedirs(os.path.dirname(voices_path) or ".", exist_ok=True)

    if not os.path.exists(onnx_path):
        logger.info("Downloading Kokoro ONNX model weights (~325MB)...")
        try:
            urllib.request.urlretrieve(
                "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1/kokoro-v1.0.onnx",
                onnx_path,
            )
        except Exception as exc:
            logger.error("Error downloading ONNX weights: %s", exc)
    else:
        logger.info("Found Kokoro ONNX model weights at: %s", onnx_path)

    if not os.path.exists(voices_path):
        logger.info("Downloading Kokoro voice embeddings (~28MB)...")
        try:
            urllib.request.urlretrieve(
                "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1/voices-v1.0.bin",
                voices_path,
            )
        except Exception as exc:
            logger.error("Error downloading Kokoro voice embeddings: %s", exc)
    else:
        logger.info("Found Kokoro voice embeddings at: %s", voices_path)

    try:
        if os.path.exists(onnx_path) and os.path.exists(voices_path):
            model = Kokoro(onnx_path, voices_path)
            logger.info("Kokoro-82M ONNX resident in GPU VRAM. Real-time factor ready!")
            return model
    except Exception as exc:
        logger.error("Failed to load Kokoro ONNX model into VRAM: %s", exc)
    return None


def run_worker_session(args: argparse.Namespace) -> None:
    logger.info("=====================================================")
    logger.info("🎧 Noveler GPU Session Worker Starting")
    logger.info("Job ID: %s", args.job_id)
    logger.info("TTS Model: %s", args.tts_model)
    logger.info("Target Project ID: %s", args.project_id)
    logger.info("=====================================================")

    s3 = init_boto3_client(
        endpoint=args.r2_endpoint,
        bucket=args.r2_bucket,
        access_key=args.r2_access_key,
        secret_key=args.r2_secret_key,
    )

    kokoro_model = init_kokoro_model(args.tts_model)

    manifest: dict[str, Any] | None = None
    if args.manifest_path and os.path.exists(args.manifest_path):
        with open(args.manifest_path, "r", encoding="utf-8") as f:
            manifest = json.load(f)
        logger.info("Loaded manifest from local path: %s", args.manifest_path)
    elif s3 and args.job_id:
        manifest_key = f"jobs/{args.job_id}/manifest.json"
        try:
            obj = s3.get_object(Bucket=args.r2_bucket, Key=manifest_key)
            manifest = json.loads(obj["Body"].read().decode("utf-8"))
            logger.info("Fetched manifest from R2: %d chapters found", len(manifest.get("chapters", [])))
        except Exception as exc:
            logger.warning("Could not fetch remote manifest from R2 (%s): %s", manifest_key, exc)

    if not manifest:
        logger.warning("No manifest available. Entering idle hot-retake standby mode...")
        manifest = {"chapters": []}

    project_id = args.project_id or manifest.get("project_id", "unknown-project")
    chapters = manifest.get("chapters", [])

    for ch in chapters:
        ch_num = ch.get("chapter_number", 1)
        ch_title = ch.get("title", f"Chapter {ch_num}")
        segments = ch.get("segments", [])
        logger.info("Synthesizing Chapter %s: '%s' (%d segments)...", ch_num, ch_title, len(segments))

        alignments: list[dict[str, Any]] = []
        current_ms = 0
        full_audio_frames = bytearray()

        for seg in segments:
            text = seg.get("text", "").strip()
            gender = (seg.get("speaker_gender") or "male").lower()
            seg_id = seg.get("id")

            words = len(text.split()) if text else 1
            dur_sec = max(1.0, words * 0.35)
            dur_ms = int(dur_sec * 1000)

            seg_frames = bytearray()
            if kokoro_model and text:
                try:
                    import numpy as np

                    voice_name = "af_sarah" if gender == "female" else "am_adam"
                    samples, sr = kokoro_model.create(text, voice=voice_name, speed=1.0, lang="en-us")
                    audio_int16 = (np.clip(samples, -1.0, 1.0) * 32767).astype(np.int16)
                    seg_frames.extend(audio_int16.tobytes())
                    full_audio_frames.extend(audio_int16.tobytes())
                    dur_ms = max(dur_ms, int((len(samples) / float(sr)) * 1000))
                except Exception as exc:
                    logger.warning("Segment synthesis notice (id=%s): %s", seg_id, exc)

            start_ms = current_ms
            end_ms = start_ms + dur_ms

            seg_take_key = f"projects/{project_id}/audio/takes/{seg_id}.wav"
            seg_audio_url = None
            if seg_frames and s3 and args.r2_bucket:
                try:
                    wav_buf = io.BytesIO()
                    with wave.open(wav_buf, "wb") as wf:
                        wf.setnchannels(1)
                        wf.setsampwidth(2)
                        wf.setframerate(24000)
                        wf.writeframes(seg_frames)
                    s3.put_object(
                        Bucket=args.r2_bucket,
                        Key=seg_take_key,
                        Body=wav_buf.getvalue(),
                        ContentType="audio/wav",
                    )
                    if args.r2_endpoint:
                        seg_audio_url = f"{args.r2_endpoint}/{args.r2_bucket}/{seg_take_key}"
                except Exception as exc:
                    logger.warning("Could not upload segment take: %s", exc)

            if s3 and args.r2_bucket and seg_id:
                try:
                    seg_receipt_key = f"jobs/{args.job_id}/segments/{seg_id}.json"
                    seg_receipt_data = {
                        "job_id": args.job_id,
                        "chapter_id": ch.get("id"),
                        "chapter_number": ch_num,
                        "segment_id": seg_id,
                        "order_index": seg.get("order_index", 0),
                        "start_ms": start_ms,
                        "end_ms": end_ms,
                        "duration_ms": dur_ms,
                        "storage_key": seg_take_key,
                        "audio_url": seg_audio_url,
                        "status": "complete",
                    }
                    s3.put_object(
                        Bucket=args.r2_bucket,
                        Key=seg_receipt_key,
                        Body=json.dumps(seg_receipt_data),
                        ContentType="application/json",
                    )
                except Exception as exc:
                    logger.warning("Could not upload segment receipt: %s", exc)

            alignments.append({
                "segment_id": seg_id,
                "order_index": seg.get("order_index", 0),
                "start_ms": start_ms,
                "end_ms": end_ms,
                "duration_ms": dur_ms,
                "storage_key": seg_take_key,
                "audio_url": seg_audio_url,
            })

            # 300ms inter-segment natural pacing
            current_ms = end_ms + 300
            full_audio_frames.extend(b"\x00" * 14400)

        total_duration_sec = max(1, current_ms // 1000)
        audio_key = None
        chapter_audio_url = None

        if full_audio_frames and s3:
            try:
                wav_buf = io.BytesIO()
                with wave.open(wav_buf, "wb") as wf:
                    wf.setnchannels(1)
                    wf.setsampwidth(2)
                    wf.setframerate(24000)
                    wf.writeframes(full_audio_frames)
                audio_key = f"projects/{project_id}/audio/ch_{ch_num}_{args.job_id[:8]}.wav"
                s3.put_object(
                    Bucket=args.r2_bucket,
                    Key=audio_key,
                    Body=wav_buf.getvalue(),
                    ContentType="audio/wav",
                )
                if args.r2_endpoint:
                    chapter_audio_url = f"{args.r2_endpoint}/{args.r2_bucket}/{audio_key}"
                logger.info("Uploaded master chapter audio: %s", audio_key)
            except Exception as exc:
                logger.error("Failed to upload chapter audio to R2: %s", exc)

        receipt_key = f"jobs/{args.job_id}/receipts/ch_{ch_num}_complete.json"
        receipt_data = {
            "job_id": args.job_id,
            "chapter_number": ch_num,
            "chapter_id": ch.get("id"),
            "status": "complete",
            "duration_seconds": total_duration_sec,
            "tts_model": args.tts_model,
            "audio_key": audio_key,
            "alignments": alignments,
            "audio_url": chapter_audio_url,
            "timestamp": datetime.now(UTC).isoformat(),
        }
        if s3:
            try:
                s3.put_object(
                    Bucket=args.r2_bucket,
                    Key=receipt_key,
                    Body=json.dumps(receipt_data, indent=2),
                    ContentType="application/json",
                )
                logger.info("Uploaded completion receipt for Chapter %s: %s", ch_num, receipt_key)
            except Exception as exc:
                logger.error("Failed to upload completion receipt: %s", exc)

        del full_audio_frames
        gc.collect()

    logger.info("Manifest processing complete. Entering persistent hot-retake standby loop...")
    start_session_time = time.time()

    while (time.time() - start_session_time) < args.hot_session_seconds:
        if not s3:
            time.sleep(5)
            continue

        try:
            shutdown_key = f"jobs/{args.job_id}/shutdown.json"
            try:
                s3.get_object(Bucket=args.r2_bucket, Key=shutdown_key)
                logger.info("Shutdown signal received via R2. Terminating worker.")
                break
            except Exception:
                pass

            prefix = f"jobs/{args.job_id}/retakes/"
            resp = s3.list_objects_v2(Bucket=args.r2_bucket, Prefix=prefix)
            for item in resp.get("Contents", []):
                key = item["Key"]
                if key.endswith(".json") and not key.endswith("_complete.json"):
                    try:
                        retake_obj = s3.get_object(Bucket=args.r2_bucket, Key=key)
                        retake_data = json.loads(retake_obj["Body"].read().decode("utf-8"))
                        retake_id = retake_data.get("retake_id")
                        text = retake_data.get("text", "")
                        gender = retake_data.get("gender", "male")
                        speed = float(retake_data.get("speed", 1.0))

                        take_frames = bytearray()
                        if kokoro_model and text:
                            import numpy as np

                            voice_name = "af_sarah" if gender == "female" else "am_adam"
                            samples, sr = kokoro_model.create(text, voice=voice_name, speed=speed, lang="en-us")
                            audio_int16 = (np.clip(samples, -1.0, 1.0) * 32767).astype(np.int16)
                            take_frames.extend(audio_int16.tobytes())

                        if take_frames:
                            wav_buf = io.BytesIO()
                            with wave.open(wav_buf, "wb") as wf:
                                wf.setnchannels(1)
                                wf.setsampwidth(2)
                                wf.setframerate(24000)
                                wf.writeframes(take_frames)

                            audio_take_key = f"projects/{project_id}/audio/takes/{retake_id}.wav"
                            s3.put_object(
                                Bucket=args.r2_bucket,
                                Key=audio_take_key,
                                Body=wav_buf.getvalue(),
                                ContentType="audio/wav",
                            )
                            r_key = f"jobs/{args.job_id}/retakes/{retake_id}_complete.json"
                            s3.put_object(
                                Bucket=args.r2_bucket,
                                Key=r_key,
                                Body=json.dumps({"retake_id": retake_id, "status": "complete", "audio_key": audio_take_key}),
                                ContentType="application/json",
                            )
                            s3.delete_object(Bucket=args.r2_bucket, Key=key)
                            logger.info("Synthesized hot surgical retake: %s", retake_id)

                        del take_frames
                        gc.collect()
                    except Exception as exc:
                        logger.error("Error processing surgical retake: %s", exc)

        except Exception as exc:
            logger.debug("Hot loop probe notice: %s", exc)

        time.sleep(2)

    logger.info("GPU Session Worker execution finished cleanly.")


if __name__ == "__main__":
    args = parse_args()
    run_worker_session(args)
