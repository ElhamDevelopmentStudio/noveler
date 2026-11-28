import asyncio
import io
import json
import os
import re
import shutil
import subprocess
import tempfile
import time
import uuid
import wave
from datetime import UTC, datetime
from typing import Any

from app.core.config import settings
from app.core.security import decrypt_secret
from app.models.chapter import ChapterModel
from app.models.kaggle_account import KaggleAccountModel
from app.models.project import ProjectModel
from app.models.user import UserModel
from app.core.storage import get_cached_presigned_url, get_s3_client
from app.services.attachment import AttachmentService
from novelova_core.exceptions import AppError, NotFoundError
from novelova_core.logging import setup_logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

logger = setup_logger("novelova.kaggle_worker")

# Pre-TTS sanitizer constants for IndexTTS 2.5 (English-only)
_INDEXTTS_PARALINGUISTIC_TAG_RE = re.compile(
    r"\[(?:laugh|sigh|gasp|groan|chuckle|cough|sniff|shush|clear\s+throat)\]",
    re.IGNORECASE,
)
_INDEXTTS_CMU_TOKEN_RE = re.compile(r"<[^|>\n]+\|[^>\n]+>")
_STUTTER_SYLLABLE_MAP: dict[str, str] = {
    "b": "buh",
    "c": "cuh",
    "d": "duh",
    "f": "fuh",
    "g": "guh",
    "h": "huh",
    "j": "juh",
    "k": "kuh",
    "l": "luh",
    "m": "muh",
    "n": "nuh",
    "p": "puh",
    "q": "kuh",
    "r": "ruh",
    "s": "sss",
    "t": "tuh",
    "v": "vuh",
    "w": "wuh",
    "y": "yuh",
    "z": "zuh",
}
_ISOLATED_STUTTER_RE = re.compile(
    r"(?<![A-Za-z0-9<|])([B-DF-HJ-NP-TV-Zb-df-hj-np-tv-z])(\.{2,3}|—|–|-)(\s*)([A-Za-z]{2,})"
)


import inflect

_inflect_engine = inflect.engine()


def int_to_english(n: int | str) -> str:
    """Convert an integer, decimal, or ordinal (e.g. 670, '21st', '10,000') to spoken English via inflect."""
    raw = str(n).strip().replace(",", "")
    if not raw:
        return ""
    if re.fullmatch(r"\d+(?:st|nd|rd|th)", raw, flags=re.IGNORECASE):
        return _inflect_engine.number_to_words(raw.lower())
    if "." in raw and re.fullmatch(r"-?\d+\.\d+", raw):
        return _inflect_engine.number_to_words(raw)
    return _inflect_engine.number_to_words(int(raw))


_SPOKEN_NUM_RE = re.compile(
    r"(?<![A-Za-z0-9<|_])(\d{1,3}(?:,\d{3})+|\d+(?:st|nd|rd|th)|\d+\.\d+|\d{1,9})(?![A-Za-z0-9>|_])",
    re.IGNORECASE,
)


def sanitize_text_for_indextts25(text: str) -> str:
    """
    Prepare English audiobook text for IndexTTS 2.5 with text_normalization=False:
    1. Protect <word|CMU_PHONEMES> pronunciation annotations from edits.
    2. Strip legacy Chatterbox bracketed paralinguistic tags ([sigh], [laugh], etc.).
    3. Expand isolated single-letter stutter consonants (e.g. 'H... how' -> 'Huh... how',
       'W-what' -> 'Wuh-what') so the engine never spells out alphabet letter names ('Aitch'),
       while leaving valid single-letter words ('I', 'A', 'O') untouched.
    4. Convert numbers, ordinals, and decimals via inflect so IndexTTS 2.5
       never garbles raw digits when text_normalization=False.
    """
    if not text:
        return ""

    protected: dict[str, str] = {}

    def _protect(m: re.Match[str]) -> str:
        key = f"__CMU_{len(protected)}__"
        protected[key] = m.group(0)
        return key

    cleaned = _INDEXTTS_CMU_TOKEN_RE.sub(_protect, text)
    cleaned = _INDEXTTS_PARALINGUISTIC_TAG_RE.sub(" ", cleaned)
    # Strip raw LitRPG angle brackets (<...>) after CMU pronunciation tokens are protected
    # so TTS engines never see stray angle brackets and numbers adjacent to < or > convert cleanly.
    cleaned = cleaned.replace("<", "").replace(">", "")
    # Convert LitRPG stat fractions (e.g. "10/10", "0/100") and stat bonuses ("+3") to natural English
    cleaned = re.sub(
        r"(?<![A-Za-z0-9/])(\d{1,9})\s*/\s*(\d{1,9})(?![A-Za-z0-9/])",
        lambda m: (
            m.group(0)
            if (m.group(1) == "24" and m.group(2) == "7")
            else f"{int_to_english(m.group(1))} out of {int_to_english(m.group(2))}"
        ),
        cleaned,
    )
    cleaned = re.sub(
        r"(?<![A-Za-z0-9])\+(\d{1,9})(?![A-Za-z0-9])",
        lambda m: f"plus {int_to_english(m.group(1))}",
        cleaned,
    )

    def _expand_stutter(m: re.Match[str]) -> str:
        letter, sep, space, nxt = m.group(1), m.group(2), m.group(3), m.group(4)
        syll = _STUTTER_SYLLABLE_MAP.get(letter.lower())
        if not syll:
            return m.group(0)
        if letter.isupper():
            syll = syll.capitalize()
        return f"{syll}{sep}{space}{nxt}"

    cleaned = _ISOLATED_STUTTER_RE.sub(_expand_stutter, cleaned)
    cleaned = _SPOKEN_NUM_RE.sub(lambda m: int_to_english(m.group(1)), cleaned)
    cleaned = re.sub(r"[ \t]{2,}", " ", cleaned).strip()

    for key, val in protected.items():
        cleaned = cleaned.replace(key, val)
    return cleaned


def build_segment_take_cache_hash(
    *,
    text: str,
    tts_model: str,
    voice_id: str | None,
    voice_ref_version: str | None,
    speaker_gender: str,
    emotion: str | None,
    emotion_profile: dict[str, Any] | None,
    voice_filter_id: str | None,
    sfx_cues: list[dict[str, Any]] | None,
) -> str:
    """Compute a deterministic 24-char SHA-256 take cache key covering model, voice ref, and emotion."""
    import hashlib

    normalized_profile = None
    if isinstance(emotion_profile, dict):
        raw_vec = emotion_profile.get("vector")
        vec = [round(float(v), 2) for v in raw_vec[:8]] if isinstance(raw_vec, list) else None
        normalized_profile = {
            "vector": vec,
            "emo_alpha": round(float(emotion_profile.get("emo_alpha", 0.55)), 2),
            "duration_factor": round(float(emotion_profile.get("duration_factor", 1.0)), 2),
            "narrator_speed": round(float(emotion_profile.get("narrator_speed", 1.0)), 2),
        }

    hash_payload = json.dumps(
        {
            "text": text,
            "tts_model": tts_model,
            "voice_id": voice_id,
            "voice_ref_version": voice_ref_version,
            "speaker_gender": speaker_gender or "male",
            "emotion": emotion,
            "emotion_profile": normalized_profile,
            "voice_filter_id": voice_filter_id,
            "sfx_cues": sfx_cues or [],
        },
        sort_keys=True,
    )
    return hashlib.sha256(hash_payload.encode("utf-8")).hexdigest()[:24]


def presign_r2_url_or_key(url_or_key: str | None, expires_in: int = 86400) -> str | None:
    """Ensure an R2 object key or raw S3 URL is converted to an authenticated presigned GET URL with fast in-memory caching."""
    return get_cached_presigned_url(url_or_key, expires_in)


def build_kaggle_worker_script(
    job_id: str,
    project_id: str,
    tts_model: str,
    r2_endpoint: str | None,
    r2_bucket: str | None,
    r2_access_key: str | None,
    r2_secret_key: str | None,
    cache_to_dataset: bool = True,
) -> str:
    """Generate self-contained Python script to execute on Kaggle GPU worker."""
    return f'''# Noveler Kaggle GPU Session Worker
# Job ID: {job_id}
# Target TTS Engine: {tts_model}
# Auto-generated by Novelova API

import os
import sys
import time
import json
import wave
import io
import math
import struct
import tempfile
import subprocess
import shutil
import re
import urllib.request
from datetime import datetime, timezone

print("=====================================================")
print("🎧 Noveler Kaggle Session Worker Starting...")
print("Job ID: {job_id}")
print("TTS Model Engine: {tts_model}")
print("Cache Mode: {'Dataset Pre-mounted (<1s startup)' if cache_to_dataset else 'Ephemeral Single-Run (Dynamic download)'}")
print("=====================================================")

# 0. Zero-Latency Import Setup from Pre-Mounted Dataset
cache_to_dataset = {str(cache_to_dataset)}
wheel_dirs = [
    "/kaggle/input/noveler-models/wheels",
    "/kaggle/input/novelova-runtime-core/wheels",
    "/kaggle/input/noveler-models",
    "/kaggle/input/novelova-runtime-core",
]
found_wheels = next((d for d in wheel_dirs if os.path.isdir(d)), None)

# 1. Install & verify cloud audio libraries with zero-latency offline priority
try:
    import boto3
    import soundfile
    from kokoro_onnx import Kokoro
except ImportError:
    if found_wheels:
        print("Installing pre-mounted offline wheels from:", found_wheels)
        subprocess.run(
            [sys.executable, "-m", "pip", "install", "-q", "--no-index", f"--find-links={{found_wheels}}", "boto3", "soundfile", "kokoro-onnx"],
            check=False,
        )
    else:
        print("Installing cloud audio runtime packages...")
        subprocess.run(
            [sys.executable, "-m", "pip", "install", "-q", "--retries", "2", "--timeout", "15", "boto3", "soundfile", "kokoro-onnx"],
            check=False,
        )
    import boto3

# 2. Configure S3/R2 client
R2_ENDPOINT = "{r2_endpoint or ''}"
R2_BUCKET = "{r2_bucket or 'novelova'}"
R2_ACCESS_KEY = "{r2_access_key or ''}"
R2_SECRET_KEY = "{r2_secret_key or ''}"

s3 = None
if R2_ENDPOINT and R2_ACCESS_KEY and R2_SECRET_KEY:
    try:
        s3 = boto3.client(
            "s3",
            endpoint_url=R2_ENDPOINT,
            aws_access_key_id=R2_ACCESS_KEY,
            aws_secret_access_key=R2_SECRET_KEY,
            region_name="auto",
        )
        print("Connected to Cloudflare R2 bucket:", R2_BUCKET)
    except Exception as exc:
        print("Warning: Failed to connect to R2:", exc)

# 3. Model Engine Warmup ({tts_model})
print("Loading model weights into GPU VRAM: {tts_model}...")
kokoro_model = None
chatterbox_model = None
indextts_model = None
whisper_qc_model = None
dev = "cpu"

def _stream_copy_fuse_to_local(src_dir, dst_dir):
    os.makedirs(dst_dir, exist_ok=True)
    t_start = time.time()
    total_bytes = 0
    for root, dirs, files in os.walk(src_dir):
        if "wheels" in root or ".cache" in root or ".git" in root:
            continue
        rel_dir = os.path.relpath(root, src_dir)
        target_dir = dst_dir if rel_dir == "." else os.path.join(dst_dir, rel_dir)
        os.makedirs(target_dir, exist_ok=True)
        for f_name in files:
            if f_name.endswith(".whl") or f_name.endswith(".lock") or f_name.startswith("."):
                continue
            s_path = os.path.join(root, f_name)
            d_path = os.path.join(target_dir, f_name)
            try:
                s_size = os.path.getsize(s_path)
            except OSError:
                continue
            if not os.path.exists(d_path) or os.path.getsize(d_path) != s_size:
                with open(s_path, "rb", buffering=64 * 1024 * 1024) as f_in:
                    with open(d_path, "wb") as f_out:
                        shutil.copyfileobj(f_in, f_out, length=64 * 1024 * 1024)
                total_bytes += s_size
    elapsed = max(0.01, time.time() - t_start)
    mb = total_bytes / (1024 * 1024)
    print(f"Streamed {{mb:.1f}} MB from FUSE mount to local NVMe ({{dst_dir}}) in {{elapsed:.2f}}s ({{mb/elapsed:.1f}} MB/s)")
    return dst_dir

def _stream_copy_file_to_local(src_file, dst_file):
    if not os.path.exists(src_file):
        return src_file
    os.makedirs(os.path.dirname(dst_file), exist_ok=True)
    try:
        s_size = os.path.getsize(src_file)
    except OSError:
        return src_file
    if not os.path.exists(dst_file) or os.path.getsize(dst_file) != s_size:
        t_start = time.time()
        with open(src_file, "rb", buffering=64 * 1024 * 1024) as f_in:
            with open(dst_file, "wb") as f_out:
                shutil.copyfileobj(f_in, f_out, length=64 * 1024 * 1024)
        elapsed = max(0.01, time.time() - t_start)
        mb = s_size / (1024 * 1024)
        print(f"Streamed {{mb:.1f}} MB to local NVMe ({{dst_file}}) in {{elapsed:.2f}}s ({{mb/elapsed:.1f}} MB/s)")
    return dst_file

if "{tts_model}" in ("chatterbox-turbo", "chatterbox"):
    print("Initializing Chatterbox-Turbo voice cloning engine...")
    cb_wheels_dir = None
    if os.path.exists("/kaggle/input"):
        for root, dirs, files in os.walk("/kaggle/input"):
            if any(f.startswith("chatterbox_tts") and f.endswith(".whl") for f in files):
                cb_wheels_dir = root
                break

    if cb_wheels_dir:
        print("Found pre-mounted Chatterbox wheels directory:", cb_wheels_dir)
        subprocess.run([
            sys.executable, "-m", "pip", "install", "-q",
            "--no-index", f"--find-links={{cb_wheels_dir}}",
            "--no-deps",
            "chatterbox-tts", "pyloudnorm", "s3tokenizer", "conformer", "resemble-perth", "diffusers",
        ], check=False)
    else:
        print("Notice: No pre-mounted chatterbox wheels found in dataset; attempting clean fast pip install...")
        subprocess.run([
            sys.executable, "-m", "pip", "install", "-q", "--timeout", "30",
            "chatterbox-tts", "soundfile", "pyloudnorm",
        ], check=False)

    try:
        from chatterbox.tts_turbo import ChatterboxTurboTTS
        import torch
        dev = "cuda" if torch.cuda.is_available() else "cpu"

        # Check pre-mounted dataset path for local NVMe load
        candidate_cb_model_paths = [
            "/kaggle/input/novelova-chatterbox",
            "/kaggle/input/noveler-models/chatterbox",
            "/kaggle/working/novelova-chatterbox",
        ]
        if os.path.exists("/kaggle/input"):
            for root, dirs, files in os.walk("/kaggle/input"):
                if "t3_turbo_v1.safetensors" in files:
                    candidate_cb_model_paths.insert(0, root)

        cb_local_path = next((p for p in candidate_cb_model_paths if os.path.exists(os.path.join(p, "t3_turbo_v1.safetensors"))), None)
        if cb_local_path and hasattr(ChatterboxTurboTTS, "from_local"):
            if cb_local_path.startswith("/kaggle/input"):
                print("Bypassing FUSE latency: streaming Chatterbox weights from dataset mount to local NVMe (/tmp)...")
                cb_local_path = _stream_copy_fuse_to_local(cb_local_path, "/tmp/novelova-chatterbox")
            print("Loading Chatterbox-Turbo weights instantly from local path:", cb_local_path)
            t_load = time.time()
            chatterbox_model = ChatterboxTurboTTS.from_local(cb_local_path, device=dev)
            print(f"Chatterbox-Turbo model resident in VRAM in {{time.time() - t_load:.2f}}s on {{dev}}")
        else:
            print("Loading Chatterbox-Turbo from pretrained...")
            chatterbox_model = ChatterboxTurboTTS.from_pretrained(device=dev)
        # Normalization buffers for float32 compatibility
        try:
            tokenizer = chatterbox_model.s3gen.tokenizer
            for bname in ("_mel_filters", "window"):
                buf = getattr(tokenizer, bname, None)
                if buf is not None:
                    setattr(tokenizer, bname, buf.float())
            orig_norm = chatterbox_model.norm_loudness
            def _norm_loudness(wav, sr, target_lufs=-27):
                return orig_norm(wav, sr, target_lufs).astype("float32", copy=False)
            chatterbox_model.norm_loudness = _norm_loudness
        except Exception as norm_exc:
            print("Buffer normalization notice:", norm_exc)
        print("Chatterbox-Turbo voice cloning resident in VRAM on", dev)
        whisper_qc_model = None
        if dev == "cuda":
            try:
                import whisper
            except ImportError:
                print("Installing Whisper ASR for in-worker quality defense...")
                subprocess.run([sys.executable, "-m", "pip", "install", "-q", "openai-whisper"], check=False)
                import whisper
            try:
                print("Loading Whisper tiny.en for in-worker hallucination & repetition defense...")
                t_wh_init = time.time()
                whisper_qc_model = whisper.load_model("tiny.en", device="cuda")
                print(f"Whisper tiny.en loaded in {{time.time() - t_wh_init:.2f}}s on cuda")
            except Exception as wh_exc:
                print("Whisper QC init notice (will proceed with unverified takes):", wh_exc)
    except Exception as e:
        print("Chatterbox-Turbo load error:", e)
        raise RuntimeError(f"FATAL: Chatterbox-Turbo model failed to initialize on worker: {{e}}")

# Neural Engine: Kokoro-82M (Only load when Kokoro is the selected engine — saves 15-60s GPU time & ~1GB VRAM on Chatterbox runs)
if "{tts_model}" == "indextts-2.5":
    print("Initializing IndexTTS 2.5 Studio voice cloning engine (T4 FP16 GPT+S2Mel, FP32 BigVGAN)...")
    os.environ["USE_TF"] = "0"
    os.environ["USE_FLAX"] = "0"
    os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"
    os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
    import types
    try:
        idx_ds_path = None
        if os.path.exists("/kaggle/input"):
            for root, dirs, files in os.walk("/kaggle/input"):
                if "gpt.pth" in files and "s2mel.pth" in files:
                    idx_ds_path = root
                    break
        if idx_ds_path:
            print("Streaming IndexTTS 2.5 checkpoints from Kaggle dataset mount to /tmp...")
            idx_local_dir = _stream_copy_fuse_to_local(idx_ds_path, "/tmp/novelova-indextts25")
        else:
            idx_local_dir = "/tmp/novelova-indextts25"
            os.makedirs(idx_local_dir, exist_ok=True)

        idx_wheels_dir = os.path.join(idx_local_dir, "wheels")
        if os.path.isdir(idx_wheels_dir):
            print("Installing offline IndexTTS 2.5 wheels from:", idx_wheels_dir)
            subprocess.run([
                sys.executable, "-m", "pip", "install", "-q", "--no-index", f"--find-links={{idx_wheels_dir}}",
                "transformers==4.52.1", "tokenizers==0.21.0", "accelerate==1.8.1",
                "omegaconf", "einops", "munch", "librosa", "soundfile", "scipy",
                "g2p-en", "inflect", "cn2an", "jieba", "pypinyin", "json5",
                "fugashi", "unidic-lite", "sentencepiece", "tiktoken", "safetensors",
                "openai-whisper", "argbind", "julius", "flatten-dict",
                "ffmpy", "pyloudnorm", "randomname", "pystoi", "torch-stoi", "markdown2",
            ], check=False)
            subprocess.run([
                sys.executable, "-m", "pip", "install", "-q", "--no-index", f"--find-links={{idx_wheels_dir}}",
                "--no-deps", "descript-audiotools==0.7.2",
            ], check=False)
        else:
            print("Installing IndexTTS 2.5 runtime deps online...")
            subprocess.run([
                sys.executable, "-m", "pip", "install", "-q",
                "transformers==4.52.1", "tokenizers==0.21.0", "accelerate==1.8.1",
                "huggingface_hub", "omegaconf>=2.3.0", "einops>=0.8.1", "munch==4.0.0",
                "librosa", "soundfile", "scipy", "g2p-en==2.1.0", "inflect",
                "cn2an==0.5.22", "jieba==0.42.1", "pypinyin", "json5==0.10.0",
                "fugashi>=1.2.0", "unidic-lite>=1.0.0", "sentencepiece>=0.2.1",
                "tiktoken", "safetensors", "openai-whisper", "argbind", "julius",
                "flatten-dict", "ffmpy", "pyloudnorm", "randomname", "pystoi",
                "torch-stoi", "markdown2",
            ], check=False)
            subprocess.run([
                sys.executable, "-m", "pip", "install", "-q", "--no-deps", "descript-audiotools==0.7.2",
            ], check=False)

        idx_repo_dir = os.path.join(idx_local_dir, "index-tts")
        if not os.path.isdir(idx_repo_dir):
            idx_repo_dir = "/tmp/index-tts"
            if not os.path.isdir(idx_repo_dir):
                subprocess.run(["git", "clone", "--depth", "1", "https://github.com/index-tts/index-tts.git", idx_repo_dir], check=False)
        if idx_repo_dir not in sys.path:
            sys.path.insert(0, idx_repo_dir)

        if not os.path.exists(os.path.join(idx_local_dir, "gpt.pth")):
            from huggingface_hub import snapshot_download
            snapshot_download(
                repo_id="IndexTeam/IndexTTS-2.5",
                local_dir=idx_local_dir,
                ignore_patterns=["*.md", "*.png", "*.jpg", "qwen0.6bemo4-merge/*"],
            )

        hf_cache_dir = os.path.join(idx_local_dir, "hf_cache")
        if os.path.isdir(hf_cache_dir):
            os.environ["HF_HUB_OFFLINE"] = "1"
            os.environ["HF_HUB_CACHE"] = hf_cache_dir

        # Stub modelscope (only used by QwenEmotion, skipped via use_qwen_emo=False)
        if "modelscope" not in sys.modules:
            _ms = types.ModuleType("modelscope")
            _ms.AutoModelForCausalLM = None
            sys.modules["modelscope"] = _ms

        # Stub BOTH TextNormalizer.load & TextNormalizer.normalize so wetext is never touched
        from indextts.utils.front import TextNormalizer
        TextNormalizer.load = lambda self: None
        TextNormalizer.normalize = lambda self, text: text

        import torch
        from indextts.infer_v2_5 import IndexTTS2
        dev = "cuda" if torch.cuda.is_available() else "cpu"
        t_load = time.time()
        indextts_model = IndexTTS2(
            cfg_path=os.path.join(idx_local_dir, "config.yaml"),
            model_dir=idx_local_dir,
            use_bf16=False,
            use_cuda_kernel=False,
            use_qwen_emo=False,
        )
        if dev == "cuda":
            indextts_model.gpt = indextts_model.gpt.half()
            indextts_model.s2mel = indextts_model.s2mel.half()
            indextts_model.bigvgan = indextts_model.bigvgan.float()
            indextts_model.dtype = torch.float16
            _orig_lr_fwd = indextts_model.s2mel.models["length_regulator"].forward
            def _fp16_lr_fwd(*args, **kwargs):
                with torch.amp.autocast("cuda", dtype=torch.float16):
                    return _orig_lr_fwd(*args, **kwargs)
            indextts_model.s2mel.models["length_regulator"].forward = _fp16_lr_fwd
            _orig_cfm_inf = indextts_model.s2mel.models["cfm"].inference
            def _fp16_cfm_inf(*args, **kwargs):
                with torch.amp.autocast("cuda", dtype=torch.float16):
                    return _orig_cfm_inf(*args, **kwargs)
            indextts_model.s2mel.models["cfm"].inference = _fp16_cfm_inf
        print(f"IndexTTS 2.5 resident in VRAM in {{time.time() - t_load:.2f}}s on {{dev}}")
        if dev == "cuda":
            try:
                import whisper
                whisper_qc_model = whisper.load_model("tiny.en", device="cuda")
                print("Whisper tiny.en QC resident on CUDA alongside IndexTTS 2.5")
            except Exception as wh_exc:
                print("Whisper QC init notice:", wh_exc)
    except Exception as e:
        print("IndexTTS 2.5 load error:", e)
        raise RuntimeError(f"FATAL: IndexTTS 2.5 failed to initialize on worker: {{e}}")

cosyvoice_model = None
if "{tts_model}" == "cosyvoice-3":
    print("Initializing Fun-CosyVoice 3.0 Studio voice cloning engine (FP16, 24 kHz)...")
    os.environ["USE_TF"] = "0"
    os.environ["USE_FLAX"] = "0"
    os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"
    os.environ["HF_HUB_DISABLE_IMPLICIT_TOKEN"] = "1"
    import types
    try:
        _cv_work = "/kaggle/working" if os.path.exists("/kaggle/working") else "/content/novelova_worker"
        os.makedirs(_cv_work, exist_ok=True)
        _cv_repo = os.path.join(_cv_work, "CosyVoice")
        if not os.path.exists(_cv_repo):
            subprocess.run(
                ["git", "clone", "--depth", "1", "--recursive", "https://github.com/FunAudioLLM/CosyVoice.git", _cv_repo],
                check=True,
            )
        _cv_deps = [
            "conformer==0.3.2", "diffusers", "hydra-core", "HyperPyYAML", "inflect",
            "librosa", "lightning", "modelscope", "omegaconf", "onnxruntime-gpu",
            "pyarrow", "soundfile", "x-transformers", "gdown", "huggingface_hub",
            "openai-whisper", "einops", "wget", "rootutils", "rich",
            "pypinyin", "jieba", "cn2an", "unidecode", "transformers==4.51.3",
        ]
        subprocess.run([sys.executable, "-m", "pip", "install", "-q", *_cv_deps], check=False)
        for _mod in ("ttsfrd", "wetext", "pyworld"):
            try:
                __import__(_mod)
            except Exception:
                _m = types.ModuleType(_mod)
                class _DummyNorm:
                    def __init__(self, *a, **kw): pass
                    def normalize(self, text): return text
                _m.Normalizer = _DummyNorm
                _m.TtsFrontendEngine = _DummyNorm
                sys.modules[_mod] = _m
        if _cv_repo not in sys.path:
            sys.path.insert(0, _cv_repo)
        _matcha_p = os.path.join(_cv_repo, "third_party", "Matcha-TTS")
        if _matcha_p not in sys.path:
            sys.path.insert(0, _matcha_p)
        _cv_model_dir = None
        for _cand in ("/kaggle/input/novelova-cosyvoice3", "/kaggle/input/noveler-models/cosyvoice3"):
            if os.path.exists(os.path.join(_cand, "cosyvoice3.yaml")):
                _cv_model_dir = _cand
                break
        if not _cv_model_dir:
            from huggingface_hub import snapshot_download
            _cv_model_dir = os.path.join(_cv_work, "pretrained_models", "Fun-CosyVoice3-0.5B")
            print("Downloading FunAudioLLM/Fun-CosyVoice3-0.5B-2512 from HuggingFace...")
            snapshot_download("FunAudioLLM/Fun-CosyVoice3-0.5B-2512", local_dir=_cv_model_dir)
        from cosyvoice.cli.cosyvoice import AutoModel as _CosyAutoModel
        t_cv = time.time()
        # Full FP32 (fp16=False) avoids float16 F0/harmonic underflow in HiFT vocoder on T4 with ~0% speed penalty
        cosyvoice_model = _CosyAutoModel(model_dir=_cv_model_dir, fp16=False)
        # Tighten stochastic speech-token sampling (top_p 0.8->0.68, top_k 25->15) to suppress outlier creaky/hoarse frames
        try:
            import functools
            from cosyvoice.utils.common import ras_sampling as _cv_ras
            if hasattr(cosyvoice_model, "model") and hasattr(cosyvoice_model.model, "llm"):
                cosyvoice_model.model.llm.sampling = functools.partial(_cv_ras, top_p=0.68, top_k=15, win_size=10, tau_r=0.1)
                print("Applied tightened CosyVoice 3 ras_sampling (top_p=0.68, top_k=15)")
        except Exception as _samp_err:
            print("CosyVoice sampling tuning notice:", _samp_err)
        print(f"Fun-CosyVoice 3.0 (FP32) resident in VRAM in {{time.time() - t_cv:.2f}}s (sr={{cosyvoice_model.sample_rate}})")
    except Exception as e:
        print("Fun-CosyVoice 3.0 load error:", e)
        raise RuntimeError(f"FATAL: Fun-CosyVoice 3.0 failed to initialize on worker: {{e}}")

if "{tts_model}" not in ("chatterbox-turbo", "chatterbox", "indextts-2.5", "cosyvoice-3"):
    try:
        from kokoro_onnx import Kokoro
        import onnxruntime as ort
    except ImportError:
        if found_wheels:
            subprocess.run([sys.executable, "-m", "pip", "install", "-q", "--no-index", f"--find-links={{found_wheels}}", "kokoro-onnx", "soundfile"], check=False)
        else:
            subprocess.run([sys.executable, "-m", "pip", "install", "-q", "kokoro-onnx", "soundfile"], check=False)
        from kokoro_onnx import Kokoro
        import onnxruntime as ort

    # Check pre-mounted dataset sources first for zero-latency instant boot (<0.01s)
    candidate_onnx_paths = [
        "/kaggle/input/noveler-models/kokoro-v1.0.onnx",
        "/kaggle/input/novelova-runtime-core/kokoro-v1.0.onnx",
        "/kaggle/working/kokoro-v1.0.onnx",
    ]
    candidate_voices_paths = [
        "/kaggle/input/noveler-models/voices-v1.0.bin",
        "/kaggle/input/novelova-runtime-core/voices-v1.0.bin",
        "/kaggle/working/voices-v1.0.bin",
    ]
    if os.path.exists("/kaggle/input"):
        for root, dirs, files in os.walk("/kaggle/input"):
            if "kokoro-v1.0.onnx" in files:
                candidate_onnx_paths.insert(0, os.path.join(root, "kokoro-v1.0.onnx"))
            if "voices-v1.0.bin" in files:
                candidate_voices_paths.insert(0, os.path.join(root, "voices-v1.0.bin"))

    onnx_path = next((p for p in candidate_onnx_paths if os.path.exists(p)), "/kaggle/working/kokoro-v1.0.onnx")
    voices_path = next((p for p in candidate_voices_paths if os.path.exists(p)), "/kaggle/working/voices-v1.0.bin")

    # Fast-stream pre-mounted ONNX & voices from FUSE mount to /tmp
    if onnx_path.startswith("/kaggle/input"):
        onnx_path = _stream_copy_file_to_local(onnx_path, "/tmp/kokoro-v1.0.onnx")
    if voices_path.startswith("/kaggle/input"):
        voices_path = _stream_copy_file_to_local(voices_path, "/tmp/voices-v1.0.bin")

    import urllib.request
    if not os.path.exists(onnx_path):
        print("Notice: Downloading Kokoro ONNX model weights (~325MB)...")
        try:
            urllib.request.urlretrieve(
                "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1/kokoro-v1.0.onnx",
                onnx_path,
            )
        except Exception as e:
            print("Error downloading ONNX weights:", e)
    else:
        print("Loaded Kokoro ONNX weights instantly from path:", onnx_path)

    if not os.path.exists(voices_path):
        print("Notice: Downloading Kokoro voice embeddings (~28MB)...")
        try:
            urllib.request.urlretrieve(
                "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1/voices-v1.0.bin",
                voices_path,
            )
        except Exception as e:
            print("Error downloading voice embeddings:", e)
    else:
        print("Loaded Kokoro voice embeddings instantly from path:", voices_path)

    try:
        if os.path.exists(onnx_path) and os.path.exists(voices_path):
            sess_opts = ort.SessionOptions()
            cpu_num = min(8, os.cpu_count() or 4)
            sess_opts.intra_op_num_threads = cpu_num
            sess_opts.inter_op_num_threads = cpu_num
            sess_opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL

            providers = ort.get_available_providers()
            chosen_providers = []
            if "CUDAExecutionProvider" in providers:
                chosen_providers.append("CUDAExecutionProvider")
            chosen_providers.append("CPUExecutionProvider")

            session = ort.InferenceSession(onnx_path, sess_options=sess_opts, providers=chosen_providers)
            kokoro_model = Kokoro.from_session(session, voices_path)
            print(f"Kokoro-82M loaded into VRAM/Runtime with providers: {{session.get_providers()}} (threads={{cpu_num}}, RTF ~0.015)")
    except Exception as e:
        print("Notice: Kokoro ONNX init with session failed, using standard init:", e)
        try:
            kokoro_model = Kokoro(onnx_path, voices_path)
        except Exception as e2:
            print("Notice: Kokoro fallback init failed:", e2)

# 4. Fetch Manifest from R2
manifest_key = "jobs/{job_id}/manifest.json"
manifest = None

if s3:
    try:
        obj = s3.get_object(Bucket=R2_BUCKET, Key=manifest_key)
        manifest = json.loads(obj["Body"].read().decode("utf-8"))
        print("Fetched manifest with", len(manifest.get("chapters", [])), "chapters.")
    except Exception as exc:
        print("Could not fetch manifest from R2:", exc)

if not manifest:
    print("No remote manifest found. Running standalone worker loop.")
    sys.exit(0)

# Download reference voice samples concurrently with timeout (avoids sequential GPU idle time)
from concurrent.futures import ThreadPoolExecutor
import urllib.request

def _download_with_timeout(url, dest_path, timeout=30):
    req = urllib.request.Request(url, headers={{"User-Agent": "Novelova-Worker/1.0"}})
    with urllib.request.urlopen(req, timeout=timeout) as resp, open(dest_path, "wb") as out_f:
        shutil.copyfileobj(resp, out_f)

local_voice_files = {{}}
_WORKER_WORK_DIR = "/kaggle/working" if os.path.exists("/kaggle/working") else "/content/novelova_worker"
_VOICES_DIR = os.path.join(_WORKER_WORK_DIR, "voices")
os.makedirs(_VOICES_DIR, exist_ok=True)
custom_voices_manifest = manifest.get("custom_voices", {{}})

def _clean_and_level_audio(wav, sr, target_dbfs=-20.0, hp_hz=90.0, debump=True):
    import numpy as np
    from scipy.signal import butter, sosfiltfilt
    w = np.asarray(wav, dtype=np.float32).squeeze()
    if w.ndim > 1:
        w = w.mean(axis=1)
    if len(w) < 32:
        return w
    w = w - np.mean(w)
    # 1. Pad 100ms silence before zero-phase Butterworth HPF to eliminate boundary reflection ringing
    pad_n = int(0.10 * sr)
    w_pad = np.pad(w, (pad_n, pad_n), mode="constant")
    sos = butter(4, hp_hz, btype="highpass", fs=sr, output="sos")
    w = sosfiltfilt(sos, w_pad)[pad_n:-pad_n].astype(np.float32)

    # 2. Active-speech RMS loudness leveling FIRST (so quiet edge pops are measured at their final level)
    active_mask = np.abs(w) > 0.0056
    rms = float(np.sqrt(np.mean(w[active_mask] ** 2))) if np.sum(active_mask) > int(0.05 * sr) else float(np.sqrt(np.mean(w ** 2)))
    if rms > 1e-6:
        gain = min((10.0 ** (target_dbfs / 20.0)) / rms, 8.0)
        w = w * gain

    # 3. Soft-knee peak limiter above 0.75
    peak_thresh = 0.75
    over = np.abs(w) > peak_thresh
    if np.any(over):
        w[over] = np.sign(w[over]) * (peak_thresh + 0.10 * np.tanh((np.abs(w[over]) - peak_thresh) / 0.10))

    # 4. AFTER leveling: zero out ONLY isolated <75ms HiFT vocoder edge pops surrounded by silence,
    #    preserving natural breath margins (never hard-cutting into loud syllables!)
    if debump and len(w) > int(0.20 * sr):
        step = max(1, int(0.01 * sr))
        nb = len(w) // step
        if nb > 16:
            rms_b = np.array([float(np.sqrt(np.mean(w[i*step:(i+1)*step] ** 2))) for i in range(nb)], dtype=np.float32)
            # Strip isolated leading burst (<=70ms) followed by >=40ms quiet gap before real speech
            s_trim = 0
            for i in range(min(15, nb - 6)):
                if rms_b[i] > 0.0025:
                    j = i
                    while j < nb and rms_b[j] > 0.0025 and (j - i) <= 8:
                        j += 1
                    if 0 < (j - i) <= 7 and j + 4 < nb and np.all(rms_b[j:j+4] < 0.0025):
                        w[i*step:j*step] = 0.0
                        s_trim = j
                    break
            # Strip isolated trailing burst (<=70ms) preceded by >=40ms quiet gap after real speech
            e_trim = nb
            for i in range(nb - 1, max(nb - 16, 5), -1):
                if rms_b[i] > 0.0025:
                    j = i
                    while j >= 0 and rms_b[j] > 0.0025 and (i - j) <= 8:
                        j -= 1
                    if 0 < (i - j) <= 7 and j - 3 >= 0 and np.all(rms_b[j-3:j+1] < 0.0025):
                        w[(j+1)*step:(i+1)*step] = 0.0
                        e_trim = j + 1
                    break
            # Gently trim excess pure-silence padding while keeping 40ms natural breath margin
            nz = np.where(np.array([float(np.sqrt(np.mean(w[i*step:(i+1)*step] ** 2))) for i in range(nb)]) > 0.002)[0]
            if len(nz) > 0:
                lo_s = max(0, (int(nz[0]) - 4) * step)
                hi_s = min(len(w), (int(nz[-1]) + 5) * step)
                if hi_s - lo_s >= int(0.10 * sr):
                    w = w[lo_s:hi_s]

    # 5. Silky 35ms Hann fade-in and 45ms Hann fade-out across the quiet margin -> zero boundary bump
    fi = min(int(0.035 * sr), len(w) // 4)
    fo = min(int(0.045 * sr), len(w) // 4)
    if fi > 1:
        w[:fi] *= 0.5 * (1.0 - np.cos(np.pi * np.arange(fi, dtype=np.float32) / fi))
    if fo > 1:
        w[-fo:] *= 0.5 * (1.0 + np.cos(np.pi * np.arange(fo, dtype=np.float32) / fo))
    return np.clip(w, -0.95, 0.95).astype(np.float32)

def _fetch_voice_asset(item):
    v_id, v_info = item
    v_url = v_info.get("audio_url")
    if not v_url:
        return None
    v_path = os.path.join(_VOICES_DIR, f"{{v_id}}.wav")
    try:
        _download_with_timeout(v_url, v_path, timeout=30)
        if os.path.exists(v_path) and os.path.getsize(v_path) > 44:
            import soundfile as sf
            import numpy as np
            data, sr = sf.read(v_path, dtype="float32")
            dur = len(data) / float(sr)
            if dur < 5.2:
                repeat_count = int(math.ceil(5.5 / max(0.1, dur)))
                tiled = np.tile(data, (repeat_count,) if data.ndim == 1 else (repeat_count, 1))
                data = tiled
                print(f"Padded reference sample '{{v_info.get('name', v_id)}}' from {{dur:.1f}}s to {{len(tiled)/float(sr):.1f}}s")
            if "{tts_model}" == "cosyvoice-3":
                try:
                    data = _clean_and_level_audio(data, sr, target_dbfs=-20.0, hp_hz=95.0, debump=False)
                except Exception as cln_e:
                    print("Ref voice clean notice:", cln_e)
            sf.write(v_path, data, sr, subtype="PCM_16")
            print(f"Downloaded voice reference for '{{v_info.get('name', v_id)}}':", v_path)
            return (v_id, v_path)
    except Exception as exc:
        print(f"Notice downloading voice {{v_id}}:", exc)
    return None

if custom_voices_manifest:
    with ThreadPoolExecutor(max_workers=min(8, max(1, len(custom_voices_manifest)))) as dl_pool:
        for res in dl_pool.map(_fetch_voice_asset, custom_voices_manifest.items()):
            if res:
                local_voice_files[res[0]] = res[1]

# Download and pre-convert SFX library audio concurrently into engine-native 16-bit mono PCM
ENGINE_SAMPLE_RATE = 22050 if "{tts_model}" == "indextts-2.5" else 24000
local_sfx_pcm = {{}}
local_sfx_by_name = {{}}
os.makedirs("/kaggle/working/sfx", exist_ok=True)
sfx_lib = manifest.get("sfx_library", {{}})

def _fetch_sfx_asset(item):
    sfx_id, sfx_info = item
    sfx_url = sfx_info.get("audio_url")
    sfx_name = sfx_info.get("name", "sfx")
    if not sfx_url:
        return None
    ext = "mp3" if ".mp3" in sfx_url.lower() else "wav"
    sfx_src = f"/kaggle/working/sfx/{{sfx_id}}.{{ext}}"
    sfx_raw = f"/kaggle/working/sfx/{{sfx_id}}_24k.raw"
    try:
        _download_with_timeout(sfx_url, sfx_src, timeout=30)
        if os.path.exists(sfx_src) and os.path.getsize(sfx_src) > 44:
            ffmpeg_bin = shutil.which("ffmpeg") or "/usr/bin/ffmpeg"
            c_cmd = [
                ffmpeg_bin, "-y",
                "-i", sfx_src,
                "-ar", str(ENGINE_SAMPLE_RATE),
                "-ac", "1",
                "-f", "s16le",
                sfx_raw,
            ]
            conv_res = subprocess.run(c_cmd, capture_output=True, timeout=15)
            pcm_bytes = None
            if conv_res.returncode == 0 and os.path.exists(sfx_raw):
                with open(sfx_raw, "rb") as rf:
                    pcm_bytes = rf.read()
            else:
                import soundfile as sf
                import numpy as np
                data, sr = sf.read(sfx_src)
                if data.ndim > 1:
                    data = data.mean(axis=1)
                if sr != ENGINE_SAMPLE_RATE:
                    target_len = int(len(data) * ENGINE_SAMPLE_RATE / float(sr))
                    indices = np.linspace(0, len(data) - 1, target_len)
                    data = np.interp(indices, np.arange(len(data)), data)
                samples = (data * 32767.0).clip(-32768, 32767).astype(np.int16)
                pcm_bytes = samples.tobytes()

            if pcm_bytes:
                clean_name = re.sub(r'[^a-zA-Z0-9]', '', sfx_name).lower()
                print(f"SFX loaded: '{{sfx_name}}' ({{len(pcm_bytes)//2}} samples)")
                return (sfx_id, clean_name, pcm_bytes)
    except Exception as sfx_exc:
        print(f"Notice loading SFX {{sfx_name}} ({{sfx_id}}):", sfx_exc)
    return None

if sfx_lib:
    print(f"Loading {{len(sfx_lib)}} SFX audio assets concurrently from manifest...")
    with ThreadPoolExecutor(max_workers=min(8, max(1, len(sfx_lib)))) as sfx_pool:
        for res in sfx_pool.map(_fetch_sfx_asset, sfx_lib.items()):
            if res:
                local_sfx_pcm[res[0]] = res[2]
                if res[1]:
                    local_sfx_by_name[res[1]] = res[2]

# Pre-condition Chatterbox neural voice embeddings for all characters (0ms switching)
voice_conditionals = {{}}
if chatterbox_model and local_voice_files:
    print("Pre-conditioning Chatterbox neural voice embeddings for all characters...")
    for v_id, v_path in local_voice_files.items():
        try:
            chatterbox_model.prepare_conditionals(str(v_path), exaggeration=0.0, norm_loudness=True)
            voice_conditionals[v_path] = chatterbox_model.conds
            v_name = manifest.get("custom_voices", {{}}).get(v_id, {{}}).get("name", v_id)
            print(f"Ready: conditioned voice for '{{v_name}}'")
        except Exception as cond_err:
            print(f"Notice conditioning voice {{v_id}}:", cond_err)

# 5. Audio DSP, Foley & Atmosphere Processing Helpers
VOICE_FILTER_FFMPEG_MAP = {{
    "robotic": "chorus=0.7:0.9:55:0.4:0.25:2,aecho=0.8:0.88:15:0.5,atempo=0.98",
    "radio": "highpass=f=400,lowpass=f=3500,volume=1.2",
    "reverb": "aecho=0.8:0.9:60:0.4,aecho=0.6:0.7:120:0.3",
    "telepathic": "aecho=0.8:0.9:60:0.4,aecho=0.6:0.7:120:0.3",
    "telephone": "highpass=f=300,lowpass=f=3000,volume=1.1",
    "megaphone": "highpass=f=500,aecho=0.8:0.6:40:0.5,volume=1.3",
    "whisper": "equalizer=f=4000:t=h:w=1:g=4,volume=0.9",
}}

def clean_text_for_foley(text, sfx_cues):
    if not text or not sfx_cues:
        return text or ""
    res = text
    for cue in sfx_cues:
        action = cue.get("action") or "replace"
        if action == "replace":
            tgt = (cue.get("target_text") or "").strip()
            if tgt:
                res = re.sub(r"(?:\\b|(?<!\\w))" + re.escape(tgt) + r"(?:\\b|(?!\\w))[!?.,;:—\\-]*", "", res, flags=re.IGNORECASE)
    res = re.sub(r"\\s+", " ", res).strip()
    return re.sub(r"^[,;:\\s—\\-]+|[,;:\\s—\\-]+$", "", res).strip()

def split_text_for_inline_foley(text, sfx_cues):
    if not text:
        return []
    replace_cues = [c for c in (sfx_cues or []) if (c.get("action") or "replace") == "replace"]
    if not replace_cues:
        return [{{"type": "text", "text": text.strip()}}]
    matches = []
    for cue in replace_cues:
        tgt = (cue.get("target_text") or "").strip()
        if not tgt:
            matches.append((0, 0, cue))
            continue
        m = re.search(r"(?:\\b|(?<!\\w))" + re.escape(tgt) + r"(?:\\b|(?!\\w))[!?.,;:—\\-]*", text, flags=re.IGNORECASE)
        matches.append((m.start(), m.end(), cue) if m else (0, 0, cue))
    matches.sort(key=lambda item: item[0])
    tokens = []
    cursor = 0
    for start, end, cue in matches:
        if start > cursor:
            before = re.sub(r"^[,;:\\s—\\-]+|[,;:\\s—\\-]+$", "", text[cursor:start]).strip()
            if before:
                tokens.append({{"type": "text", "text": before}})
        tokens.append({{"type": "sfx", "cue": cue}})
        cursor = max(cursor, end)
    if cursor < len(text):
        after = re.sub(r"^[,;:\\s—\\-]+|[,;:\\s—\\-]+$", "", text[cursor:]).strip()
        if after:
            tokens.append({{"type": "text", "text": after}})
    total_chars = sum(len(t["text"]) for t in tokens if t["type"] == "text")
    seen = 0
    for tok in tokens:
        if tok["type"] == "text":
            seen += len(tok["text"])
        else:
            tok["position_ratio"] = (seen / float(total_chars)) if total_chars > 0 else 0.0
    return tokens

def compute_alongside_offset_ratio(text, target_text):
    if not text or not target_text or not str(target_text).strip():
        return 0.0
    m = re.search(re.escape(str(target_text).strip()), text, flags=re.IGNORECASE)
    if not m or len(text) == 0:
        return 0.0
    return max(0.0, min(0.85, m.start() / float(len(text))))

def _find_low_energy_split_sample(speech_arr, approx_idx, sr):
    """Snap an inline splice point to the quietest 15ms window within +/-180ms to avoid chopping syllables."""
    import numpy as np
    n = len(speech_arr)
    if n == 0 or approx_idx <= 0:
        return 0
    if approx_idx >= n:
        return n
    win = max(1, int(sr * 0.015))
    radius = int(sr * 0.18)
    lo = max(0, approx_idx - radius)
    hi = min(n - win, approx_idx + radius)
    if hi <= lo:
        return approx_idx
    best_idx = approx_idx
    best_energy = float("inf")
    step = max(1, win // 2)
    for pos in range(lo, hi, step):
        seg = speech_arr[pos : pos + win]
        energy = float(np.mean(np.abs(seg)))
        if energy < best_energy:
            best_energy = energy
            best_idx = pos + win // 2
    return best_idx

_NEGATIONS = frozenset({{
    "no", "not", "never", "none", "nothing", "neither", "nor",
    "cannot", "can't", "won't", "don't", "doesn't", "didn't",
    "isn't", "aren't", "wasn't", "weren't", "hasn't", "haven't",
    "hadn't", "wouldn't", "shouldn't", "couldn't"
}})

def is_deterministic_silence(text):
    t = (text or "").strip()
    if not t:
        return True
    if t.lower() in ("[pause]", "[silence]", "[break]", "...", "…", "---", "***"):
        return True
    if not re.search(r"[a-zA-Z0-9]", t):
        return True
    return False

def has_adjacent_repeat(tokens):
    for i in range(len(tokens) - 2):
        if tokens[i] == tokens[i+1] == tokens[i+2]:
            return True
    for width in range(2, min(6, len(tokens) // 2 + 1)):
        for start in range(len(tokens) - 2 * width + 1):
            if tokens[start : start + width] == tokens[start + width : start + 2 * width]:
                return True
    return False

def check_negation_preservation(exp_tokens, act_tokens):
    exp_n = [t for t in exp_tokens if t in _NEGATIONS]
    act_n = [t for t in act_tokens if t in _NEGATIONS]
    return exp_n == act_n

def apply_voice_filter(pcm_frames, filter_id, sample_rate=24000):
    if not filter_id or filter_id not in VOICE_FILTER_FFMPEG_MAP or not pcm_frames:
        return pcm_frames
    in_p = None
    out_p = None
    try:
        import subprocess, tempfile
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as in_f:
            in_p = in_f.name
            with wave.open(in_f, "wb") as in_wf:
                in_wf.setnchannels(1)
                in_wf.setsampwidth(2)
                in_wf.setframerate(sample_rate)
                in_wf.writeframes(pcm_frames)
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as out_f:
            out_p = out_f.name
        cmd = ["ffmpeg", "-y", "-i", in_p, "-af", VOICE_FILTER_FFMPEG_MAP[filter_id], "-ar", str(sample_rate), "-ac", "1", "-c:a", "pcm_s16le", out_p]
        subprocess.run(cmd, capture_output=True, timeout=10)
        if os.path.exists(out_p) and os.path.getsize(out_p) > 44:
            with wave.open(out_p, "rb") as out_wf:
                pcm_frames = out_wf.readframes(out_wf.getnframes())
    except Exception as exc:
        print("Filter notice:", exc)
    finally:
        for p in (in_p, out_p):
            if p and os.path.exists(p):
                try:
                    os.remove(p)
                except OSError:
                    pass
    return pcm_frames

def generate_procedural_foley(name, duration_ms=750, volume=1.0, sample_rate=24000):
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
    elif any(k in name_l for k in ("sigh", "breath", "wind", "pant", "gasp", "whisper", "phew", "haaah", "haah")):
        for i in range(num_samples):
            t = i / float(sample_rate)
            envelope = math.sin(math.pi * (t / (duration_ms / 1000.0)))
            noise = (math.sin(i * 997.3) % 1.0 - 0.5)
            samples.append(max(-32768, min(32767, int(14000 * volume * envelope * noise))))
    else:
        # Subtle acoustic low-frequency thud / tap (NEVER a synthetic chime or tone!)
        for i in range(num_samples):
            t = i / float(sample_rate)
            decay = math.exp(-t * 12.0)
            freq = 90.0 * math.exp(-t * 4.0)
            noise = (math.sin(i * 791.9) % 1.0 - 0.5) * 0.2 if t < 0.04 else 0.0
            val = int(18000 * volume * decay * (math.sin(2.0 * math.pi * freq * t) + noise))
            samples.append(max(-32768, min(32767, val)))
    return struct.pack(f"<{{len(samples)}}h", *samples)

def generate_procedural_atmosphere(name, duration_ms, volume=0.2, sample_rate=24000):
    import numpy as np
    num_samples = max(1, int(sample_rate * (duration_ms / 1000.0)))
    idx = np.arange(num_samples, dtype=np.float32)
    t = idx / float(sample_rate)
    env = np.ones(num_samples, dtype=np.float32)
    fade_samples = min(num_samples // 2, int(sample_rate * 0.5))
    if fade_samples > 0:
        env[:fade_samples] = np.linspace(0.0, 1.0, fade_samples, dtype=np.float32)
        env[-fade_samples:] = np.linspace(1.0, 0.0, fade_samples, dtype=np.float32)
    name_l = name.lower()
    if any(k in name_l for k in ("ocean", "wave", "sea", "water")):
        swell = (np.sin(2.0 * np.pi * t / 3.5) + 1.0) * 0.5
        noise = np.mod(np.sin(idx * 311.7), 1.0) - 0.5
        vals = 18000.0 * volume * env * (0.3 + 0.7 * swell) * noise
    elif any(k in name_l for k in ("rain", "storm")):
        noise = np.mod(np.sin(idx * 123.456), 1.0) - 0.5
        rumble = 0.3 * np.sin(2.0 * np.pi * 32.0 * t)
        vals = 16000.0 * volume * env * (noise * 0.7 + rumble * 0.3)
    else:
        hum = 0.5 * np.sin(2.0 * np.pi * 55.0 * t) + 0.5 * np.sin(2.0 * np.pi * 110.0 * t)
        vals = 10000.0 * volume * env * hum
    return np.clip(vals, -32768, 32767).astype(np.int16)

def build_atmosphere_spans(segments_timings):
    spans = []
    curr = None
    for s in sorted(segments_timings, key=lambda x: x.get("order_index", 0)):
        atmo_id = s.get("atmosphere_id")
        s_ms = s.get("start_ms", 0)
        e_ms = s.get("end_ms", s_ms + s.get("duration_ms", 1000))
        if atmo_id:
            if curr and curr["atmosphere_id"] == atmo_id:
                curr["end_ms"] = max(curr["end_ms"], e_ms)
            else:
                if curr: spans.append(curr)
                curr = {{"atmosphere_id": atmo_id, "atmosphere_name": s.get("atmosphere_name", "Atmosphere"), "volume": float(s.get("atmosphere_volume", 0.15) or 0.15), "start_ms": s_ms, "end_ms": e_ms}}
        else:
            if curr:
                spans.append(curr)
                curr = None
    if curr: spans.append(curr)
    return spans

# 5b. High-Throughput Background Upload Bus, Shutdown Guard & Content-Hash Cache
SESSION_START = time.time()
SESSION_BUDGET_SEC = 10.5 * 3600  # Exit cleanly before Kaggle hard 12h kill
SHUTDOWN_KEY = "jobs/{job_id}/shutdown.json"

def _is_job_cancelled():
    if not s3 or not R2_BUCKET:
        return False
    try:
        s3.head_object(Bucket=R2_BUCKET, Key=SHUTDOWN_KEY)
        return True
    except Exception:
        return False

def _split_tts_chunks(text, max_chars=260):
    if len(text) <= max_chars:
        return [text]
    sentences = re.split(r"(?<=[.!?])\s+", text)
    chunks = []
    curr = ""
    for sent in sentences:
        if curr and len(curr) + 1 + len(sent) > max_chars:
            chunks.append(curr.strip())
            curr = sent
        else:
            curr = f"{{curr}} {{sent}}".strip() if curr else sent
    if curr:
        chunks.append(curr.strip())
    return chunks or [text]

# Bulk-index existing cached takes once at startup so repeated/retried segments cost 0ms GPU
existing_cache_keys = set()
if s3 and R2_BUCKET:
    try:
        cache_prefix = "projects/{project_id}/audio/cache/"
        cont_tok = None
        while True:
            list_kwargs = {{"Bucket": R2_BUCKET, "Prefix": cache_prefix, "MaxKeys": 1000}}
            if cont_tok:
                list_kwargs["ContinuationToken"] = cont_tok
            c_resp = s3.list_objects_v2(**list_kwargs)
            for c_item in c_resp.get("Contents", []):
                c_key = c_item.get("Key")
                if c_key:
                    existing_cache_keys.add(c_key)
            if not c_resp.get("IsTruncated"):
                break
            cont_tok = c_resp.get("NextContinuationToken")
        if existing_cache_keys:
            print(f"Loaded {{len(existing_cache_keys)}} cached segment takes from R2 (0ms GPU hits enabled).")
    except Exception as cache_list_err:
        print("Cache index notice:", cache_list_err)

upload_pool = ThreadPoolExecutor(max_workers=8)
upload_futures = []

def _async_upload_segment(t_key, w_bytes, r_key, r_bytes, cache_key=None):
    if not s3 or not R2_BUCKET:
        return
    try:
        s3.put_object(Bucket=R2_BUCKET, Key=t_key, Body=w_bytes, ContentType="audio/wav")
    except Exception as exc:
        print("Async take upload notice:", exc)
    if cache_key:
        try:
            s3.put_object(Bucket=R2_BUCKET, Key=cache_key, Body=w_bytes, ContentType="audio/wav")
        except Exception as exc:
            print("Async cache upload notice:", exc)
    if r_key and r_bytes:
        try:
            s3.put_object(Bucket=R2_BUCKET, Key=r_key, Body=r_bytes, ContentType="application/json")
        except Exception as exc:
            print("Async receipt upload notice:", exc)

# 6. Process Chapters Sequentially
chapters = manifest.get("chapters", [])
for ch in chapters:
    if _is_job_cancelled():
        print("Shutdown signal detected in R2 before chapter start. Exiting GPU session immediately.")
        break
    if (time.time() - SESSION_START) >= SESSION_BUDGET_SEC:
        print("Approaching Kaggle session time budget. Exiting cleanly to preserve completed chapters.")
        break

    ch_num = ch.get("chapter_number", 1)
    ch_title = ch.get("title", f"Chapter {{ch_num}}")
    segments = ch.get("segments", [])
    print(f"\\nSynthesizing Chapter {{ch_num}}: {{ch_title}} ({{len(segments)}} segments)...")

    alignments = []
    current_ms = 0
    full_audio_frames = bytearray()
    sample_rate = 22050 if "{tts_model}" == "indextts-2.5" else 24000
    current_prepared_ref = None
    chapter_upload_futures = []

    # Helper: trim any reference voice clip > 12.0s cleanly at a quiet boundary (6-12s sweet spot)
    trimmed_indextts_refs = {{}}
    def _get_indextts_ref(path):
        if not path or not os.path.exists(path):
            return path
        if path in trimmed_indextts_refs:
            return trimmed_indextts_refs[path]
        try:
            import numpy as np, soundfile as sf
            wav_np, sr_r = sf.read(path, dtype="float32")
            if wav_np.ndim > 1:
                wav_np = wav_np.mean(axis=1)
            if len(wav_np) / float(sr_r) <= 12.0:
                trimmed_indextts_refs[path] = path
                return path
            start_s, end_s = int(8.5 * sr_r), min(len(wav_np), int(11.5 * sr_r))
            win = max(1, int(0.1 * sr_r))
            best_idx, best_rms = end_s, 1e9
            for idx_w in range(start_s, max(start_s + 1, end_s - win), max(1, win // 2)):
                rms = float(np.sqrt(np.mean(wav_np[idx_w:idx_w + win] ** 2)))
                if rms < best_rms:
                    best_rms, best_idx = rms, idx_w + win // 2
            out_trim = f"/tmp/idx_ref_{{abs(hash(path))}}.wav"
            sf.write(out_trim, wav_np[:best_idx], sr_r, subtype="PCM_16")
            trimmed_indextts_refs[path] = out_trim
            return out_trim
        except Exception:
            trimmed_indextts_refs[path] = path
            return path

    try:
        import inflect as _worker_inflect
        _worker_inflect_engine = _worker_inflect.engine()
    except Exception:
        _worker_inflect_engine = None

    def _num_to_en(raw_val):
        if not _worker_inflect_engine:
            return raw_val
        clean_v = str(raw_val).strip().replace(",", "")
        try:
            if re.fullmatch(r"\\d+(?:st|nd|rd|th)", clean_v, flags=re.IGNORECASE):
                return _worker_inflect_engine.number_to_words(clean_v.lower())
            if "." in clean_v and re.fullmatch(r"-?\\d+\\.\\d+", clean_v):
                return _worker_inflect_engine.number_to_words(clean_v)
            return _worker_inflect_engine.number_to_words(int(clean_v))
        except Exception:
            return raw_val

    def _sanitize_indextts_text(raw_t):
        _cmu_re = re.compile(r"<[^|>\\n]+\\|[^>\\n]+>")
        _tag_re = re.compile(r"\\[(?:laugh|sigh|gasp|groan|chuckle|cough|sniff|shush|clear\\s+throat)\\]", re.IGNORECASE)
        _stut_re = re.compile(r"(?<![A-Za-z0-9<|])([B-DF-HJ-NP-TV-Zb-df-hj-np-tv-z])(\\.{{2,3}}|—|–|-)(\\s*)([A-Za-z]{{2,}})")
        _num_re = re.compile(r"(?<![A-Za-z0-9<|_])(\\d{{1,3}}(?:,\\d{{3}})+|\\d+(?:st|nd|rd|th)|\\d+\\.\\d+|\\d{{1,9}})(?![A-Za-z0-9>|_])", re.IGNORECASE)
        _smap = {{"b":"buh","c":"cuh","d":"duh","f":"fuh","g":"guh","h":"huh","j":"juh","k":"kuh","l":"luh","m":"muh","n":"nuh","p":"puh","q":"kuh","r":"ruh","s":"sss","t":"tuh","v":"vuh","w":"wuh","y":"yuh","z":"zuh"}}
        prot = {{}}
        def _p(m):
            k = f"__CMU_{{len(prot)}}__"
            prot[k] = m.group(0)
            return k
        t = _cmu_re.sub(_p, raw_t or "")
        t = _tag_re.sub(" ", t)
        t = t.replace("<", "").replace(">", "")
        t = re.sub(
            r"(?<![A-Za-z0-9/])(\\d{{1,9}})\\s*/\\s*(\\d{{1,9}})(?![A-Za-z0-9/])",
            lambda m: (
                m.group(0)
                if (m.group(1) == "24" and m.group(2) == "7")
                else f"{{_num_to_en(m.group(1))}} out of {{_num_to_en(m.group(2))}}"
            ),
            t,
        )
        t = re.sub(
            r"(?<![A-Za-z0-9])\\+(\\d{{1,9}})(?![A-Za-z0-9])",
            lambda m: f"plus {{_num_to_en(m.group(1))}}",
            t,
        )
        def _st(m):
            l, sep, sp, nxt = m.group(1), m.group(2), m.group(3), m.group(4)
            sy = _smap.get(l.lower())
            if not sy:
                return m.group(0)
            return f"{{sy.capitalize() if l.isupper() else sy}}{{sep}}{{sp}}{{nxt}}"
        t = _stut_re.sub(_st, t)
        t = _num_re.sub(lambda m: _num_to_en(m.group(1)), t)
        t = re.sub(r"[ \\t]{{2,}}", " ", t).strip()
        for k, v in prot.items():
            t = t.replace(k, v)
        return t

    def _resolve_seg_ref_path(seg_obj):
        spk_l = (seg_obj.get("speaker") or "Narrator").strip()
        gnd_l = (seg_obj.get("speaker_gender") or "male").lower()
        c_info = manifest.get("characters", {{}}).get(seg_obj.get("character_id")) or manifest.get("characters", {{}}).get(spk_l, {{}})
        v_id_l = seg_obj.get("voice_id") or c_info.get("voice_id")
        if not v_id_l:
            if spk_l.lower() == "narrator":
                v_id_l = manifest.get("narrator_voice_id")
            elif gnd_l == "female":
                v_id_l = manifest.get("default_female_voice_id")
            else:
                v_id_l = manifest.get("default_male_voice_id")
        rp = local_voice_files.get(v_id_l) if v_id_l else None
        if not rp and local_voice_files:
            for cand_id, cand_path in local_voice_files.items():
                cg = manifest.get("custom_voices", {{}}).get(cand_id, {{}}).get("gender", "")
                if (gnd_l == "female" and cg == "female") or (gnd_l != "female" and cg == "male"):
                    rp = cand_path
                    break
        if not rp and local_voice_files:
            rp = next(iter(local_voice_files.values()))
        return rp

    # Speaker-grouped pre-synthesis pass for IndexTTS 2.5 (100% CAMPPlus/W2V-BERT cache hit rate!)
    indextts_pregen_pcm = {{}}
    if indextts_model:
        import numpy as np, soundfile as sf
        from collections import defaultdict
        spk_batches = defaultdict(list)
        for seg_obj in segments:
            c_key = seg_obj.get("cache_key")
            if c_key and c_key in existing_cache_keys:
                continue
            raw_t = seg_obj.get("text", "").strip()
            s_cues = seg_obj.get("sfx_cues") or []
            ct = clean_text_for_foley(raw_t, s_cues) if s_cues else raw_t
            ct = re.sub(r"^[—–\\-─\\s]+", "", ct).strip()
            ct = _sanitize_indextts_text(ct)
            if not ct or is_deterministic_silence(ct):
                continue
            rp = _get_indextts_ref(_resolve_seg_ref_path(seg_obj))
            if rp and os.path.exists(rp):
                spk_batches[rp].append((seg_obj, ct))

        for ref_p, batch_items in spk_batches.items():
            for seg_obj, ct in batch_items:
                ep = seg_obj.get("emotion_profile") or {{}}
                is_narr = (
                    (seg_obj.get("speaker") or "").strip().lower() == "narrator"
                    or (seg_obj.get("delivery_type") or "").strip().lower() == "narration"
                )
                raw_vec = ep.get("vector")
                if is_narr:
                    # Keep neutral narration completely natural (emo_vector=None, emo_alpha=0.0) so IndexTTS 2.5
                    # never forces/presses words; apply only gentle emotion coloring when a real emotion is present.
                    if isinstance(raw_vec, list) and len(raw_vec) == 8 and max(float(v) for v in raw_vec[:7]) >= 0.15:
                        emo_vec = [round(float(v) * 0.55, 3) for v in raw_vec[:7]] + [0.0] if not ep.get("_narrator_scaled") else raw_vec
                        emo_alpha = round(min(float(ep.get("emo_alpha", 0.16)), 0.18), 3)
                    else:
                        emo_vec = None
                        emo_alpha = 0.0
                    narr_speed = float(ep.get("narrator_speed", 1.2))
                else:
                    emo_vec = raw_vec if isinstance(raw_vec, list) and len(raw_vec) == 8 else [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.5]
                    emo_alpha = float(ep.get("emo_alpha", 0.55))
                    narr_speed = 1.0
                dur_fac = float(ep.get("duration_factor", 1.0))
                max_att = 2 if whisper_qc_model else 1
                best_pcm = None
                for att in range(1, max_att + 1):
                    out_tmp = f"/tmp/idx_seg_{{seg_obj.get('id')}}_{{att}}.wav"
                    try:
                        infer_kwargs = dict(
                            spk_audio_prompt=ref_p,
                            text=ct,
                            output_path=out_tmp,
                            lang="en",
                            duration_factor=dur_fac,
                            text_normalization=False,
                        )
                        if emo_vec is not None and emo_alpha > 0.0:
                            infer_kwargs["emo_vector"] = emo_vec
                            infer_kwargs["emo_alpha"] = emo_alpha
                        indextts_model.infer(**infer_kwargs)
                        if is_narr and abs(narr_speed - 1.0) > 0.01:
                            out_fast = f"/tmp/idx_seg_{{seg_obj.get('id')}}_{{att}}_fast.wav"
                            try:
                                subprocess.run(
                                    ["ffmpeg", "-y", "-loglevel", "error", "-i", out_tmp, "-filter:a", f"atempo={{narr_speed:.3f}}", out_fast],
                                    check=True,
                                    timeout=30,
                                )
                                if os.path.exists(out_fast) and os.path.getsize(out_fast) > 44:
                                    out_tmp = out_fast
                            except Exception as spd_err:
                                print(f"Narrator atempo notice for seg {{seg_obj.get('id')}}:", spd_err)
                        w_np, m_sr = sf.read(out_tmp, dtype="float32")
                        if w_np.ndim > 1:
                            w_np = w_np.mean(axis=1)
                        if m_sr != sample_rate:
                            import torchaudio
                            w_np = torchaudio.functional.resample(torch.from_numpy(w_np).unsqueeze(0), m_sr, sample_rate).squeeze(0).numpy()
                        a_i16 = (np.clip(w_np, -1.0, 1.0) * 32767).astype(np.int16)
                        qc_ok = True
                        if whisper_qc_model and len(a_i16) > 2400:
                            try:
                                import torchaudio
                                w16 = torchaudio.functional.resample(torch.from_numpy(w_np.astype(np.float32)).to(dev), sample_rate, 16000).cpu().numpy()
                                wres = whisper_qc_model.transcribe(w16, fp16=(dev == "cuda"), language="en")
                                wtr = wres.get("text", "").strip()
                                etok = re.findall(r"\b[a-z0-9']+\b", ct.lower())
                                atok = re.findall(r"\b[a-z0-9']+\b", wtr.lower())
                                if has_adjacent_repeat(atok) or not check_negation_preservation(etok, atok):
                                    qc_ok = False
                            except Exception:
                                qc_ok = True
                        best_pcm = a_i16.tobytes()
                        if qc_ok or att == max_att:
                            break
                    except Exception as idx_err:
                        print(f"IndexTTS take notice for seg {{seg_obj.get('id')}}:", idx_err)
                if best_pcm:
                    indextts_pregen_pcm[seg_obj.get("id")] = best_pcm

    for seg_idx, seg in enumerate(segments):
        if seg_idx > 0 and seg_idx % 20 == 0:
            if _is_job_cancelled():
                print(f"Shutdown signal detected mid-chapter {{ch_num}} at segment {{seg_idx}}. Exiting immediately.")
                upload_pool.shutdown(wait=False)
                sys.exit(0)
            if (time.time() - SESSION_START) >= SESSION_BUDGET_SEC:
                print(f"Session budget reached mid-chapter {{ch_num}}. Exiting cleanly.")
                upload_pool.shutdown(wait=True)
                sys.exit(0)

        text = seg.get("text", "").strip()
        gender = (seg.get("speaker_gender") or "male").lower()
        seg_id = seg.get("id")
        speaker = (seg.get("speaker") or "Narrator").strip()
        sfx_cues = seg.get("sfx_cues") or []
        voice_filter_id = seg.get("voice_filter_id")
        cache_key = seg.get("cache_key")
        cache_hit = False

        clean_text = clean_text_for_foley(text, sfx_cues) if sfx_cues else text
        # Strip leading dashes / hyphens / em-dashes to avoid TTS grunting "Ugh"
        clean_text = re.sub(r"^[—–\-─\s]+", "", clean_text).strip()

        words = len(clean_text.split()) if clean_text else 1
        dur_sec = max(0.5, words * 0.35) if clean_text else 0.8
        dur_ms = int(dur_sec * 1000)

        # Multi-Engine Neural Audio Inference with Content-Hash Cache & Seamless Fallback
        seg_frames = bytearray()

        # -1. Content-Hash Cache Hit (0ms GPU!)
        if cache_key and cache_key in existing_cache_keys and s3 and R2_BUCKET:
            try:
                c_obj = s3.get_object(Bucket=R2_BUCKET, Key=cache_key)
                c_wav_bytes = c_obj["Body"].read()
                with wave.open(io.BytesIO(c_wav_bytes), "rb") as c_wf:
                    cached_pcm = c_wf.readframes(c_wf.getnframes())
                if cached_pcm:
                    seg_frames.extend(cached_pcm)
                    dur_ms = int((len(cached_pcm) / 2 / float(sample_rate)) * 1000)
                    cache_hit = True
            except Exception as cache_get_err:
                print("Cache fetch miss notice:", cache_get_err)

        # 0. Deterministic Silence for Scene Breaks, Pauses & Ellipses (0ms GPU, 0 Hallucinations)
        if is_deterministic_silence(clean_text):
            silence_ms = int(seg.get("pause_ms") or 700)
            dur_ms = silence_ms
            num_samples = int(sample_rate * (silence_ms / 1000.0))
            seg_frames.extend(bytes(num_samples * 2))

        # 0.5 IndexTTS 2.5 Speaker-Grouped Pre-Generated Take
        if not seg_frames and seg_id in indextts_pregen_pcm:
            seg_frames.extend(indextts_pregen_pcm.pop(seg_id))
            dur_ms = int((len(seg_frames) / 2 / float(sample_rate)) * 1000)

        # 0.6 Fun-CosyVoice 3.0 Studio (24 kHz, instruct2 pacing/tone + 90Hz HPF + -20dBFS leveling + edge de-bumper)
        if not seg_frames and cosyvoice_model and clean_text:
            try:
                import numpy as np
                ct_cv = _sanitize_indextts_text(clean_text).replace("[", "").replace("]", "")
                if ct_cv and not is_deterministic_silence(ct_cv):
                    rp_cv = _resolve_seg_ref_path(seg)
                    if rp_cv and os.path.exists(rp_cv):
                        _spk_l = speaker.lower()
                        _del_l = (seg.get("delivery_type") or "narration").strip().lower()
                        _ep_cv = seg.get("emotion_profile") or {{}}
                        _emo_l = (seg.get("emotion") or _ep_cv.get("label") or "").strip().lower()
                        _cv_spd = 1.0
                        if any(k in _spk_l for k in ("spell", "system", "interface")):
                            _cv_inst = "You are a helpful assistant. Speak clearly, resonantly, and solemnly with calm authority like an ancient mystical proclamation.<|endofprompt|>"
                        elif _spk_l == "narrator" or _del_l == "narration":
                            if _emo_l in ("tense", "afraid", "anxious", "fearful", "ominous"):
                                _cv_inst = "You are a helpful assistant. Speak with quiet, grounded tension at a brisk, natural audiobook storytelling pace.<|endofprompt|>"
                            elif _emo_l in ("sad", "melancholic", "somber"):
                                _cv_inst = "You are a helpful assistant. Speak with quiet, restrained solemnity at a steady, natural storytelling pace.<|endofprompt|>"
                            else:
                                _cv_inst = "You are a helpful assistant. Speak naturally in a brisk, clear, relaxed audiobook storytelling voice without over-dramatizing.<|endofprompt|>"
                        elif _del_l == "whisper":
                            _cv_inst = "You are a helpful assistant. Speak in a low, hushed, urgent whisper at a brisk, natural pace.<|endofprompt|>"
                        elif _del_l == "internal_thought":
                            _cv_inst = "You are a helpful assistant. Speak softly and introspectively at a brisk, natural conversational pace.<|endofprompt|>"
                        else:
                            _extra_cv = "in a warm, grounded, lower-pitched confident adult woman's voice " if "effie" in _spk_l else ""
                            if _emo_l in ("angry", "furious", "hostile", "enraged"):
                                _cv_inst = f"You are a helpful assistant. Speak {{_extra_cv}}with sharp, controlled anger at a brisk, natural pace.<|endofprompt|>"
                            elif _emo_l in ("sarcastic", "mocking", "amused", "wry"):
                                _cv_inst = f"You are a helpful assistant. Speak {{_extra_cv}}with dry, wry amusement at a brisk, natural conversational pace.<|endofprompt|>"
                            elif _emo_l in ("happy", "cheerful", "excited", "playful"):
                                _cv_inst = f"You are a helpful assistant. Speak {{_extra_cv}}with warm, relaxed cheerfulness at a brisk, natural pace.<|endofprompt|>"
                            elif _emo_l in ("sad", "grief", "melancholic"):
                                _cv_inst = f"You are a helpful assistant. Speak {{_extra_cv}}with quiet sadness at a steady, natural pace.<|endofprompt|>"
                            elif _emo_l in ("afraid", "terrified", "panicked", "nervous"):
                                _cv_inst = f"You are a helpful assistant. Speak {{_extra_cv}}with tense urgency at a brisk, natural pace.<|endofprompt|>"
                            else:
                                _cv_inst = f"You are a helpful assistant. Speak {{_extra_cv}}naturally and expressively at a brisk, clear conversational pace matching the narrator.<|endofprompt|>"

                        _cv_chunks = []
                        for _, _cv_out in enumerate(cosyvoice_model.inference_instruct2(ct_cv, _cv_inst, rp_cv, stream=False, speed=_cv_spd)):
                            _cv_chunks.append(_cv_out["tts_speech"].squeeze().cpu().numpy().astype(np.float32))
                        if _cv_chunks:
                            _cv_wav = np.concatenate(_cv_chunks)
                            _cv_sr = getattr(cosyvoice_model, "sample_rate", 24000)
                            if _cv_sr != sample_rate:
                                import torchaudio
                                _cv_wav = torchaudio.functional.resample(torch.from_numpy(_cv_wav).unsqueeze(0), _cv_sr, sample_rate).squeeze(0).numpy()
                            _cv_wav = _clean_and_level_audio(_cv_wav, sample_rate, target_dbfs=-20.0, hp_hz=90.0, debump=True)
                            _cv_i16 = (np.clip(_cv_wav, -1.0, 1.0) * 32767).astype(np.int16)
                            seg_frames.extend(_cv_i16.tobytes())
                            dur_ms = int((len(_cv_i16) / float(sample_rate)) * 1000)
            except Exception as cv_err:
                print(f"CosyVoice 3 take notice for seg {{seg_id}}:", cv_err)

        # 1. Chatterbox-Turbo Voice Cloning with In-Worker QC Defense
        if not seg_frames and chatterbox_model and clean_text:
            try:
                char_info = (
                    manifest.get("characters", {{}}).get(seg.get("character_id"))
                    or manifest.get("characters", {{}}).get(speaker, {{}})
                )
                v_id = seg.get("voice_id") or char_info.get("voice_id")
                if not v_id:
                    if speaker.lower() == "narrator":
                        v_id = manifest.get("narrator_voice_id")
                    elif gender == "female":
                        v_id = manifest.get("default_female_voice_id")
                    else:
                        v_id = manifest.get("default_male_voice_id")

                ref_path = local_voice_files.get(v_id) if v_id else None
                if not ref_path:
                    # Fallback to a reference voice matching character gender
                    for cand_id, cand_path in local_voice_files.items():
                        cand_gender = manifest.get("custom_voices", {{}}).get(cand_id, {{}}).get("gender", "")
                        if (gender == "female" and cand_gender == "female") or (gender != "female" and cand_gender == "male"):
                            ref_path = cand_path
                            break
                if not ref_path and local_voice_files:
                    narrator_vid = manifest.get("narrator_voice_id")
                    if speaker.lower() != "narrator":
                        non_narrator_voices = [p for vid, p in local_voice_files.items() if vid != narrator_vid]
                        if non_narrator_voices:
                            ref_path = non_narrator_voices[0]
                    if not ref_path:
                        ref_path = next(iter(local_voice_files.values()))

                if ref_path and os.path.exists(ref_path):
                    if ref_path in voice_conditionals:
                        chatterbox_model.conds = voice_conditionals[ref_path]
                    elif current_prepared_ref != ref_path:
                        chatterbox_model.prepare_conditionals(str(ref_path), exaggeration=0.0, norm_loudness=True)
                        voice_conditionals[ref_path] = chatterbox_model.conds
                        current_prepared_ref = ref_path

                # Multi-Attempt Generation with torch.inference_mode(), Sentence Chunking & GPU-Resampled Whisper QC
                import numpy as np
                text_chunks = _split_tts_chunks(clean_text, max_chars=260)
                max_attempts = 2 if whisper_qc_model else 1
                for attempt in range(1, max_attempts + 1):
                    chunk_arrays = []
                    chunk_tensors = []
                    with torch.inference_mode():
                        for t_chunk in text_chunks:
                            c_tensor = chatterbox_model.generate(t_chunk)
                            chunk_tensors.append(c_tensor)
                            if hasattr(c_tensor, "cpu"):
                                c_np = c_tensor.detach().cpu().numpy()
                            else:
                                c_np = np.array(c_tensor)
                            c_np = c_np.squeeze()
                            if c_np.ndim > 1:
                                c_np = c_np.mean(axis=0)
                            if len(c_np) > 0:
                                chunk_arrays.append(c_np)
                    if not chunk_arrays:
                        continue
                    audio_np = np.concatenate(chunk_arrays) if len(chunk_arrays) > 1 else chunk_arrays[0]
                    audio_int16 = (np.clip(audio_np, -1.0, 1.0) * 32767).astype(np.int16)
                    if len(audio_int16) == 0:
                        continue

                    model_sr = getattr(chatterbox_model, "sr", 24000)

                    # In-Worker Whisper QC Validation (GPU-resampled)
                    qc_passed = True
                    if whisper_qc_model and len(audio_int16) > 2400:
                        try:
                            import torchaudio
                            if len(chunk_tensors) == 1 and hasattr(chunk_tensors[0], "to"):
                                gpu_wav = chunk_tensors[0].detach().float().squeeze()
                                if gpu_wav.ndim > 1:
                                    gpu_wav = gpu_wav.mean(dim=0)
                                wav_16k = torchaudio.functional.resample(gpu_wav, model_sr, 16000).cpu().numpy()
                            else:
                                wav_16k = torchaudio.functional.resample(
                                    torch.from_numpy(audio_np.astype(np.float32)).to(dev), model_sr, 16000
                                ).cpu().numpy()
                            wh_res = whisper_qc_model.transcribe(wav_16k, fp16=(dev == "cuda"), language="en")
                            wh_transcript = wh_res.get("text", "").strip()
                            exp_tokens = re.findall(r"\b[a-z0-9']+\b", clean_text.lower())
                            act_tokens = re.findall(r"\b[a-z0-9']+\b", wh_transcript.lower())

                            if has_adjacent_repeat(act_tokens):
                                print(f"QC Alert: Looping repetition detected on take {{attempt}} for '{{speaker}}': '{{wh_transcript}}'")
                                qc_passed = False
                            elif not check_negation_preservation(exp_tokens, act_tokens):
                                print(f"QC Alert: Negation mismatch detected on take {{attempt}} for '{{speaker}}': exp='{{clean_text}}' vs got='{{wh_transcript}}'")
                                qc_passed = False
                        except Exception as qc_err:
                            qc_passed = True

                    if qc_passed or attempt == max_attempts:
                        seg_frames.extend(audio_int16.tobytes())
                        dur_ms = max(dur_ms, int((len(audio_int16) / float(model_sr)) * 1000))
                        break
                    else:
                        print(f"Retrying take for '{{speaker}}'...")
            except Exception as exc:
                print(f"Chatterbox take notice for '{{speaker}}':", exc)
                seg_frames = bytearray()

        # 2. Kokoro-82M High-Speed Neural Fallback with Distinct Character Casting
        if not seg_frames and kokoro_model and clean_text and "{tts_model}" not in ("chatterbox-turbo", "chatterbox", "indextts-2.5", "cosyvoice-3"):
            try:
                import numpy as np
                spk_lower = speaker.lower()
                char_info = (
                    manifest.get("characters", {{}}).get(seg.get("character_id"))
                    or manifest.get("characters", {{}}).get(speaker, {{}})
                )
                v_name = (char_info.get("voice_name") or "").lower()

                if spk_lower == "narrator":
                    kokoro_voice = "bm_fable"
                elif "system" in spk_lower:
                    kokoro_voice = "af_heart"
                elif "deculein" in spk_lower or "woojin" in spk_lower or "mc" in v_name or "main character" in v_name:
                    kokoro_voice = "am_adam"
                elif gender == "female":
                    fem_palette = ["af_sarah", "af_bella", "af_nicole", "af_sky", "bf_emma", "bf_isabella"]
                    kokoro_voice = fem_palette[abs(hash(speaker)) % len(fem_palette)]
                else:
                    male_palette = ["am_michael", "am_echo", "am_eric", "am_liam", "am_onyx", "bm_george", "bm_daniel"]
                    kokoro_voice = male_palette[abs(hash(speaker)) % len(male_palette)]

                samples, sr = kokoro_model.create(clean_text, voice=kokoro_voice, speed=1.0, lang="en-us")
                audio_int16 = (np.clip(samples, -1.0, 1.0) * 32767).astype(np.int16)
                seg_frames.extend(audio_int16.tobytes())
                dur_ms = max(dur_ms, int((len(samples) / float(sr)) * 1000))
            except Exception as exc:
                print(f"Kokoro segment synthesis notice for '{{speaker}}':", exc)

        # 3. Resilient vocal safeguard fallback if both Chatterbox and Kokoro are empty
        if not seg_frames and clean_text:
            num_samples = int(sample_rate * dur_sec)
            samples = []
            f0 = 135.0 if gender != "female" else 215.0
            for i in range(num_samples):
                t = i / float(sample_rate)
                env = 0.5 + 0.5 * math.sin(2.0 * math.pi * 3.5 * t)
                val = int(8000 * env * (0.6 * math.sin(2.0 * math.pi * f0 * t) + 0.4 * math.sin(2.0 * math.pi * 2.0 * f0 * t)))
                samples.append(max(-32768, min(32767, val)))
            seg_frames.extend(struct.pack(f"<{{len(samples)}}h", *samples))

        if voice_filter_id and seg_frames and not cache_hit:
            seg_frames = bytearray(apply_voice_filter(bytes(seg_frames), voice_filter_id, sample_rate))

        def _get_cue_pcm(cue_obj):
            s_id = cue_obj.get("sfx_id")
            if s_id and s_id in local_sfx_pcm:
                return local_sfx_pcm[s_id]
            s_name = cue_obj.get("sfx_name") or cue_obj.get("name") or ""
            clean_n = re.sub(r'[^a-zA-Z0-9]', '', s_name).lower()
            if clean_n and clean_n in local_sfx_by_name:
                return local_sfx_by_name[clean_n]
            for k_name, pcm_data in local_sfx_by_name.items():
                if k_name and clean_n and (k_name in clean_n or clean_n in k_name):
                    return pcm_data
            return None

        def _scale_pcm_np(pcm_bytes, vol):
            if vol == 1.0 or not pcm_bytes:
                return pcm_bytes
            import numpy as np
            arr = np.frombuffer(pcm_bytes, dtype=np.int16).astype(np.float32)
            return np.clip(arr * vol, -32768, 32767).astype(np.int16).tobytes()

        final_seg_pcm = bytearray()
        if cache_hit:
            final_seg_pcm.extend(seg_frames)
        else:
            import numpy as np
            # 1. Mix any 'alongside' Foley cues at their proportional character offset over speech PCM
            speech_pcm_bytes = bytes(seg_frames)
            if speech_pcm_bytes:
                alongside_cues = [c for c in sfx_cues if c.get("action") == "alongside"]
                if alongside_cues:
                    speech_arr = np.frombuffer(speech_pcm_bytes, dtype=np.int16).astype(np.int32).copy()
                    max_len = len(speech_arr)
                    cue_layers = []
                    for cue in alongside_cues:
                        vol = float(cue.get("volume", 0.7) or 0.7)
                        cue_pcm = _get_cue_pcm(cue)
                        if not cue_pcm:
                            fb_name = cue.get("sfx_name") or cue.get("name") or "thud"
                            cue_pcm = generate_procedural_foley(fb_name, duration_ms=750, volume=vol, sample_rate=sample_rate)
                            vol = 1.0
                        cue_arr = (np.frombuffer(cue_pcm, dtype=np.int16).astype(np.float32) * vol).astype(np.int32)
                        offset_ratio = compute_alongside_offset_ratio(raw_text, cue.get("target_text"))
                        offset_samples = int(len(speech_arr) * offset_ratio)
                        # Allow up to 1.5s natural SFX ring-out past speech end
                        end_pos = min(len(speech_arr) + int(sample_rate * 1.5), offset_samples + len(cue_arr))
                        max_len = max(max_len, end_pos)
                        cue_layers.append((offset_samples, cue_arr[: max(0, end_pos - offset_samples)]))
                    if max_len > len(speech_arr):
                        padded = np.zeros(max_len, dtype=np.int32)
                        padded[: len(speech_arr)] = speech_arr
                        speech_arr = padded
                    for off, c_arr in cue_layers:
                        if len(c_arr) > 0:
                            speech_arr[off : off + len(c_arr)] += c_arr
                    speech_pcm_bytes = np.clip(speech_arr, -32768, 32767).astype(np.int16).tobytes()

            # 2. Inline splice 'replace' Foley cues (default action) at exact position in sentence
            replace_cues = [c for c in sfx_cues if (c.get("action") or "replace") == "replace"]
            if replace_cues:
                gap_bytes = b"\\x00" * int(sample_rate * 0.05 * 2)
                tokens = split_text_for_inline_foley(raw_text, replace_cues)
                sfx_tokens = [t for t in tokens if t["type"] == "sfx"]
                if not speech_pcm_bytes:
                    for idx_t, tok in enumerate(sfx_tokens):
                        cue = tok["cue"]
                        vol = float(cue.get("volume", 1.0) or 1.0)
                        cue_pcm = _get_cue_pcm(cue)
                        if cue_pcm:
                            final_seg_pcm.extend(_scale_pcm_np(cue_pcm, vol))
                        else:
                            fb_name = cue.get("sfx_name") or cue.get("name") or cue.get("target_text") or "thud"
                            final_seg_pcm.extend(generate_procedural_foley(fb_name, duration_ms=750, volume=vol, sample_rate=sample_rate))
                        if idx_t < len(sfx_tokens) - 1:
                            final_seg_pcm.extend(gap_bytes)
                else:
                    speech_arr = np.frombuffer(speech_pcm_bytes, dtype=np.int16)
                    cursor_sample = 0
                    for tok in sfx_tokens:
                        cue = tok["cue"]
                        ratio = float(tok.get("position_ratio", 0.0))
                        approx_sample = int(len(speech_arr) * ratio)
                        split_sample = (
                            0 if ratio <= 0.02
                            else (len(speech_arr) if ratio >= 0.98 else _find_low_energy_split_sample(speech_arr, approx_sample, sample_rate))
                        )
                        split_sample = max(cursor_sample, min(len(speech_arr), split_sample))
                        if split_sample > cursor_sample:
                            final_seg_pcm.extend(speech_arr[cursor_sample:split_sample].tobytes())
                            final_seg_pcm.extend(gap_bytes)
                        vol = float(cue.get("volume", 1.0) or 1.0)
                        cue_pcm = _get_cue_pcm(cue)
                        if cue_pcm:
                            final_seg_pcm.extend(_scale_pcm_np(cue_pcm, vol))
                        else:
                            fb_name = cue.get("sfx_name") or cue.get("name") or cue.get("target_text") or "thud"
                            final_seg_pcm.extend(generate_procedural_foley(fb_name, duration_ms=750, volume=vol, sample_rate=sample_rate))
                        cursor_sample = split_sample
                        if cursor_sample < len(speech_arr):
                            final_seg_pcm.extend(gap_bytes)
                    if cursor_sample < len(speech_arr):
                        final_seg_pcm.extend(speech_arr[cursor_sample:].tobytes())
            elif speech_pcm_bytes:
                final_seg_pcm.extend(speech_pcm_bytes)

            # 3. Append any explicit 'after' Foley cues
            for cue in sfx_cues:
                if cue.get("action") == "after":
                    vol = float(cue.get("volume", 1.0) or 1.0)
                    if final_seg_pcm:
                        final_seg_pcm.extend(b"\\x00" * int(sample_rate * 0.05 * 2))
                    cue_pcm = _get_cue_pcm(cue)
                    if cue_pcm:
                        final_seg_pcm.extend(_scale_pcm_np(cue_pcm, vol))
                    else:
                        fb_name = cue.get("sfx_name") or cue.get("name") or "thud"
                        final_seg_pcm.extend(generate_procedural_foley(fb_name, duration_ms=750, volume=vol, sample_rate=sample_rate))

        if not final_seg_pcm:
            final_seg_pcm.extend(b"\\x00" * int(sample_rate * 0.3 * 2))

        dur_ms = int((len(final_seg_pcm) / 2 / float(sample_rate)) * 1000)
        full_audio_frames.extend(final_seg_pcm)

        start_ms = current_ms
        end_ms = start_ms + dur_ms

        if not seg.get("is_chapter_title"):
            seg_take_key = f"projects/{project_id}/audio/takes/" + str(seg_id) + ".wav"
            seg_audio_url = f"{r2_endpoint}/{r2_bucket}/" + seg_take_key if "{r2_endpoint}" else None

            seg_wav_buf = io.BytesIO()
            with wave.open(seg_wav_buf, "wb") as wf:
                wf.setnchannels(1)
                wf.setsampwidth(2)
                wf.setframerate(sample_rate)
                wf.writeframes(final_seg_pcm)
            seg_wav_bytes = seg_wav_buf.getvalue()

            # Submit take and receipt asynchronously to upload bus (0ms stall on generation loop)
            seg_receipt_key = f"jobs/{job_id}/segments/" + str(seg_id) + ".json"
            seg_receipt_data = {{
                "job_id": "{job_id}",
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
            }}
            seg_receipt_bytes = json.dumps(seg_receipt_data).encode("utf-8")
            new_cache_key = cache_key if (cache_key and not cache_hit) else None
            if new_cache_key:
                existing_cache_keys.add(new_cache_key)
            chapter_upload_futures.append(
                upload_pool.submit(_async_upload_segment, seg_take_key, seg_wav_bytes, seg_receipt_key, seg_receipt_bytes, new_cache_key)
            )

            alignments.append({{
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
            }})

        # Inter-segment silence padding (900ms after chapter title intro, 300ms between segments)
        pause_after_ms = int(seg.get("pause_after_ms") or (900 if seg.get("is_chapter_title") else 300))
        current_ms = end_ms + pause_after_ms
        full_audio_frames.extend(b"\\x00" * (int(sample_rate * (pause_after_ms / 1000.0)) * 2))

    # Overlay Scene Atmosphere Beds across chapter timeline using vectorized NumPy (100-500x faster, 14x less RAM)
    atmo_spans = build_atmosphere_spans(alignments)
    if atmo_spans and full_audio_frames:
        import numpy as np
        master_arr = np.frombuffer(bytes(full_audio_frames), dtype=np.int16).astype(np.int32).copy()
        total_samples = len(master_arr)
        for span in atmo_spans:
            atmo_id = span.get("atmosphere_id")
            name = span.get("atmosphere_name", "Atmosphere")
            vol = float(span.get("volume", 0.15) or 0.15)
            s_ms = span.get("start_ms", 0)
            e_ms = span.get("end_ms", s_ms + 1000)
            d_ms = max(500, e_ms - s_ms)
            start_i = int(sample_rate * (s_ms / 1000.0))
            if start_i >= total_samples:
                continue
            num_span_samples = int(sample_rate * (d_ms / 1000.0))

            atmo_pcm = local_sfx_pcm.get(atmo_id) if atmo_id else None
            if not atmo_pcm and name:
                clean_atmo = re.sub(r'[^a-zA-Z0-9]', '', name).lower()
                atmo_pcm = local_sfx_by_name.get(clean_atmo)

            if atmo_pcm and len(atmo_pcm) >= 2:
                raw_arr = np.frombuffer(atmo_pcm, dtype=np.int16)
                repeats = int(math.ceil(num_span_samples / float(len(raw_arr))))
                tiled = np.tile(raw_arr, repeats)[:num_span_samples]
                amb_arr = (tiled.astype(np.float32) * vol).astype(np.int32)
            else:
                amb_arr = generate_procedural_atmosphere(name, duration_ms=d_ms, volume=vol, sample_rate=sample_rate).astype(np.int32)
            mix_len = min(len(amb_arr), total_samples - start_i)
            master_arr[start_i:start_i + mix_len] += amb_arr[:mix_len]
        full_audio_frames = bytearray(np.clip(master_arr, -32768, 32767).astype(np.int16).tobytes())

    total_duration_sec = max(1, current_ms // 1000)

    # Flush all segment take uploads for this chapter BEFORE writing chapter completion receipt
    for fut in chapter_upload_futures:
        try:
            fut.result(timeout=30)
        except Exception as exc:
            print("Notice waiting for chapter upload future:", exc)
    chapter_upload_futures.clear()

    # Upload stitched master audio to R2 if frames present
    chapter_audio_url = None
    audio_key = None
    if full_audio_frames and s3:
        try:
            wav_buf = io.BytesIO()
            with wave.open(wav_buf, "wb") as wf:
                wf.setnchannels(1)
                wf.setsampwidth(2)
                wf.setframerate(sample_rate)
                wf.writeframes(full_audio_frames)
            audio_key = f"projects/{project_id}/audio/ch_{{ch_num}}_{job_id[:8]}.wav"
            s3.put_object(
                Bucket=R2_BUCKET,
                Key=audio_key,
                Body=wav_buf.getvalue(),
                ContentType="audio/wav",
            )
            chapter_audio_url = f"{r2_endpoint}/{r2_bucket}/{{audio_key}}" if "{r2_endpoint}" else None
            print(f"Uploaded master chapter audio to R2: {{audio_key}}")
        except Exception as exc:
            print(f"Error uploading master audio for Chapter {{ch_num}}:", exc)

    # Write completion receipt to R2
    from datetime import timezone
    receipt_key = f"jobs/{job_id}/receipts/ch_{{ch_num}}_complete.json"
    receipt_data = {{
        "job_id": "{job_id}",
        "chapter_number": ch_num,
        "chapter_id": ch.get("id"),
        "status": "complete",
        "duration_seconds": total_duration_sec,
        "tts_model": "{tts_model}",
        "audio_key": audio_key,
        "alignments": alignments,
        "audio_url": chapter_audio_url,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }}

    if s3:
        try:
            s3.put_object(
                Bucket=R2_BUCKET,
                Key=receipt_key,
                Body=json.dumps(receipt_data, indent=2),
                ContentType="application/json",
            )
            print(f"Uploaded receipt for Chapter {{ch_num}} to R2: {{receipt_key}}")
        except Exception as exc:
            print(f"Error uploading receipt for Chapter {{ch_num}}:", exc)

    import gc
    del full_audio_frames
    gc.collect()
    try:
        import torch as _t_gc
        if _t_gc.cuda.is_available():
            _t_gc.cuda.empty_cache()
    except Exception:
        pass

# Ensure any remaining background uploads are flushed before teardown
for fut in upload_futures:
    try:
        fut.result(timeout=10)
    except Exception as exc:
        print("Notice waiting for upload future:", exc)
upload_pool.shutdown(wait=True)

print("\\nAll manifest chapters processed successfully!")
print("Zero-waste quota optimization: terminating GPU session worker immediately.")
sys.exit(0)
'''


def format_chapter_title_intro(chapter_number: int, title: str | None) -> str:
    """Format spoken chapter header with spoken English number ('Chapter six hundred and seventy: With Kid Gloves')."""
    spoken_num = int_to_english(chapter_number)
    clean_title = (title or "").strip()
    if not clean_title:
        return f"Chapter {spoken_num}."
    m = re.match(r"^chapter\s+\d+\s*[:\-–—.]?\s*(.*)$", clean_title, flags=re.IGNORECASE)
    if m:
        rest = m.group(1).strip()
        return f"Chapter {spoken_num}: {rest}" if rest else f"Chapter {spoken_num}."
    return f"Chapter {spoken_num}: {clean_title}"


def scale_narrator_emotion_profile(
    emotion_profile: dict[str, Any] | None,
    speaker: str | None,
    delivery_type: str | None,
    scale: float = 0.55,
    narrator_speed: float = 1.2,
) -> dict[str, Any] | None:
    """Keep Narrator delivery natural and relaxed (no forced word-pressing) at 1.2x speed while keeping dialogue untouched."""
    is_narrator = (
        (speaker or "").strip().lower() == "narrator"
        or (delivery_type or "").strip().lower() == "narration"
    )
    if not is_narrator:
        return emotion_profile

    ep = dict(emotion_profile) if isinstance(emotion_profile, dict) else {}
    raw_vec = ep.get("vector")
    has_active_emotion = isinstance(raw_vec, list) and len(raw_vec) == 8 and max(float(v) for v in raw_vec[:7]) >= 0.15
    if has_active_emotion:
        ep["vector"] = [round(float(v) * scale, 3) for v in raw_vec[:7]] + [0.0]
        raw_alpha = float(ep.get("emo_alpha", 0.22))
        ep["emo_alpha"] = round(min(raw_alpha * scale, 0.18), 3)
    else:
        # Pure natural reference prosody — never push an artificial calm vector that makes IndexTTS 2.5 press words
        ep["vector"] = None
        ep["emo_alpha"] = 0.0

    ep["narrator_speed"] = narrator_speed
    ep["_narrator_scaled"] = True
    return ep


class KaggleWorkerService:
    @staticmethod
    def get_user_tts_model(user: UserModel) -> str:
        """Resolve the user's preferred Stage C TTS model with chatterbox-turbo as primary default."""
        model = getattr(user, "preferred_tts_model", "chatterbox-turbo") or "chatterbox-turbo"
        clean = model.strip().lower()
        if clean in ("cosyvoice-3", "cosyvoice3", "cosyvoice", "fun-cosyvoice3"):
            return "cosyvoice-3"
        if clean in ("indextts-2.5", "indextts2.5", "indextts25", "indextts"):
            return "indextts-2.5"
        if clean in ("kokoro-82m", "kokoro"):
            return "kokoro-82m"
        if clean in ("system-native", "native", "local"):
            return "system-native"
        return "chatterbox-turbo"

    @classmethod
    async def create_job_manifest(
        cls,
        project: ProjectModel,
        chapter: ChapterModel | None = None,
        tts_model: str = "chatterbox-turbo",
        job_id: str = "",
        chapters: list[ChapterModel] | None = None,
        lane_index: int = 0,
    ) -> dict[str, Any]:
        """Create and write the Stage C audio job manifest to Cloudflare R2."""
        # Collect character voice configurations and custom voice reference URLs
        proj_settings = getattr(project, "settings", {}) or {}
        def_male_id = proj_settings.get("default_male_voice_id")
        def_male_name = proj_settings.get("default_male_voice_name")
        def_female_id = proj_settings.get("default_female_voice_id")
        def_female_name = proj_settings.get("default_female_voice_name")

        from app.db.session import get_session_factory
        from app.models.character import CharacterModel
        from app.models.sfx import SFXModel
        from app.models.voice import VoiceModel
        from sqlalchemy import or_, select
        from sqlalchemy.orm import attributes

        char_list: list[Any] = []
        try:
            if attributes.instance_state(project).attrs.characters.loaded_value is not attributes.NO_VALUE:
                char_list = list(project.characters)
        except Exception:
            pass

        sfx_list: list[Any] = []
        try:
            if attributes.instance_state(project).attrs.sfx_items.loaded_value is not attributes.NO_VALUE:
                sfx_list = list(project.sfx_items)
        except Exception:
            pass

        if (not char_list or not sfx_list) and getattr(project, "id", None):
            factory = get_session_factory()
            async with factory() as session:
                if not char_list:
                    c_res = await session.execute(
                        select(CharacterModel).where(CharacterModel.project_id == project.id).order_by(CharacterModel.name)
                    )
                    char_list = list(c_res.scalars().all())
                if not sfx_list:
                    s_res = await session.execute(
                        select(SFXModel).where(
                            or_(
                                SFXModel.project_id == project.id,
                                SFXModel.is_global.is_(True),
                                SFXModel.project_id.is_(None),
                            )
                        ).order_by(SFXModel.created_at.desc())
                    )
                    sfx_list = list(s_res.scalars().all())

        characters_map: dict[str, Any] = {}
        for char in char_list:
            v_id = char.assigned_voice_id
            v_name = char.assigned_voice_name
            if not v_id and not getattr(char, "is_system", False) and char.name.lower() != "narrator":
                if (char.gender or "").lower() == "female" and def_female_id:
                    v_id = def_female_id
                    v_name = def_female_name
                elif def_male_id:
                    v_id = def_male_id
                    v_name = def_male_name

            c_data = {
                "id": char.id,
                "gender": char.gender,
                "voice_id": v_id,
                "voice_name": v_name,
                "voice_filter_id": getattr(char, "voice_filter_id", None),
            }
            characters_map[char.name] = c_data
            if char.id:
                characters_map[char.id] = c_data

        target_chapters = chapters if chapters is not None else ([chapter] if chapter else [])

        # Collect only speakers, character IDs, and SFX actually referenced by target_chapters
        used_speakers: set[str] = set()
        used_char_ids: set[str] = set()
        referenced_sfx_ids: set[str] = set()
        referenced_sfx_names: set[str] = set()
        for ch in target_chapters:
            for s in (ch.segments or []):
                if getattr(s, "speaker", None):
                    used_speakers.add(s.speaker)
                if getattr(s, "character_id", None):
                    used_char_ids.add(s.character_id)
                if getattr(s, "atmosphere_id", None):
                    referenced_sfx_ids.add(s.atmosphere_id)
                if getattr(s, "atmosphere_name", None):
                    referenced_sfx_names.add(str(s.atmosphere_name).strip().lower())
                for cue in (getattr(s, "sfx_cues", None) or []):
                    if cue.get("sfx_id"):
                        referenced_sfx_ids.add(cue["sfx_id"])
                    c_name = cue.get("sfx_name") or cue.get("name")
                    if c_name:
                        referenced_sfx_names.add(str(c_name).strip().lower())

        custom_voices_map: dict[str, Any] = {}
        referenced_voice_ids: set[str] = set()
        for c_key, cinfo in characters_map.items():
            if not cinfo.get("voice_id"):
                continue
            if not target_chapters or c_key in used_speakers or c_key in used_char_ids or c_key == "Narrator":
                referenced_voice_ids.add(cinfo["voice_id"])
        if def_male_id:
            referenced_voice_ids.add(def_male_id)
        if def_female_id:
            referenced_voice_ids.add(def_female_id)

        try:
            factory = get_session_factory()
            async with factory() as session:
                if referenced_voice_ids:
                    v_res = await session.execute(
                        select(VoiceModel).where(VoiceModel.id.in_(referenced_voice_ids))
                    )
                    all_voices = v_res.scalars().all()
                else:
                    # Fallback if no voices explicitly assigned yet: load only project voices (not all global/user voices)
                    v_res = await session.execute(
                        select(VoiceModel).where(VoiceModel.project_id == project.id).limit(10)
                    )
                    all_voices = v_res.scalars().all()
                for v in all_voices:
                    audio_url = presign_r2_url_or_key(v.audio_storage_key)
                    custom_voices_map[v.id] = {
                        "id": v.id,
                        "name": v.name,
                        "gender": v.gender,
                        "audio_url": audio_url,
                        "audio_storage_key": v.audio_storage_key,
                        "updated_at": v.updated_at.isoformat() if getattr(v, "updated_at", None) else None,
                        "reference_text": v.reference_text,
                    }
        except Exception as exc:
            logger.warning("Could not query voices from DB for manifest: %s. Using project.voices fallback.", exc)
            v_list: list[Any] = []
            try:
                if attributes.instance_state(project).attrs.voices.loaded_value is not attributes.NO_VALUE:
                    v_list = list(project.voices)
            except Exception:
                pass
            for v in v_list:
                if referenced_voice_ids and v.id not in referenced_voice_ids:
                    continue
                audio_url = presign_r2_url_or_key(v.audio_storage_key)
                custom_voices_map[v.id] = {
                    "id": v.id,
                    "name": v.name,
                    "gender": v.gender,
                    "audio_url": audio_url,
                    "reference_text": v.reference_text,
                }

        sfx_library_map: dict[str, Any] = {}
        for item in sfx_list:
            item_name_l = (item.name or "").strip().lower()
            if (
                not target_chapters
                or item.id in referenced_sfx_ids
                or (item_name_l and item_name_l in referenced_sfx_names)
            ):
                sfx_library_map[item.id] = {
                    "id": item.id,
                    "name": item.name,
                    "category": item.category,
                    "audio_url": presign_r2_url_or_key(item.audio_storage_key),
                    "duration_seconds": item.duration_seconds,
                    "default_volume": item.default_volume,
                }

        missing_sfx_ids = referenced_sfx_ids - set(sfx_library_map.keys())
        if missing_sfx_ids:
            try:
                from app.db.session import get_session_factory
                from app.models.sfx import SFXModel

                factory = get_session_factory()
                async with factory() as session:
                    res = await session.execute(
                        select(SFXModel).where(SFXModel.id.in_(missing_sfx_ids))
                    )
                    for item in res.scalars():
                        sfx_library_map[item.id] = {
                            "id": item.id,
                            "name": item.name,
                            "category": item.category,
                            "audio_url": presign_r2_url_or_key(item.audio_storage_key),
                            "duration_seconds": item.duration_seconds,
                            "default_volume": item.default_volume,
                        }
            except Exception as exc:
                logger.warning("Could not query global sfx items for manifest: %s", exc)

        # Fetch active pronunciation rules for project
        from app.models.pronunciation import PronunciationRuleModel
        from app.services.pronunciation import PronunciationService
        import re
        project_pron_rules = []
        try:
            from app.db.session import get_session_factory
            factory = get_session_factory()
            async with factory() as session:
                pron_stmt = (
                    select(PronunciationRuleModel)
                    .where(PronunciationRuleModel.project_id == project.id, PronunciationRuleModel.is_active == True)
                )
                project_pron_rules = list((await session.execute(pron_stmt)).scalars().all())
        except Exception as exc:
            logger.warning("Could not query pronunciation rules for manifest: %s", exc)

        import hashlib

        manifest_chapters = []
        narrator_info = characters_map.get("Narrator", {})
        narrator_voice_id = narrator_info.get("voice_id")
        narrator_voice_name = narrator_info.get("voice_name")
        narrator_voice_meta = custom_voices_map.get(narrator_voice_id) or {}
        narrator_voice_ref_version = (
            f"{narrator_voice_meta.get('audio_storage_key') or ''}|{narrator_voice_meta.get('updated_at') or ''}"
            if narrator_voice_id
            else None
        )

        for ch in target_chapters:
            sorted_segs = sorted(ch.segments or [], key=lambda s: s.order_index)
            manifest_segments = []

            # Prepend spoken chapter intro ("Chapter X: Chapter title") unless segment 0 already announces it
            intro_text = format_chapter_title_intro(ch.chapter_number, ch.title)
            if project_pron_rules:
                intro_text = PronunciationService.apply_rules_to_text(intro_text, project_pron_rules, None)
            first_seg_text = (sorted_segs[0].text or "").strip() if sorted_segs else ""
            already_has_intro = bool(
                re.match(rf"^chapter\s+{ch.chapter_number}\b", first_seg_text, flags=re.IGNORECASE)
            )
            if intro_text and not already_has_intro:
                intro_emotion_profile = {
                    "label": "neutral",
                    "vector": None,
                    "emo_alpha": 0.0,
                    "duration_factor": 1.0,
                    "narrator_speed": 1.2,
                    "_narrator_scaled": True,
                }
                intro_hash = build_segment_take_cache_hash(
                    text=intro_text,
                    tts_model=tts_model,
                    voice_id=narrator_voice_id,
                    voice_ref_version=narrator_voice_ref_version,
                    speaker_gender="male",
                    emotion="calm",
                    emotion_profile=intro_emotion_profile,
                    voice_filter_id=None,
                    sfx_cues=[],
                )
                manifest_segments.append(
                    {
                        "id": f"__chapter_title_{ch.id}",
                        "order_index": -1,
                        "text": intro_text,
                        "speaker": "Narrator",
                        "speaker_gender": "male",
                        "delivery_type": "narration",
                        "emotion": "calm",
                        "emotion_profile": intro_emotion_profile,
                        "voice_id": narrator_voice_id,
                        "voice_name": narrator_voice_name,
                        "voice_filter_id": None,
                        "sfx_cues": [],
                        "atmosphere_id": None,
                        "atmosphere_name": None,
                        "atmosphere_volume": None,
                        "is_chapter_title": True,
                        "pause_after_ms": 900,
                        "content_hash": intro_hash,
                        "cache_key": f"projects/{project.id}/audio/cache/{intro_hash}.wav",
                    }
                )

            for s in sorted_segs:
                raw_text = s.text or ""
                # Strip leading dashes and apply active pronunciation rules
                raw_text = re.sub(r"^[—–\-─\s]+", "", raw_text).strip()
                if project_pron_rules:
                    raw_text = PronunciationService.apply_rules_to_text(raw_text, project_pron_rules, s.id)
                raw_text = re.sub(r"^[—–\-─\s]+", "", raw_text).strip()

                seg_voice_id = characters_map.get(s.speaker, {}).get("voice_id")
                seg_voice_meta = custom_voices_map.get(seg_voice_id) or {}
                voice_ref_version = (
                    f"{seg_voice_meta.get('audio_storage_key') or ''}|{seg_voice_meta.get('updated_at') or ''}"
                    if seg_voice_id
                    else None
                )
                seg_filter_id = s.voice_filter_id or characters_map.get(s.speaker, {}).get("voice_filter_id")
                seg_sfx = s.sfx_cues or []
                seg_emotion_profile = scale_narrator_emotion_profile(
                    getattr(s, "emotion_profile", None),
                    speaker=s.speaker,
                    delivery_type=s.delivery_type,
                )
                content_hash = build_segment_take_cache_hash(
                    text=raw_text,
                    tts_model=tts_model,
                    voice_id=seg_voice_id,
                    voice_ref_version=voice_ref_version,
                    speaker_gender=s.speaker_gender or "male",
                    emotion=s.emotion,
                    emotion_profile=seg_emotion_profile,
                    voice_filter_id=seg_filter_id,
                    sfx_cues=seg_sfx,
                )
                cache_key = f"projects/{project.id}/audio/cache/{content_hash}.wav"

                manifest_segments.append(
                    {
                        "id": s.id,
                        "order_index": s.order_index,
                        "text": raw_text,
                        "speaker": s.speaker,
                        "speaker_gender": s.speaker_gender or "male",
                        "delivery_type": s.delivery_type or "dialogue",
                        "emotion": s.emotion,
                        "emotion_profile": seg_emotion_profile,
                        "voice_id": seg_voice_id,
                        "voice_name": characters_map.get(s.speaker, {}).get("voice_name"),
                        "voice_filter_id": seg_filter_id,
                        "sfx_cues": seg_sfx,
                        "atmosphere_id": s.atmosphere_id,
                        "atmosphere_name": s.atmosphere_name,
                        "atmosphere_volume": s.atmosphere_volume,
                        "content_hash": content_hash,
                        "cache_key": cache_key,
                    }
                )
            manifest_chapters.append(
                {
                    "id": ch.id,
                    "chapter_number": ch.chapter_number,
                    "title": ch.title,
                    "segments": manifest_segments,
                }
            )

        manifest = {
            "job_id": job_id,
            "project_id": project.id,
            "project_title": project.title,
            "tts_model": tts_model,
            "lane_index": lane_index,
            "created_at": datetime.now(UTC).isoformat(),
            "default_male_voice_id": def_male_id,
            "default_female_voice_id": def_female_id,
            "narrator_voice_id": characters_map.get("Narrator", {}).get("voice_id"),
            "characters": characters_map,
            "custom_voices": custom_voices_map,
            "sfx_library": sfx_library_map,
            "chapters": manifest_chapters,
        }


        # Upload manifest to R2 if configured
        s3 = get_s3_client()
        if s3 and settings.is_r2_configured:
            try:
                manifest_key = f"jobs/{job_id}/manifest.json"
                s3.put_object(
                    Bucket=settings.R2_BUCKET,
                    Key=manifest_key,
                    Body=json.dumps(manifest, indent=2).encode("utf-8"),
                    ContentType="application/json",
                )
                logger.info("Uploaded job manifest to R2: %s", manifest_key)
            except Exception as exc:
                logger.warning("Could not upload manifest to R2: %s", exc)

        return manifest

    @classmethod
    async def dispatch_worker(
        cls,
        user: UserModel,
        account: KaggleAccountModel,
        project: ProjectModel,
        chapter: ChapterModel | None = None,
        chapters: list[ChapterModel] | None = None,
        allow_dev_offline: bool = False,
        tts_model_override: str | None = None,
        lane_index: int = 0,
        cache_to_dataset: bool = True,
        job_id: str | None = None,
    ) -> dict[str, Any]:
        """Deploy and push Kaggle Session Worker notebook with Kokoro/Chatterbox model."""
        job_id = job_id or str(uuid.uuid4())
        tts_model = (tts_model_override.strip().lower() if tts_model_override else None) or cls.get_user_tts_model(user)

        target_chapters = chapters if chapters is not None else ([chapter] if chapter else [])

        # 1. Create manifest in R2
        await cls.create_job_manifest(
            project=project,
            chapter=chapter,
            tts_model=tts_model,
            job_id=job_id,
            chapters=target_chapters,
            lane_index=lane_index,
        )

        raw_key = decrypt_secret(account.encrypted_key)
        is_dummy = (
            raw_key.startswith("KGAT_testdummy")
            or "dummy" in raw_key.lower()
            or allow_dev_offline
            or tts_model == "system-native"
        )

        kernel_slug = f"noveler-session-{job_id[:8]}"
        kernel_ref = f"{account.username}/{kernel_slug}"

        if not is_dummy:
            # Deploy real kernel via Kaggle API
            with tempfile.TemporaryDirectory() as tmp_dir:
                script_content = build_kaggle_worker_script(
                    job_id=job_id,
                    project_id=project.id,
                    tts_model=tts_model,
                    r2_endpoint=settings.r2_effective_endpoint,
                    r2_bucket=settings.R2_BUCKET,
                    r2_access_key=settings.R2_ACCESS_KEY_ID,
                    r2_secret_key=settings.R2_SECRET_ACCESS_KEY,
                    cache_to_dataset=cache_to_dataset,
                )
                script_path = os.path.join(tmp_dir, "worker.py")
                with open(script_path, "w", encoding="utf-8") as f:
                    f.write(script_content)

                dataset_sources = []
                if cache_to_dataset:
                    ds_owner = getattr(settings, "KAGGLE_DATASET_NAMESPACE", None) or account.username
                    primary_ds = f"{ds_owner}/noveler-models"
                    if primary_ds not in dataset_sources:
                        dataset_sources.append(primary_ds)

                    if tts_model in ("chatterbox-turbo", "chatterbox"):
                        cb_ds = f"{ds_owner}/novelova-chatterbox"
                        if cb_ds not in dataset_sources:
                            dataset_sources.append(cb_ds)

                    from app.core.tts_catalog import get_model_spec
                    model_spec = get_model_spec(tts_model)
                    if model_spec.dataset_slug and model_spec.dataset_slug not in ("noveler-models", "novelova-runtime-core", "novelova-chatterbox"):
                        model_ds_ref = f"{ds_owner}/{model_spec.dataset_slug}"
                        if model_ds_ref not in dataset_sources:
                            dataset_sources.append(model_ds_ref)

                metadata = {
                    "id": kernel_ref,
                    "title": kernel_slug,
                    "code_file": "worker.py",
                    "language": "python",
                    "kernel_type": "script",
                    "is_private": True,
                    "enable_gpu": True,
                    "enable_internet": True,
                    "dataset_sources": dataset_sources,
                }
                meta_path = os.path.join(tmp_dir, "kernel-metadata.json")
                with open(meta_path, "w", encoding="utf-8") as f:
                    json.dump(metadata, f, indent=2)

                try:
                    # Authenticate Kaggle API client safely under process-wide lock
                    def _sync_push_kernel():
                        from app.core.kaggle_auth import kaggle_authenticated_api

                        with kaggle_authenticated_api(account.username, raw_key) as api:
                            api.kernels_push(tmp_dir)

                    await asyncio.to_thread(_sync_push_kernel)
                    logger.info("Successfully pushed Kaggle kernel %s to GPU queue", kernel_ref)
                except Exception as exc:
                    logger.error("Kaggle kernel push failed: %s", exc)
                    if allow_dev_offline:
                        logger.info("Falling back to local offline simulation (allow_dev_offline=True)")
                        asyncio.create_task(
                            cls._simulate_worker_execution(job_id, project, target_chapters, tts_model, account.id)
                        )
                    else:
                        raise AppError(
                            f"Failed to push GPU session worker to Kaggle (@{account.username}): {exc}",
                            "KAGGLE_DISPATCH_FAILED",
                        )
        else:
            # Offline / local dev simulation
            logger.info("Executing offline session worker simulation for Job %s with %d chapters", job_id, len(target_chapters))
            asyncio.create_task(
                cls._simulate_worker_execution(job_id, project, target_chapters, tts_model, account.id)
            )

        return {
            "job_id": job_id,
            "kernel_ref": kernel_ref,
            "tts_model": tts_model,
            "kaggle_account": account.username,
            "account_id": account.id,
            "lane_index": lane_index,
            "chapters_count": len(target_chapters),
            "status": "dispatched",
        }

    _in_memory_receipts: dict[str, dict[str, Any]] = {}

    @classmethod
    async def cancel_job(cls, job_id: str) -> bool:
        """Signal job worker to shutdown and terminate synthesis hot loop."""
        cls._in_memory_receipts[f"shutdown:{job_id}"] = {"status": "shutdown"}
        s3 = get_s3_client()
        if s3 and settings.is_r2_configured:
            try:
                shutdown_key = f"jobs/{job_id}/shutdown.json"
                s3.put_object(
                    Bucket=settings.R2_BUCKET,
                    Key=shutdown_key,
                    Body=json.dumps(
                        {"command": "shutdown", "job_id": job_id, "timestamp": datetime.now(UTC).isoformat()}
                    ).encode("utf-8"),
                    ContentType="application/json",
                )
                logger.info("Uploaded shutdown signal to R2: %s", shutdown_key)
                return True
            except Exception as exc:
                logger.warning("Could not upload shutdown signal to R2: %s", exc)
        return True

    @classmethod
    async def _simulate_worker_execution(
        cls,
        job_id: str,
        project: ProjectModel,
        chapters: list[ChapterModel] | ChapterModel,
        tts_model: str,
        account_id: str | None = None,
    ) -> None:
        """Simulate hot GPU worker synthesis in background for dev/offline verification."""
        await asyncio.sleep(0.5)
        chapter_list = chapters if isinstance(chapters, list) else [chapters]
        try:
            from app.db.session import get_session_factory
            from app.models.character import CharacterModel
            from app.services.speech import generate_segment_take_wav
            from sqlalchemy import inspect as sa_inspect

            s3 = get_s3_client()

            sim_char_list: list[Any] = []
            try:
                if "characters" not in sa_inspect(project).unloaded:
                    sim_char_list = list(project.characters)
            except Exception:
                pass
            if not sim_char_list and getattr(project, "id", None):
                factory = get_session_factory()
                async with factory() as session:
                    c_res = await session.execute(
                        select(CharacterModel).where(CharacterModel.project_id == project.id)
                    )
                    sim_char_list = list(c_res.scalars().all())

            for ch in chapter_list:
                # Check for shutdown signal
                if f"shutdown:{job_id}" in cls._in_memory_receipts:
                    logger.info("Simulated worker for job %s aborted due to shutdown signal.", job_id)
                    break

                alignments = []
                current_ms = 0
                full_wav_frames = bytearray()
                sorted_segs = sorted(ch.segments or [], key=lambda s: s.order_index)

                for s in sorted_segs:
                    if f"shutdown:{job_id}" in cls._in_memory_receipts:
                        break
                    char_obj = next((c for c in sim_char_list if c.name == s.speaker), None)
                    eff_filter = s.voice_filter_id or (char_obj.voice_filter_id if char_obj else None)
                    seg_bytes, dur_ms = generate_segment_take_wav(
                        s.text,
                        gender=s.speaker_gender or "male",
                        delivery_type=s.delivery_type or "dialogue",
                        emotion=s.emotion,
                        voice_filter_id=eff_filter,
                        sfx_cues=s.sfx_cues,
                    )
                    start_ms = current_ms
                    end_ms = start_ms + dur_ms
                    seg_take_key = f"projects/{project.id}/audio/takes/{s.id}.wav"

                    seg_audio_url: str | None = None
                    if s3 and settings.is_r2_configured:
                        try:
                            s3.put_object(
                                Bucket=settings.R2_BUCKET,
                                Key=seg_take_key,
                                Body=seg_bytes,
                                ContentType="audio/wav",
                            )
                            seg_audio_url = presign_r2_url_or_key(seg_take_key)
                        except Exception as exc:
                            logger.warning("Could not upload simulated segment take to R2: %s", exc)

                    if not seg_audio_url:
                        try:
                            factory = get_session_factory()
                            async with factory() as session:
                                _att, seg_audio_url = await AttachmentService.upload_bytes(
                                    content=seg_bytes,
                                    filename=f"take_{s.id[:8]}.wav",
                                    content_type="audio/wav",
                                    db=session,
                                )
                        except Exception as exc:
                            seg_audio_url = presign_r2_url_or_key(seg_take_key) or f"/api/v1/attachments/take_{s.id[:8]}.wav"

                    seg_receipt_data = {
                        "job_id": job_id,
                        "chapter_id": ch.id,
                        "chapter_number": ch.chapter_number,
                        "segment_id": s.id,
                        "order_index": s.order_index,
                        "start_ms": start_ms,
                        "end_ms": end_ms,
                        "duration_ms": dur_ms,
                        "storage_key": seg_take_key,
                        "audio_url": seg_audio_url,
                        "status": "complete",
                    }
                    cls._in_memory_receipts[f"job:{job_id}:seg:{s.id}"] = seg_receipt_data
                    cls._in_memory_receipts[f"seg:{job_id}:{s.id}"] = seg_receipt_data

                    if s3 and settings.is_r2_configured:
                        try:
                            s3.put_object(
                                Bucket=settings.R2_BUCKET,
                                Key=f"jobs/{job_id}/segments/{s.id}.json",
                                Body=json.dumps(seg_receipt_data).encode("utf-8"),
                                ContentType="application/json",
                            )
                        except Exception as exc:
                            logger.warning("Could not upload segment receipt to R2: %s", exc)

                    alignments.append({
                        "segment_id": s.id,
                        "order_index": s.order_index,
                        "start_ms": start_ms,
                        "end_ms": end_ms,
                        "duration_ms": dur_ms,
                        "storage_key": seg_take_key,
                        "audio_url": None,
                    })
                    current_ms = end_ms + 300

                    try:
                        with wave.open(io.BytesIO(seg_bytes), "rb") as wf:
                            full_wav_frames.extend(wf.readframes(wf.getnframes()))
                            full_wav_frames.extend(b"\x00" * 14400)
                    except Exception:
                        pass

                if f"shutdown:{job_id}" in cls._in_memory_receipts:
                    break

                total_duration_sec = max(1, current_ms // 1000)

                full_audio_url: str | None = None
                if full_wav_frames:
                    out_buf = io.BytesIO()
                    with wave.open(out_buf, "wb") as out_wf:
                        out_wf.setnchannels(1)
                        out_wf.setsampwidth(2)
                        out_wf.setframerate(24000)
                        out_wf.writeframes(full_wav_frames)
                    stitched_bytes = out_buf.getvalue()

                    # Apply scene atmosphere bed overlay if any segments have atmosphere
                    segments_timings = [
                        {
                            "segment_id": s.id,
                            "order_index": s.order_index,
                            "atmosphere_id": s.atmosphere_id,
                            "atmosphere_name": s.atmosphere_name,
                            "atmosphere_volume": s.atmosphere_volume,
                            "start_ms": a["start_ms"],
                            "end_ms": a["end_ms"],
                            "duration_ms": a["duration_ms"],
                        }
                        for s, a in zip(sorted_segs, alignments)
                    ]
                    from app.services.audio_effects import build_atmosphere_spans, overlay_atmosphere_to_master
                    atmo_spans = build_atmosphere_spans(segments_timings)
                    if atmo_spans:
                        stitched_bytes = overlay_atmosphere_to_master(
                            stitched_bytes,
                            atmo_spans,
                            sample_rate=24000,
                        )

                    if f"shutdown:{job_id}" not in cls._in_memory_receipts:
                        try:
                            factory = get_session_factory()
                            async with factory() as session:
                                _att, full_audio_url = await AttachmentService.upload_bytes(
                                    content=stitched_bytes,
                                    filename=f"ch_{ch.chapter_number}_{job_id[:8]}.wav",
                                    content_type="audio/wav",
                                    db=session,
                                )
                                ch_stmt = (
                                    select(ChapterModel)
                                    .where(ChapterModel.id == ch.id)
                                    .options(selectinload(ChapterModel.segments))
                                )
                                ch_obj = (await session.execute(ch_stmt)).scalar_one_or_none()
                                is_retake = (ch_obj.title or "").startswith("Retake:") if ch_obj else False
                                if ch_obj and not is_retake and f"shutdown:{job_id}" not in cls._in_memory_receipts:
                                    ch_obj.audio_url = full_audio_url
                                    ch_obj.audio_job_status = "complete"
                                    ch_obj.status = "complete"
                                    ch_obj.alignment_json = json.dumps(alignments)
                                    ch_obj.estimated_duration_seconds = total_duration_sec
                                    for seg in ch_obj.segments:
                                        seg.audio_status = "complete"
                                    await session.commit()
                        except Exception as exc:
                            logger.warning("Could not persist simulated audio to DB: %s", exc)

                receipt_data = {
                    "job_id": job_id,
                    "chapter_number": ch.chapter_number,
                    "chapter_id": ch.id,
                    "status": "complete",
                    "duration_seconds": total_duration_sec,
                    "tts_model": tts_model,
                    "audio_key": f"projects/{project.id}/audio/ch_{ch.chapter_number}_{job_id[:8]}.wav",
                    "alignments": alignments,
                    "audio_url": full_audio_url,
                    "timestamp": datetime.now(UTC).isoformat(),
                }

                cls._in_memory_receipts[f"{job_id}:{ch.chapter_number}"] = receipt_data

                s3 = get_s3_client()
                if s3 and settings.is_r2_configured:
                    receipt_key = f"jobs/{job_id}/receipts/ch_{ch.chapter_number}_complete.json"
                    s3.put_object(
                        Bucket=settings.R2_BUCKET,
                        Key=receipt_key,
                        Body=json.dumps(receipt_data, indent=2).encode("utf-8"),
                        ContentType="application/json",
                    )
                    logger.info("Simulated worker wrote completion receipt to R2: %s", receipt_key)

            # Reset account status to available after finishing all chapters
            if account_id:
                try:
                    factory = get_session_factory()
                    async with factory() as session:
                        acc_stmt = select(KaggleAccountModel).where(KaggleAccountModel.id == account_id)
                        acc_obj = (await session.execute(acc_stmt)).scalar_one_or_none()
                        if acc_obj and acc_obj.status == "in_use":
                            still_running_stmt = (
                                select(ChapterModel.id)
                                .where(
                                    ChapterModel.audio_account_used == acc_obj.username,
                                    ChapterModel.audio_job_status.in_(["generating", "queued"]),
                                )
                                .limit(1)
                            )
                            has_running = (await session.execute(still_running_stmt)).scalar_one_or_none()
                            if not has_running:
                                acc_obj.status = "available"
                                await session.commit()
                except Exception as exc:
                    logger.warning("Could not reset account %s status: %s", account_id, exc)

        except Exception as exc:
            logger.warning("Simulated worker failed: %s", exc)

    @classmethod
    def _sync_check_job_receipt(cls, job_id: str, chapter_number: int) -> dict[str, Any] | None:
        """Internal synchronous helper to poll R2 without blocking the asyncio loop."""
        mem_key = f"{job_id}:{chapter_number}"
        if mem_key in cls._in_memory_receipts:
            return cls._in_memory_receipts[mem_key]

        s3 = get_s3_client()
        if not s3 or not settings.is_r2_configured:
            return None

        receipt_key = f"jobs/{job_id}/receipts/ch_{chapter_number}_complete.json"
        try:
            obj = s3.get_object(Bucket=settings.R2_BUCKET, Key=receipt_key)
            data = json.loads(obj["Body"].read().decode("utf-8"))

            master_key = data.get("audio_key")
            if master_key:
                data["audio_url"] = get_cached_presigned_url(master_key, expires_in=86400)

            for item in data.get("alignments", []):
                storage_key = item.get("storage_key")
                if storage_key:
                    item["audio_url"] = get_cached_presigned_url(storage_key, expires_in=86400)

            cls._in_memory_receipts[mem_key] = data
            return data
        except Exception:
            return None

    @classmethod
    async def check_job_receipt(
        cls,
        job_id: str,
        chapter_number: int,
    ) -> dict[str, Any] | None:
        """Poll Cloudflare R2 or in-memory receipt bus for completed chapter receipt off the main loop."""
        return await asyncio.to_thread(cls._sync_check_job_receipt, job_id, chapter_number)

    @classmethod
    def _sync_check_segment_receipts(cls, job_id: str, project_id: str) -> dict[str, dict[str, Any]]:
        """Internal synchronous helper to poll segment receipts via worker thread."""
        results: dict[str, dict[str, Any]] = {}
        prefix_mem = f"seg:{job_id}:"
        for k, v in list(cls._in_memory_receipts.items()):
            if k.startswith(prefix_mem):
                seg_id = k[len(prefix_mem):]
                results[seg_id] = v

        s3 = get_s3_client()
        if not s3 or not settings.is_r2_configured:
            return results

        try:
            prefix_r2 = f"jobs/{job_id}/segments/"
            continuation_token: str | None = None
            while True:
                list_kwargs: dict[str, Any] = {
                    "Bucket": settings.R2_BUCKET,
                    "Prefix": prefix_r2,
                    "MaxKeys": 1000,
                }
                if continuation_token:
                    list_kwargs["ContinuationToken"] = continuation_token
                resp = s3.list_objects_v2(**list_kwargs)
                for item in resp.get("Contents", []):
                    key = item.get("Key", "")
                    if key.endswith(".json"):
                        seg_id = key.rsplit("/", 1)[-1][:-5]
                        if seg_id in results and results[seg_id].get("audio_url"):
                            continue
                        try:
                            obj = s3.get_object(Bucket=settings.R2_BUCKET, Key=key)
                            seg_data = json.loads(obj["Body"].read().decode("utf-8"))
                            storage_key = seg_data.get("storage_key") or f"projects/{project_id}/audio/takes/{seg_id}.wav"
                            seg_data["audio_url"] = get_cached_presigned_url(storage_key, expires_in=86400)

                            results[seg_id] = seg_data
                            if len(cls._in_memory_receipts) >= 5000:
                                # Evict oldest 1,000 entries to prevent unbounded memory growth
                                for old_k in list(cls._in_memory_receipts.keys())[:1000]:
                                    cls._in_memory_receipts.pop(old_k, None)
                            cls._in_memory_receipts[f"{prefix_mem}{seg_id}"] = seg_data
                        except Exception as err:
                            logger.warning("Error reading segment receipt %s: %s", key, err)
                if not resp.get("IsTruncated"):
                    break
                continuation_token = resp.get("NextContinuationToken")
        except Exception as exc:
            logger.warning("Error listing segment receipts for job %s: %s", job_id, exc)

        return results

    @classmethod
    async def check_segment_receipts(
        cls,
        job_id: str,
        project_id: str,
    ) -> dict[str, dict[str, Any]]:
        """Poll Cloudflare R2 or in-memory bus for progressive segment-level completion receipts off the main loop."""
        return await asyncio.to_thread(cls._sync_check_segment_receipts, job_id, project_id)

    @classmethod
    async def wait_for_segment_receipt(
        cls,
        job_id: str,
        project_id: str,
        segment_id: str,
        timeout_seconds: int = 90,
    ) -> dict[str, Any] | None:
        """Poll R2 or in-memory bus until the single-line segment take receipt is ready."""
        start_t = time.time()
        while time.time() - start_t < timeout_seconds:
            receipts = await cls.check_segment_receipts(job_id, project_id)
            if segment_id in receipts and receipts[segment_id].get("audio_url"):
                return receipts[segment_id]
            if segment_id in receipts and receipts[segment_id].get("storage_key"):
                take_key = receipts[segment_id]["storage_key"]
                receipts[segment_id]["audio_url"] = presign_r2_url_or_key(take_key)
                return receipts[segment_id]
            await asyncio.sleep(1.0)
        return None
