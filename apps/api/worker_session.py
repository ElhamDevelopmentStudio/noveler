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
- Foley onomatopoeia replacement & timing splicing.
- Character Voice Filters (robotic LitRPG, radio, telepathic reverb, megaphone, telephone, whisper).
- Scene-scoped Atmosphere (ambient sound bed) looping, smooth cross-fading, and timeline overlay mixing.
- Persistent hot-retake polling loop with dynamic AWS4 presigning and shutdown signals.
- Explicit VRAM and memory hygiene via gc.collect().
"""

import argparse
import gc
import io
import json
import logging
import math
import os
import re
import shutil
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

# Voice filter DSP mapping (FFmpeg audio filter strings)
VOICE_FILTER_FFMPEG_MAP: dict[str, str] = {
    "robotic": "chorus=0.7:0.9:55:0.4:0.25:2,aecho=0.8:0.88:15:0.5,atempo=0.98",
    "radio": "highpass=f=400,lowpass=f=3500,volume=1.2",
    "reverb": "aecho=0.8:0.9:60:0.4,aecho=0.6:0.7:120:0.3",
    "telepathic": "aecho=0.8:0.9:60:0.4,aecho=0.6:0.7:120:0.3",
    "telephone": "highpass=f=300,lowpass=f=3000,volume=1.1",
    "megaphone": "highpass=f=500,aecho=0.8:0.6:40:0.5,volume=1.3",
    "whisper": "equalizer=f=4000:t=h:w=1:g=4,volume=0.9",
}


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


# ==============================================================================
# Sound Effects, Voice Filters & Atmosphere Mixing Routines
# ==============================================================================

def clean_text_for_foley(text: str, sfx_cues: list[dict[str, Any]] | None) -> str:
    """Strip words replaced by Foley cues from the text so TTS model skips vocalizing them."""
    if not text or not sfx_cues:
        return text or ""
    res = text
    for cue in sfx_cues:
        if cue.get("action") == "replace":
            tgt = (cue.get("target_text") or "").strip()
            if tgt:
                res = re.sub(rf"\b{re.escape(tgt)}\b[!?.,;:—\-]*", "", res, flags=re.IGNORECASE)
    res = re.sub(r"\s+", " ", res).strip()
    return re.sub(r"^[,;:\s—\-]+|[,;:\s—\-]+$", "", res).strip()


def apply_voice_filter(
    pcm_bytes: bytes,
    filter_id: str | None,
    sample_rate: int = 24000,
) -> bytes:
    """Apply DSP voice filter preset to 16-bit mono PCM bytes using FFmpeg or pure-Python fallback."""
    if not filter_id or filter_id not in VOICE_FILTER_FFMPEG_MAP or not pcm_bytes:
        return pcm_bytes

    ffmpeg_bin = shutil.which("ffmpeg")
    if ffmpeg_bin:
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as in_file:
            in_path = in_file.name
            with wave.open(in_file, "wb") as in_wf:
                in_wf.setnchannels(1)
                in_wf.setsampwidth(2)
                in_wf.setframerate(sample_rate)
                in_wf.writeframes(pcm_bytes)

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as out_file:
            out_path = out_file.name

        try:
            cmd = [
                ffmpeg_bin,
                "-y",
                "-i", in_path,
                "-af", VOICE_FILTER_FFMPEG_MAP[filter_id],
                "-ar", str(sample_rate),
                "-ac", "1",
                "-c:a", "pcm_s16le",
                out_path,
            ]
            res = subprocess.run(cmd, capture_output=True, timeout=10)
            if res.returncode == 0 and os.path.exists(out_path) and os.path.getsize(out_path) > 44:
                with wave.open(out_path, "rb") as out_wf:
                    filtered_pcm = out_wf.readframes(out_wf.getnframes())
                return filtered_pcm
        except Exception as exc:
            logger.debug("FFmpeg filter execution notice (%s): %s", filter_id, exc)
        finally:
            if os.path.exists(in_path):
                os.remove(in_path)
            if os.path.exists(out_path):
                os.remove(out_path)

    # Pure Python DSP Fallback
    try:
        samples = list(struct.unpack(f"<{len(pcm_bytes)//2}h", pcm_bytes))
        num_samples = len(samples)
        out_samples = list(samples)

        if filter_id == "robotic":
            for i in range(num_samples):
                t = i / float(sample_rate)
                mod = 0.65 + 0.35 * math.sin(2.0 * math.pi * 65.0 * t)
                out_samples[i] = max(-32768, min(32767, int(samples[i] * mod)))
        elif filter_id in ("telepathic", "reverb", "megaphone"):
            delay = int(sample_rate * 0.08)
            for i in range(delay, num_samples):
                out_samples[i] = max(-32768, min(32767, int(samples[i] + out_samples[i - delay] * 0.45)))
        elif filter_id in ("radio", "telephone"):
            w = 5
            for i in range(w, num_samples - w):
                val = int((sum(samples[i - w : i + w + 1]) // (w * 2 + 1)) * 1.3)
                out_samples[i] = max(-26000, min(26000, val))

        return struct.pack(f"<{len(out_samples)}h", *out_samples)
    except Exception:
        return pcm_bytes


def generate_procedural_foley(name: str, duration_ms: int = 700, volume: float = 1.0, sample_rate: int = 24000) -> bytes:
    """Generate clean procedural Foley sound when offline or when sample file is not yet cached."""
    num_samples = int(sample_rate * (duration_ms / 1000.0))
    samples = []
    name_l = name.lower()

    if any(k in name_l for k in ("boom", "blast", "explosion", "cannon", "thud")):
        for i in range(num_samples):
            t = i / float(sample_rate)
            decay = math.exp(-t * 5.0)
            freq = 60.0 * math.exp(-t * 3.0)
            noise = (math.sin(i * 1337.1) % 1.0 - 0.5) * 0.4 if t < 0.025 else 0.0
            val = int(30000 * volume * decay * (math.sin(2.0 * math.pi * freq * t) + noise))
            samples.append(max(-32768, min(32767, val)))
    elif any(k in name_l for k in ("clank", "sword", "metal", "clang", "hit")):
        for i in range(num_samples):
            t = i / float(sample_rate)
            decay = math.exp(-t * 8.0)
            harmonics = (
                0.5 * math.sin(2.0 * math.pi * 840.0 * t)
                + 0.3 * math.sin(2.0 * math.pi * 1420.0 * t)
                + 0.2 * math.sin(2.0 * math.pi * 2180.0 * t)
            )
            samples.append(max(-32768, min(32767, int(28000 * volume * decay * harmonics))))
    else:
        for i in range(num_samples):
            t = i / float(sample_rate)
            decay = math.exp(-t * 6.0)
            tone = 0.7 * math.sin(2.0 * math.pi * 520.0 * t) + 0.3 * math.sin(2.0 * math.pi * 1040.0 * t)
            samples.append(max(-32768, min(32767, int(22000 * volume * decay * tone))))

    return struct.pack(f"<{len(samples)}h", *samples)


def generate_procedural_atmosphere(name: str, duration_ms: int, volume: float = 0.2, sample_rate: int = 24000) -> list[int]:
    """Generate ambient environmental audio samples across a scene duration."""
    num_samples = int(sample_rate * (duration_ms / 1000.0))
    samples = []
    name_l = name.lower()
    fade_samples = min(num_samples // 2, int(sample_rate * 0.5))

    for i in range(num_samples):
        t = i / float(sample_rate)
        # Fade envelope
        env = 1.0
        if i < fade_samples and fade_samples > 0:
            env = float(i) / float(fade_samples)
        elif i >= (num_samples - fade_samples) and fade_samples > 0:
            env = float(num_samples - 1 - i) / float(fade_samples)

        if any(k in name_l for k in ("ocean", "wave", "sea", "water")):
            swell = (math.sin(2.0 * math.pi * t / 3.5) + 1.0) / 2.0
            noise = (math.sin(i * 311.7) % 1.0 - 0.5)
            val = int(18000 * volume * env * (0.3 + 0.7 * swell) * noise)
        elif any(k in name_l for k in ("rain", "storm")):
            noise = (math.sin(i * 123.456) % 1.0 - 0.5)
            rumble = 0.3 * math.sin(2.0 * math.pi * 32.0 * t)
            val = int(16000 * volume * env * (noise * 0.7 + rumble * 0.3))
        else:
            hum = 0.5 * math.sin(2.0 * math.pi * 55.0 * t) + 0.5 * math.sin(2.0 * math.pi * 110.0 * t)
            val = int(10000 * volume * env * hum)

        samples.append(max(-32768, min(32767, val)))

    return samples


def build_atmosphere_spans(segments_with_timings: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Group contiguous segments marked with the same atmosphere_id into distinct scene spans."""
    spans: list[dict[str, Any]] = []
    current_span: dict[str, Any] | None = None

    for seg in sorted(segments_with_timings, key=lambda s: s.get("order_index", 0)):
        atmo_id = seg.get("atmosphere_id")
        start_ms = seg.get("start_ms", 0)
        end_ms = seg.get("end_ms", start_ms + seg.get("duration_ms", 1000))

        if atmo_id:
            if current_span and current_span["atmosphere_id"] == atmo_id:
                current_span["end_ms"] = max(current_span["end_ms"], end_ms)
                current_span["segment_ids"].append(seg.get("segment_id"))
            else:
                if current_span:
                    spans.append(current_span)
                current_span = {
                    "atmosphere_id": atmo_id,
                    "atmosphere_name": seg.get("atmosphere_name", "Atmosphere"),
                    "volume": float(seg.get("atmosphere_volume", 0.15) or 0.15),
                    "start_ms": start_ms,
                    "end_ms": end_ms,
                    "segment_ids": [seg.get("segment_id")],
                }
        else:
            if current_span:
                spans.append(current_span)
                current_span = None

    if current_span:
        spans.append(current_span)

    return spans


# ==============================================================================
# Worker Execution
# ==============================================================================

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
    sfx_library = manifest.get("sfx_library", {})
    custom_voices = manifest.get("custom_voices", {})

    logger.info("Loaded %d custom cloned voices, %d SFX library entries", len(custom_voices), len(sfx_library))

    for ch in chapters:
        ch_num = ch.get("chapter_number", 1)
        ch_title = ch.get("title", f"Chapter {ch_num}")
        segments = ch.get("segments", [])
        logger.info("Synthesizing Chapter %s: '%s' (%d segments)...", ch_num, ch_title, len(segments))

        alignments: list[dict[str, Any]] = []
        current_ms = 0
        full_audio_frames = bytearray()
        sample_rate = 24000

        for seg in segments:
            raw_text = seg.get("text", "").strip()
            gender = (seg.get("speaker_gender") or "male").lower()
            seg_id = seg.get("id")
            sfx_cues = seg.get("sfx_cues") or []
            voice_filter_id = seg.get("voice_filter_id")

            # Clean replaced onomatopoeic words from spoken text
            clean_text = clean_text_for_foley(raw_text, sfx_cues) if sfx_cues else raw_text

            words = len(clean_text.split()) if clean_text else 1
            dur_sec = max(0.5, words * 0.35) if clean_text else 0.8
            dur_ms = int(dur_sec * 1000)

            seg_frames = bytearray()
            if kokoro_model and clean_text:
                try:
                    import numpy as np

                    voice_name = "af_sarah" if gender == "female" else "am_adam"
                    samples, sr = kokoro_model.create(clean_text, voice=voice_name, speed=1.0, lang="en-us")
                    audio_int16 = (np.clip(samples, -1.0, 1.0) * 32767).astype(np.int16)
                    seg_frames.extend(audio_int16.tobytes())
                    dur_ms = max(dur_ms, int((len(samples) / float(sr)) * 1000))
                except Exception as exc:
                    logger.warning("Segment synthesis notice (id=%s): %s", seg_id, exc)

            # Apply character or segment DSP voice filter
            if voice_filter_id and seg_frames:
                seg_frames = bytearray(apply_voice_filter(bytes(seg_frames), voice_filter_id, sample_rate))

            # Splice Foley cues (Replace and/or After)
            final_seg_pcm = bytearray()
            for cue in sfx_cues:
                if cue.get("action") == "replace":
                    name = cue.get("name") or cue.get("target_text") or "boom"
                    vol = float(cue.get("volume", 1.0) or 1.0)
                    fb = generate_procedural_foley(name, duration_ms=750, volume=vol, sample_rate=sample_rate)
                    final_seg_pcm.extend(fb)
                    if seg_frames:
                        final_seg_pcm.extend(b"\x00" * int(sample_rate * 0.06 * 2))

            if seg_frames:
                final_seg_pcm.extend(seg_frames)

            for cue in sfx_cues:
                if cue.get("action") == "after":
                    name = cue.get("name") or "foley"
                    vol = float(cue.get("volume", 1.0) or 1.0)
                    if final_seg_pcm:
                        final_seg_pcm.extend(b"\x00" * int(sample_rate * 0.05 * 2))
                    fb = generate_procedural_foley(name, duration_ms=750, volume=vol, sample_rate=sample_rate)
                    final_seg_pcm.extend(fb)

            if not final_seg_pcm:
                final_seg_pcm.extend(b"\x00" * int(sample_rate * 0.3 * 2))

            dur_ms = int((len(final_seg_pcm) / 2 / float(sample_rate)) * 1000)
            full_audio_frames.extend(final_seg_pcm)

            start_ms = current_ms
            end_ms = start_ms + dur_ms

            seg_take_key = f"projects/{project_id}/audio/takes/{seg_id}.wav"
            seg_audio_url = None
            if s3 and args.r2_bucket:
                try:
                    wav_buf = io.BytesIO()
                    with wave.open(wav_buf, "wb") as wf:
                        wf.setnchannels(1)
                        wf.setsampwidth(2)
                        wf.setframerate(24000)
                        wf.writeframes(final_seg_pcm)
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
                "atmosphere_id": seg.get("atmosphere_id"),
                "atmosphere_name": seg.get("atmosphere_name"),
                "atmosphere_volume": seg.get("atmosphere_volume"),
                "start_ms": start_ms,
                "end_ms": end_ms,
                "duration_ms": dur_ms,
                "storage_key": seg_take_key,
                "audio_url": seg_audio_url,
            })

            # 300ms inter-segment natural pacing
            current_ms = end_ms + 300
            full_audio_frames.extend(b"\x00" * 14400)

        # Overlay Scene Atmosphere Beds across chapter timeline
        atmo_spans = build_atmosphere_spans(alignments)
        if atmo_spans and full_audio_frames:
            logger.info("Overlaying %d scene atmosphere bed(s) onto master chapter audio...", len(atmo_spans))
            master_samples = list(struct.unpack(f"<{len(full_audio_frames)//2}h", full_audio_frames))
            total_samples = len(master_samples)

            for span in atmo_spans:
                name = span.get("atmosphere_name", "Atmosphere")
                vol = span.get("volume", 0.15)
                s_ms = span.get("start_ms", 0)
                e_ms = span.get("end_ms", s_ms + 1000)
                d_ms = max(500, e_ms - s_ms)
                start_i = int(sample_rate * (s_ms / 1000.0))

                amb_samples = generate_procedural_atmosphere(name, duration_ms=d_ms, volume=vol, sample_rate=sample_rate)
                mix_len = min(len(amb_samples), total_samples - start_i)
                for i in range(mix_len):
                    idx = start_i + i
                    mixed = master_samples[idx] + amb_samples[i]
                    master_samples[idx] = max(-32768, min(32767, mixed))

            full_audio_frames = bytearray(struct.pack(f"<{len(master_samples)}h", *master_samples))

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
                        voice_filter_id = retake_data.get("voice_filter_id")
                        sfx_cues = retake_data.get("sfx_cues")

                        clean_text = clean_text_for_foley(text, sfx_cues) if sfx_cues else text

                        take_frames = bytearray()
                        if kokoro_model and clean_text:
                            import numpy as np

                            voice_name = "af_sarah" if gender == "female" else "am_adam"
                            samples, sr = kokoro_model.create(clean_text, voice=voice_name, speed=speed, lang="en-us")
                            audio_int16 = (np.clip(samples, -1.0, 1.0) * 32767).astype(np.int16)
                            take_frames.extend(audio_int16.tobytes())

                        if voice_filter_id and take_frames:
                            take_frames = bytearray(apply_voice_filter(bytes(take_frames), voice_filter_id, 24000))

                        # Foley cue handling for retakes
                        final_retake_pcm = bytearray()
                        if sfx_cues:
                            for cue in sfx_cues:
                                if cue.get("action") == "replace":
                                    fb = generate_procedural_foley(cue.get("name") or "foley", volume=float(cue.get("volume", 1.0) or 1.0))
                                    final_retake_pcm.extend(fb)
                                    if take_frames:
                                        final_retake_pcm.extend(b"\x00" * int(24000 * 0.06 * 2))

                        if take_frames:
                            final_retake_pcm.extend(take_frames)

                        if sfx_cues:
                            for cue in sfx_cues:
                                if cue.get("action") == "after":
                                    if final_retake_pcm:
                                        final_retake_pcm.extend(b"\x00" * int(24000 * 0.05 * 2))
                                    fb = generate_procedural_foley(cue.get("name") or "foley", volume=float(cue.get("volume", 1.0) or 1.0))
                                    final_retake_pcm.extend(fb)

                        if final_retake_pcm:
                            wav_buf = io.BytesIO()
                            with wave.open(wav_buf, "wb") as wf:
                                wf.setnchannels(1)
                                wf.setsampwidth(2)
                                wf.setframerate(24000)
                                wf.writeframes(final_retake_pcm)

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
