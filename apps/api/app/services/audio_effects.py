"""
Audio Effects & DSP Module
==========================
Handles audio signal processing for Noveler Stage C production:
- Voice Filters (robotic LitRPG, tactical radio, ethereal telepathic reverb, telephone, megaphone, whisper)
- Foley text replacement cleaning and audio splicing
- Scene-scoped Atmosphere (ambient sound bed) looping, smooth fading, and timeline overlay mixing
"""

import io
import math
import os
import re
import shutil
import struct
import subprocess
import tempfile
import wave
from typing import Any
from novelova_core.logging import setup_logger

logger = setup_logger("novelova.audio_effects")

# FFmpeg audio filter configurations for Voice Filter presets
VOICE_FILTER_FFMPEG_MAP: dict[str, str] = {
    "robotic": "chorus=0.7:0.9:55:0.4:0.25:2,aecho=0.8:0.88:15:0.5,atempo=0.98",
    "radio": "highpass=f=400,lowpass=f=3500,volume=1.2",
    "telepathic": "aecho=0.8:0.9:60:0.4,aecho=0.6:0.7:120:0.3",
    "telephone": "highpass=f=300,lowpass=f=3000,volume=1.1",
    "megaphone": "highpass=f=500,aecho=0.8:0.6:40:0.5,volume=1.3",
    "whisper": "equalizer=f=4000:t=h:w=1:g=4,volume=0.9",
}


def clean_text_for_foley_replacement(text: str, sfx_cues: list[dict[str, Any]] | None) -> str:
    """Remove target onomatopoeic words replaced by Foley sound effects so TTS skips reading them."""
    if not text or not sfx_cues:
        return text or ""

    result = text
    for cue in sfx_cues:
        if cue.get("action") == "replace":
            target = cue.get("target_text", "").strip()
            if target:
                # Remove word/phrase with optional surrounding punctuation
                pattern = re.compile(rf"\b{re.escape(target)}\b[!?.,;:—\-]*", re.IGNORECASE)
                result = pattern.sub("", result)

    # Clean up double spaces and dangling punctuation
    result = re.sub(r"\s+", " ", result).strip()
    result = re.sub(r"^[,;:\s—\-]+|[,;:\s—\-]+$", "", result).strip()
    return result


def apply_voice_filter_wav(
    wav_bytes: bytes,
    voice_filter_id: str | None,
    sample_rate: int = 24000,
) -> bytes:
    """Apply DSP voice filter preset to a 16-bit mono WAV audio stream.
    
    Uses host FFmpeg when available, or pure-Python digital signal processing fallback.
    """
    if not voice_filter_id or voice_filter_id not in VOICE_FILTER_FFMPEG_MAP:
        return wav_bytes

    filter_desc = VOICE_FILTER_FFMPEG_MAP[voice_filter_id]
    ffmpeg_bin = shutil.which("ffmpeg")

    if ffmpeg_bin:
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as in_file:
            in_path = in_file.name
            in_file.write(wav_bytes)

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as out_file:
            out_path = out_file.name

        try:
            cmd = [
                ffmpeg_bin,
                "-y",
                "-i", in_path,
                "-af", filter_desc,
                "-ar", str(sample_rate),
                "-ac", "1",
                "-c:a", "pcm_s16le",
                out_path,
            ]
            res = subprocess.run(cmd, capture_output=True, timeout=10)
            if res.returncode == 0 and os.path.exists(out_path) and os.path.getsize(out_path) > 44:
                with open(out_path, "rb") as f:
                    filtered_bytes = f.read()
                return filtered_bytes
            else:
                logger.warning("FFmpeg filter failed (%s): %s", voice_filter_id, res.stderr.decode("utf-8", errors="ignore")[:200])
        except Exception as exc:
            logger.warning("Error running FFmpeg voice filter %s: %s", voice_filter_id, exc)
        finally:
            if os.path.exists(in_path):
                os.remove(in_path)
            if os.path.exists(out_path):
                os.remove(out_path)

    # Pure Python DSP Fallback for environments without FFmpeg
    return apply_python_dsp_filter(wav_bytes, voice_filter_id, sample_rate)


def apply_python_dsp_filter(wav_bytes: bytes, voice_filter_id: str, sample_rate: int = 24000) -> bytes:
    """Lightweight pure-Python PCM audio DSP fallback when FFmpeg is not installed."""
    try:
        in_buf = io.BytesIO(wav_bytes)
        with wave.open(in_buf, "rb") as wf:
            n_channels = wf.getnchannels()
            sampwidth = wf.getsampwidth()
            framerate = wf.getframerate()
            n_frames = wf.getnframes()
            frames = wf.readframes(n_frames)

        if sampwidth != 2:
            return wav_bytes

        samples = list(struct.unpack(f"<{len(frames)//2}h", frames))
        out_samples = list(samples)
        num_samples = len(samples)

        if voice_filter_id == "robotic":
            # Metallic ring modulation with 65Hz carrier wave
            for i in range(num_samples):
                t = i / float(framerate)
                mod = 0.65 + 0.35 * math.sin(2.0 * math.pi * 65.0 * t)
                val = int(samples[i] * mod)
                out_samples[i] = max(-32768, min(32767, val))

        elif voice_filter_id in ("telepathic", "megaphone"):
            # Echo / Delay feedback
            delay_samples = int(framerate * 0.08)  # 80ms delay
            decay = 0.45
            for i in range(delay_samples, num_samples):
                val = int(samples[i] + out_samples[i - delay_samples] * decay)
                out_samples[i] = max(-32768, min(32767, val))

        elif voice_filter_id in ("radio", "telephone"):
            # Bandpass / Lowpass box-car smoothing
            window = 5
            for i in range(window, num_samples - window):
                val = sum(samples[i - window : i + window + 1]) // (window * 2 + 1)
                # Add slight analog clipping
                val = int(val * 1.3)
                out_samples[i] = max(-26000, min(26000, val))

        out_buf = io.BytesIO()
        with wave.open(out_buf, "wb") as out_wf:
            out_wf.setnchannels(n_channels)
            out_wf.setsampwidth(sampwidth)
            out_wf.setframerate(framerate)
            out_wf.writeframes(struct.pack(f"<{len(out_samples)}h", *out_samples))
        return out_buf.getvalue()
    except Exception as exc:
        logger.warning("Pure Python DSP filter failed: %s", exc)
        return wav_bytes


def generate_synthesized_foley_wav(
    cue_name: str,
    duration_ms: int = 700,
    volume: float = 1.0,
    sample_rate: int = 24000,
) -> bytes:
    """Synthesize an authentic acoustic foley waveform (boom, clank, sigh, chime) for testing & dev offline."""
    num_samples = int(sample_rate * (duration_ms / 1000.0))
    samples = []
    name_lower = cue_name.lower()

    if any(k in name_lower for k in ("boom", "blast", "explosion", "cannon", "thud")):
        # Low frequency resonant exponential decay thump (45Hz -> 20Hz)
        for i in range(num_samples):
            t = i / float(sample_rate)
            decay = math.exp(-t * 5.0)
            freq = 60.0 * math.exp(-t * 3.0)
            # Add subtle white noise transient at impact (first 25ms)
            noise = (math.sin(i * 1337.1) % 1.0 - 0.5) * 0.4 if t < 0.025 else 0.0
            val = int(30000 * volume * decay * (math.sin(2.0 * math.pi * freq * t) + noise))
            samples.append(max(-32768, min(32767, val)))

    elif any(k in name_lower for k in ("clank", "sword", "metal", "clang", "hit")):
        # Metallic clang: High resonant ringing harmonics (800Hz, 1420Hz, 2180Hz)
        for i in range(num_samples):
            t = i / float(sample_rate)
            decay = math.exp(-t * 8.0)
            harmonics = (
                0.5 * math.sin(2.0 * math.pi * 840.0 * t)
                + 0.3 * math.sin(2.0 * math.pi * 1420.0 * t)
                + 0.2 * math.sin(2.0 * math.pi * 2180.0 * t)
            )
            val = int(28000 * volume * decay * harmonics)
            samples.append(max(-32768, min(32767, val)))

    elif any(k in name_lower for k in ("sigh", "breath", "wind")):
        # Filtered pink noise / breath envelope
        for i in range(num_samples):
            t = i / float(sample_rate)
            # Bell curve envelope
            envelope = math.sin(math.pi * (t / (duration_ms / 1000.0)))
            noise = (math.sin(i * 997.3) % 1.0 - 0.5)
            val = int(14000 * volume * envelope * noise)
            samples.append(max(-32768, min(32767, val)))

    else:
        # Default crisp chime / cue tone (440Hz + 880Hz)
        for i in range(num_samples):
            t = i / float(sample_rate)
            decay = math.exp(-t * 6.0)
            tone = 0.7 * math.sin(2.0 * math.pi * 520.0 * t) + 0.3 * math.sin(2.0 * math.pi * 1040.0 * t)
            val = int(22000 * volume * decay * tone)
            samples.append(max(-32768, min(32767, val)))

    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(struct.pack(f"<{len(samples)}h", *samples))
    return buf.getvalue()


def generate_synthesized_atmosphere_wav(
    atmosphere_name: str,
    duration_ms: int = 5000,
    volume: float = 0.2,
    sample_rate: int = 24000,
) -> bytes:
    """Synthesize smooth looping ambient background beds (ocean waves, rain, tavern murmur, night wind)."""
    num_samples = int(sample_rate * (duration_ms / 1000.0))
    samples = []
    name_lower = atmosphere_name.lower()

    if any(k in name_lower for k in ("ocean", "wave", "sea", "water")):
        # Rolling rhythmic swells (period ~3.5s) with soft white surf noise
        period = 3.5
        for i in range(num_samples):
            t = i / float(sample_rate)
            swell = (math.sin(2.0 * math.pi * t / period) + 1.0) / 2.0
            noise = (math.sin(i * 311.7) % 1.0 - 0.5)
            val = int(18000 * volume * (0.3 + 0.7 * swell) * noise)
            samples.append(max(-32768, min(32767, val)))

    elif any(k in name_lower for k in ("rain", "storm")):
        # Dense pitter-patter rain noise with low-frequency rumble
        for i in range(num_samples):
            t = i / float(sample_rate)
            noise = (math.sin(i * 123.456) % 1.0 - 0.5)
            rumble = 0.3 * math.sin(2.0 * math.pi * 32.0 * t)
            val = int(16000 * volume * (noise * 0.7 + rumble * 0.3))
            samples.append(max(-32768, min(32767, val)))

    else:
        # Subtle gentle room tone / wind
        for i in range(num_samples):
            t = i / float(sample_rate)
            hum = 0.5 * math.sin(2.0 * math.pi * 55.0 * t) + 0.5 * math.sin(2.0 * math.pi * 110.0 * t)
            val = int(10000 * volume * hum)
            samples.append(max(-32768, min(32767, val)))

    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(struct.pack(f"<{len(samples)}h", *samples))
    return buf.getvalue()


def read_pcm16_samples(wav_bytes: bytes) -> tuple[list[int], int]:
    """Extract raw signed 16-bit PCM integer samples and framerate from WAV bytes."""
    with wave.open(io.BytesIO(wav_bytes), "rb") as wf:
        framerate = wf.getframerate()
        frames = wf.readframes(wf.getnframes())
        samples = list(struct.unpack(f"<{len(frames)//2}h", frames))
    return samples, framerate


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
                # Extend current span
                current_span["end_ms"] = max(current_span["end_ms"], end_ms)
                current_span["segment_ids"].append(seg.get("segment_id") or seg.get("id"))
            else:
                # Close previous span
                if current_span:
                    spans.append(current_span)
                current_span = {
                    "atmosphere_id": atmo_id,
                    "atmosphere_name": seg.get("atmosphere_name", "Atmosphere"),
                    "volume": float(seg.get("atmosphere_volume", 0.15) or 0.15),
                    "start_ms": start_ms,
                    "end_ms": end_ms,
                    "segment_ids": [seg.get("segment_id") or seg.get("id")],
                }
        else:
            if current_span:
                spans.append(current_span)
                current_span = None

    if current_span:
        spans.append(current_span)

    return spans


def loop_and_fade_pcm(
    pcm_bytes: bytes,
    target_duration_ms: int,
    volume: float = 0.2,
    fade_ms: int = 500,
    sample_rate: int = 24000,
) -> list[int]:
    """Loop 16-bit mono audio samples to fill target duration with smooth fade-in and fade-out."""
    if not pcm_bytes:
        return [0] * int(sample_rate * (target_duration_ms / 1000.0))

    src_samples, _sr = read_pcm16_samples(pcm_bytes)
    if not src_samples:
        return [0] * int(sample_rate * (target_duration_ms / 1000.0))

    target_sample_count = int(sample_rate * (target_duration_ms / 1000.0))
    fade_sample_count = min(target_sample_count // 2, int(sample_rate * (fade_ms / 1000.0)))

    # Repeat source samples to fill length
    repeated: list[int] = []
    src_len = len(src_samples)
    for i in range(target_sample_count):
        repeated.append(src_samples[i % src_len])

    # Apply volume and smooth fade-in / fade-out
    out_samples: list[int] = []
    for i in range(target_sample_count):
        # Calculate fade envelope
        env = 1.0
        if i < fade_sample_count and fade_sample_count > 0:
            env = float(i) / float(fade_sample_count)
        elif i >= (target_sample_count - fade_sample_count) and fade_sample_count > 0:
            remaining = target_sample_count - 1 - i
            env = float(remaining) / float(fade_sample_count)

        val = int(repeated[i] * volume * env)
        out_samples.append(max(-32768, min(32767, val)))

    return out_samples


def overlay_atmosphere_to_master(
    master_wav_bytes: bytes,
    atmosphere_spans: list[dict[str, Any]],
    sfx_data_map: dict[str, bytes] | None = None,
    sample_rate: int = 24000,
) -> bytes:
    """Overlay ambient atmosphere spans onto the master chapter audio with smooth cross-mixing."""
    if not master_wav_bytes or not atmosphere_spans:
        return master_wav_bytes

    try:
        master_samples, framerate = read_pcm16_samples(master_wav_bytes)
    except Exception as exc:
        logger.warning("Could not read master WAV for atmosphere overlay: %s", exc)
        return master_wav_bytes

    total_samples = len(master_samples)
    sfx_map = sfx_data_map or {}

    for span in atmosphere_spans:
        atmo_id = span.get("atmosphere_id")
        atmo_name = span.get("atmosphere_name", "Atmosphere")
        volume = float(span.get("volume", 0.15) or 0.15)
        start_ms = span.get("start_ms", 0)
        end_ms = span.get("end_ms", start_ms + 1000)
        dur_ms = max(500, end_ms - start_ms)

        start_idx = int(framerate * (start_ms / 1000.0))
        if start_idx >= total_samples:
            continue

        atmo_wav = sfx_map.get(atmo_id)
        if not atmo_wav:
            atmo_wav = generate_synthesized_atmosphere_wav(atmo_name, duration_ms=dur_ms, volume=volume, sample_rate=framerate)

        ambient_samples = loop_and_fade_pcm(atmo_wav, target_duration_ms=dur_ms, volume=volume, fade_ms=500, sample_rate=framerate)

        # Mix with saturation arithmetic
        mix_len = min(len(ambient_samples), total_samples - start_idx)
        for i in range(mix_len):
            idx = start_idx + i
            mixed_val = master_samples[idx] + ambient_samples[i]
            master_samples[idx] = max(-32768, min(32767, mixed_val))

    out_buf = io.BytesIO()
    with wave.open(out_buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(framerate)
        wf.writeframes(struct.pack(f"<{len(master_samples)}h", *master_samples))
    return out_buf.getvalue()
