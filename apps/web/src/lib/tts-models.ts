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

const CORE_TTS_MODELS: TTSModelOption[] = [
  {
    id: "chatterbox-turbo",
    name: "Chatterbox-Turbo",
    badge: "Expressive & Voice Cloning",
    description:
      "Expressive delivery and custom voice cloning from reference audio. Best for multi-character fiction with emotion cues.",
    vram: "3.5 GB VRAM",
    size: "1.85 GB",
    isCloning: true,
    highlight: "Recommended for Voice Cloning",
  },
  {
    id: "kokoro-82m",
    name: "Kokoro-82M",
    badge: "Fast Narration",
    description:
      "Fast, clean narration using built-in studio voices at ~50x real-time speed. Best for quick drafts or single-narrator books.",
    vram: "1.0 GB VRAM",
    size: "360 MB",
    isCloning: false,
    highlight: "Fastest (~50x Real-time)",
  },
];

const DEV_ONLY_TTS_MODELS: TTSModelOption[] = [
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

/**
 * Only verified, implemented TTS engines are exposed in production.
 * Local dev fallback is included only in Vite development mode.
 */
export const TTS_MODELS: TTSModelOption[] = import.meta.env.DEV
  ? [...CORE_TTS_MODELS, ...DEV_ONLY_TTS_MODELS]
  : CORE_TTS_MODELS;
