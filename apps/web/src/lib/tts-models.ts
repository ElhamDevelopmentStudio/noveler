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
    id: "cosyvoice-3",
    name: "Fun-CosyVoice 3.0 Studio",
    badge: "Recommended Audiobook",
    description:
      "Instruction-guided zero-shot voice cloning (24 kHz) with crisp English pronunciation, per-line style/tone control, matched pacing, and uniform studio loudness.",
    vram: "4.5 GB VRAM",
    size: "4.2 GB",
    isCloning: true,
    highlight: "Best Overall Audiobook",
  },
  {
    id: "indextts-2.5",
    name: "IndexTTS 2.5 Studio",
    badge: "Studio Emotional Acting",
    description:
      "Disentangled zero-shot voice cloning with per-line 8-vector emotion and pacing control. Keeps character timbre locked across grief, rage, shock, and joy.",
    vram: "6.5 GB VRAM",
    size: "5.6 GB",
    isCloning: true,
    highlight: "Best Emotional Acting",
  },
  {
    id: "chatterbox-turbo",
    name: "Chatterbox-Turbo",
    badge: "Fast Voice Cloning",
    description:
      "Fast expressive delivery and custom voice cloning from reference audio with paralinguistic cues ([sigh], [laugh]).",
    vram: "3.5 GB VRAM",
    size: "1.85 GB",
    isCloning: true,
    highlight: "Fast Cloning",
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
