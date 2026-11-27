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
    "cosyvoice-3": TTSModelSpec(
        id="cosyvoice-3",
        name="Fun-CosyVoice 3.0 Studio",
        dataset_slug="novelova-cosyvoice3",
        size_mb=4200,
        vram_mb=4500,
        description="Instruction-guided zero-shot voice cloning (24 kHz) with crisp English pronunciation, natural pacing, and per-line style direction.",
        wheels_needed=[
            "boto3",
            "soundfile",
            "conformer==0.3.2",
            "diffusers",
            "hydra-core",
            "HyperPyYAML",
            "inflect",
            "librosa",
            "lightning",
            "modelscope",
            "omegaconf",
            "onnxruntime-gpu",
            "openai-whisper",
            "transformers==4.51.3",
        ],
    ),
    "indextts-2.5": TTSModelSpec(
        id="indextts-2.5",
        name="IndexTTS 2.5 Studio",
        dataset_slug="novelova-indextts25",
        size_mb=5600,
        vram_mb=6500,
        description="Disentangled zero-shot voice cloning with per-line 8-vector emotional acting and pacing control.",
        wheels_needed=[
            "boto3",
            "soundfile",
            "transformers==4.52.1",
            "tokenizers==0.21.0",
            "accelerate==1.8.1",
            "descript-audiotools==0.7.2",
            "ffmpy",
            "g2p-en==2.1.0",
        ],
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
