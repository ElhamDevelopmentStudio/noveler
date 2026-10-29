from dataclasses import dataclass, field
from typing import Optional


@dataclass(frozen=True)
class TTSModelSpec:
    id: str
    name: str
    dataset_slug: str
    size_mb: int
    vram_mb: int
    description: str
    is_default: bool = False
    download_urls: dict[str, str] = field(default_factory=dict)
    wheels_needed: list[str] = field(default_factory=list)


TTS_MODELS_CATALOG: dict[str, TTSModelSpec] = {
    "kokoro-82m": TTSModelSpec(
        id="kokoro-82m",
        name="Kokoro-82M",
        dataset_slug="novelova-runtime-core",
        size_mb=360,
        vram_mb=1000,
        description="Ultra-fast neural speech synthesis at ~50x real-time speed. Default Studio engine.",
        is_default=True,
        download_urls={
            "kokoro-v1.0.onnx": "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1/kokoro-v1.0.onnx",
            "voices-v1.0.bin": "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1/voices-v1.0.bin",
        },
        wheels_needed=["boto3", "kokoro-onnx", "soundfile"],
    ),
    "chatterbox-turbo": TTSModelSpec(
        id="chatterbox-turbo",
        name="Chatterbox-Turbo",
        dataset_slug="novelova-chatterbox",
        size_mb=1850,
        vram_mb=3500,
        description="High-fidelity conversational and emotive audiobook narrator with rich dynamic pacing.",
        wheels_needed=["boto3", "soundfile"],
    ),
    "fish-speech-1.5": TTSModelSpec(
        id="fish-speech-1.5",
        name="Fish Speech 1.5",
        dataset_slug="novelova-fishspeech",
        size_mb=3200,
        vram_mb=5000,
        description="Zero-shot expressive voice cloning with high prosody variance and acoustic clarity.",
        wheels_needed=["boto3", "soundfile"],
    ),
    "omnivoice": TTSModelSpec(
        id="omnivoice",
        name="OmniVoice",
        dataset_slug="novelova-omnivoice",
        size_mb=2100,
        vram_mb=4000,
        description="Multilingual expressive speech synthesis engine optimized for multilingual dialogues.",
        wheels_needed=["boto3", "soundfile"],
    ),
    "orpheustts": TTSModelSpec(
        id="orpheustts",
        name="OrpheusTTS",
        dataset_slug="novelova-orpheustts",
        size_mb=1400,
        vram_mb=2500,
        description="Natural dramatic and theatrical narration engine for character-driven prose.",
        wheels_needed=["boto3", "soundfile"],
    ),
    "vibevoice": TTSModelSpec(
        id="vibevoice",
        name="VibeVoice",
        dataset_slug="novelova-vibevoice",
        size_mb=2600,
        vram_mb=4500,
        description="Subtle conversational vocal delivery with whisper and internal monologue dynamics.",
        wheels_needed=["boto3", "soundfile"],
    ),
}


def get_model_spec(model_id: str | None) -> TTSModelSpec:
    """Retrieve model specification by ID or default to Kokoro-82M."""
    if not model_id:
        return TTS_MODELS_CATALOG["kokoro-82m"]
    normalized = model_id.strip().lower()
    return TTS_MODELS_CATALOG.get(normalized, TTS_MODELS_CATALOG["kokoro-82m"])


def list_supported_models() -> list[TTSModelSpec]:
    """Return all supported TTS models."""
    return list(TTS_MODELS_CATALOG.values())
