import io
import os
import shutil
import struct
import subprocess
import tempfile
import wave
from typing import Any
from novelova_core.logging import setup_logger
from app.services.audio_effects import (
    apply_voice_filter_wav,
    clean_text_for_foley_replacement,
    generate_synthesized_foley_wav,
    read_pcm16_samples,
)

logger = setup_logger("novelova.speech")


def generate_segment_take_wav(
    text: str,
    gender: str | None = "male",
    delivery_type: str = "dialogue",
    emotion: str | None = None,
    speed: float = 1.0,
    sample_rate: int = 24000,
    voice_filter_id: str | None = None,
    sfx_cues: list[dict[str, Any]] | None = None,
    sfx_data_map: dict[str, bytes] | None = None,
) -> tuple[bytes, int]:
    """Generate an actual human spoken TTS waveform take for an isolated script segment.

    Supports:
    - Foley cues (replacing onomatopoeic words or playing immediately after)
    - Voice filters (robotic LitRPG, tactical radio, telepathic reverb, etc.)
    - Character gender, delivery style, and speech speed rate
    """
    sfx_map = sfx_data_map or {}
    raw_text = (text or "").strip()

    # 1. Foley word replacement pre-processing
    clean_text = clean_text_for_foley_replacement(raw_text, sfx_cues) if sfx_cues else raw_text
    clean_text = clean_text.strip()

    has_replace_cue = False
    replace_foley_bytes: list[bytes] = []
    after_foley_bytes: list[bytes] = []

    if sfx_cues:
        for cue in sfx_cues:
            sfx_id = cue.get("sfx_id", "")
            action = cue.get("action", "after")
            vol = float(cue.get("volume", 1.0) or 1.0)
            name = cue.get("name") or cue.get("target_text") or "Foley"

            f_bytes = sfx_map.get(sfx_id)
            if not f_bytes:
                f_bytes = generate_synthesized_foley_wav(name, duration_ms=750, volume=vol, sample_rate=sample_rate)

            if action == "replace":
                has_replace_cue = True
                replace_foley_bytes.append(f_bytes)
            else:
                after_foley_bytes.append(f_bytes)

    # 2. Synthesize spoken speech take if there is non-replaced text remaining
    speech_bytes: bytes | None = None
    duration_ms = 0

    if clean_text:
        # A. Native macOS `say` TTS
        say_bin = shutil.which("say")
        if say_bin:
            gender_lower = (gender or "").lower()
            dt_lower = (delivery_type or "").lower()

            if "thought" in dt_lower:
                voice = "Whisper"
            elif "system" in dt_lower:
                voice = "Zarvox"
            elif "female" in gender_lower:
                voice = "Samantha"
            elif "male" in gender_lower:
                voice = "Daniel"
            else:
                voice = "Samantha"

            wpm = max(90, min(350, int(185 * max(0.5, min(2.0, speed or 1.0)))))

            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp_file:
                tmp_path = tmp_file.name

            try:
                cmd = [
                    say_bin,
                    "-v", voice,
                    "-r", str(wpm),
                    "-o", tmp_path,
                    f"--data-format=LEI16@{sample_rate}",
                    clean_text,
                ]
                res = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
                if res.returncode == 0 and os.path.exists(tmp_path) and os.path.getsize(tmp_path) > 44:
                    with wave.open(tmp_path, "rb") as wf:
                        frames = wf.getnframes()
                        rate = wf.getframerate()
                        duration_ms = int((frames / float(rate)) * 1000)
                    with open(tmp_path, "rb") as f:
                        speech_bytes = f.read()
            except Exception as exc:
                logger.warning("say synthesis notice: %s", exc)
            finally:
                if os.path.exists(tmp_path):
                    os.remove(tmp_path)

        # B. Linux `espeak-ng` or `espeak`
        if not speech_bytes:
            espeak_bin = shutil.which("espeak-ng") or shutil.which("espeak")
            if espeak_bin:
                gender_lower = (gender or "").lower()
                voice = "en-us+f3" if "female" in gender_lower else "en-us+m3"
                speed_wpm = max(90, min(350, int(175 * max(0.5, min(2.0, speed or 1.0)))))
                with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp_file:
                    tmp_path = tmp_file.name
                try:
                    cmd = [
                        espeak_bin,
                        "-v", voice,
                        "-s", str(speed_wpm),
                        "-w", tmp_path,
                        clean_text,
                    ]
                    res = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
                    if res.returncode == 0 and os.path.exists(tmp_path) and os.path.getsize(tmp_path) > 44:
                        with wave.open(tmp_path, "rb") as wf:
                            frames = wf.getnframes()
                            rate = wf.getframerate()
                            duration_ms = int((frames / float(rate)) * 1000)
                        with open(tmp_path, "rb") as f:
                            speech_bytes = f.read()
                except Exception as exc:
                    logger.warning("espeak synthesis notice: %s", exc)
                finally:
                    if os.path.exists(tmp_path):
                        os.remove(tmp_path)

        # C. Fallback: clean silent audio buffer
        if not speech_bytes:
            words = len(clean_text.split())
            base_duration = max(1.0, words * 0.38)
            duration_ms = int(base_duration * 1000)
            total_samples = int(sample_rate * base_duration)
            buf = io.BytesIO()
            with wave.open(buf, "wb") as wf:
                wf.setnchannels(1)
                wf.setsampwidth(2)
                wf.setframerate(sample_rate)
                wf.writeframes(bytearray(total_samples * 2))
            speech_bytes = buf.getvalue()

    # 3. Apply Voice Filter DSP if requested
    if speech_bytes and voice_filter_id:
        speech_bytes = apply_voice_filter_wav(speech_bytes, voice_filter_id, sample_rate)

    # 4. Splice Foley cues (Replace and/or After)
    combined_samples: list[int] = []

    # Insert Replace Foley (at the beginning or in place of replaced word)
    for fb in replace_foley_bytes:
        fb_samples, _ = read_pcm16_samples(fb)
        combined_samples.extend(fb_samples)
        # Small 60ms gap if speech follows
        if speech_bytes:
            combined_samples.extend([0] * int(sample_rate * 0.06))

    # Add speech take samples
    if speech_bytes:
        s_samples, _ = read_pcm16_samples(speech_bytes)
        combined_samples.extend(s_samples)

    # Append After Foley (played immediately after the speech take)
    for fb in after_foley_bytes:
        # Small 50ms gap before after-foley
        if combined_samples:
            combined_samples.extend([0] * int(sample_rate * 0.05))
        fb_samples, _ = read_pcm16_samples(fb)
        combined_samples.extend(fb_samples)

    if not combined_samples:
        # If everything was empty, produce minimal 300ms silence
        combined_samples = [0] * int(sample_rate * 0.3)

    final_buf = io.BytesIO()
    with wave.open(final_buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(struct.pack(f"<{len(combined_samples)}h", *combined_samples))

    final_duration_ms = int((len(combined_samples) / float(sample_rate)) * 1000)
    return final_buf.getvalue(), max(300, final_duration_ms)
