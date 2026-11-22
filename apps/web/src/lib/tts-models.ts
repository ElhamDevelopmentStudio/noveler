export interface TTSModelOption {
  id: string;
  name: string;
  badge: string;
  description: string;
  vram: string;
  size: string;
  isCloning: boolean;
  highlight?: string;
}

export const TTS_MODELS: TTSModelOption[] = [
  {
    id: "chatterbox-turbo",
    name: "Chatterbox-Turbo",
    badge: "Zero-Shot Voice Cloning",
    description:
      "High-fidelity conversational and emotive audiobook narrator. Clones character voices from reference audio with dynamic expression.",
    vram: "3.5 GB VRAM",
    size: "1.85 GB",
    isCloning: true,
    highlight: "Recommended for Voice Cloning",
  },
  {
    id: "kokoro-82m",
    name: "Kokoro-82M",
    badge: "Ultra-Fast Studio",
    description:
      "Ultra-fast neural speech synthesis at ~50x real-time speed. Crisp 24kHz clarity with curated character voice mapping.",
    vram: "1.0 GB VRAM",
    size: "360 MB",
    isCloning: false,
    highlight: "Fastest (~50x Real-time)",
  },
  {
    id: "fish-speech-1.5",
    name: "Fish Speech 1.5",
    badge: "Prosody Voice Cloning",
    description:
      "Deep zero-shot voice cloning with natural micro-intonations, subtle pauses, and expressive prosody variance.",
    vram: "5.0 GB VRAM",
    size: "3.2 GB",
    isCloning: true,
  },
  {
    id: "orpheustts",
    name: "OrpheusTTS",
    badge: "Theatrical Narration",
    description:
      "Theatrical, character-driven storytelling engine optimized for dramatic tension and vivid dialogue exchanges.",
    vram: "2.5 GB VRAM",
    size: "1.4 GB",
    isCloning: false,
  },
  {
    id: "vibevoice",
    name: "VibeVoice",
    badge: "Conversational & Whisper",
    description:
      "Subtle conversational vocal delivery with whisper dynamics and authentic internal monologue pacing.",
    vram: "4.5 GB VRAM",
    size: "2.6 GB",
    isCloning: false,
  },
  {
    id: "omnivoice",
    name: "OmniVoice",
    badge: "Multilingual Expressive",
    description:
      "Multilingual expressive speech synthesis engine supporting diverse accents and multi-language prose.",
    vram: "4.0 GB VRAM",
    size: "2.1 GB",
    isCloning: false,
  },
  {
    id: "system-native",
    name: "System Native",
    badge: "Local Dev Fallback",
    description:
      "Local developer speech synthesis preview for rapid offline pipeline testing.",
    vram: "0 MB (CPU)",
    size: "0 MB",
    isCloning: false,
  },
];
