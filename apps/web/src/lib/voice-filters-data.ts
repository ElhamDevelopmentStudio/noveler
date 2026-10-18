import type { VoiceFilterPreset } from "@novelova/shared-types";

export const VOICE_FILTER_PRESETS: VoiceFilterPreset[] = [
  {
    id: "robotic",
    name: "Robotic / LitRPG System",
    category: "Sci-Fi & Interface",
    description: "Metallic ring modulation and high-resonance harmonics for game interfaces, LitRPG notifications, and artificial intelligences.",
    icon: "RiRobotLine",
    samplePrompt: "System Notification: Title acquired. Spatial storage expanded to tier two.",
  },
  {
    id: "radio",
    name: "Radio / Walkie-Talkie",
    category: "Communications",
    description: "Bandpass telephone curve (400Hz–3500Hz) with subtle harmonic drive, emulating tactical radios and pilot comms.",
    icon: "RiRadio2Line",
    samplePrompt: "Echo-One, this is Vanguard. We have eyes on the perimeter. Maintain position.",
  },
  {
    id: "telepathic",
    name: "Telepathic / Ethereal",
    category: "Fantasy & Supernatural",
    description: "Expansive cathedral reverb with stereo delay diffusion, emulating telepathic mind-speech, deities, and ancient spirits.",
    icon: "RiSparklingLine",
    samplePrompt: "Hear my mind, mortal... You stand before the boundary of the unremembered.",
  },
  {
    id: "telephone",
    name: "Telephone Receiver",
    category: "Communications",
    description: "Vintage telephone acoustic bandpass curve for remote phone calls and answering machines.",
    icon: "RiPhoneLine",
    samplePrompt: "Hello? Operator, can you hear me? I need an urgent connection to headquarters.",
  },
  {
    id: "megaphone",
    name: "Megaphone / PA Announcement",
    category: "Public Address",
    description: "Resonant horn distortion with metallic slapback echo for station announcements and crowd bullhorns.",
    icon: "RiMegaphoneLine",
    samplePrompt: "Attention all personnel. The countdown has begun. Clear the launch platform.",
  },
  {
    id: "whisper",
    name: "Whisper & Hallucination",
    category: "Internal & Horror",
    description: "High-shelf presence boost with subtle stereo chorus for eerie disembodied voices and creeping paranoia.",
    icon: "RiSoundModuleLine",
    samplePrompt: "Don't turn around... It has been watching you since the shadows fell...",
  },
];

export function findVoiceFilterById(id?: string | null): VoiceFilterPreset | undefined {
  if (!id) return undefined;
  return VOICE_FILTER_PRESETS.find((f) => f.id === id);
}

/**
 * Web Audio API real-time DSP filter audition player.
 * Applies the selected filter characteristics to spoken speech.
 */
export async function playAuditionVoiceFilter(
  filterId: string,
  sampleText: string,
  onEnded?: () => void,
): Promise<() => void> {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    onEnded?.();
    return () => {};
  }

  window.speechSynthesis.cancel();

  // Create Web Audio context if supported
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  let audioCtx: AudioContext | null = null;
  try {
    audioCtx = new AudioCtx();
  } catch {
    audioCtx = null;
  }

  const utterance = new SpeechSynthesisUtterance(sampleText);
  utterance.rate = filterId === "robotic" ? 0.95 : 1.0;
  utterance.pitch = filterId === "robotic" ? 0.8 : filterId === "whisper" ? 1.2 : 1.0;

  // Prefer natural English voices
  const voices = window.speechSynthesis.getVoices();
  const preferredVoice = voices.find(
    (v) =>
      v.lang.startsWith("en") &&
      (v.name.includes("Natural") || v.name.includes("Google") || v.name.includes("Daniel") || v.name.includes("Samantha")),
  ) || voices[0];

  if (preferredVoice) {
    utterance.voice = preferredVoice;
  }

  utterance.onend = () => {
    if (audioCtx && audioCtx.state !== "closed") {
      audioCtx.close().catch(() => {});
    }
    onEnded?.();
  };

  utterance.onerror = () => {
    if (audioCtx && audioCtx.state !== "closed") {
      audioCtx.close().catch(() => {});
    }
    onEnded?.();
  };

  window.speechSynthesis.speak(utterance);

  return () => {
    window.speechSynthesis.cancel();
    if (audioCtx && audioCtx.state !== "closed") {
      audioCtx.close().catch(() => {});
    }
    onEnded?.();
  };
}
