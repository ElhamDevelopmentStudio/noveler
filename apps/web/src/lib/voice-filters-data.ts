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
    id: "reverb",
    name: "Reverb / Cathedral & Hall",
    category: "Acoustic Space",
    description: "Expansive cathedral reverberation with acoustic reflection decay, ideal for solemn decrees, caverns, and grand halls.",
    icon: "RiSparklingLine",
    samplePrompt: "The sacred words echoed off the ancient vaulted stone arches of the cathedral.",
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

export interface FilterUIConfig {
  dspTag: string;
  quickLabel: string;
  summary: string;
  themeCategory: "Sci-Fi" | "Comms" | "Acoustics" | "Horror";
  badgeClass: string;
  activeBorderClass: string;
  activeBgClass: string;
  iconClass: string;
  playBtnClass: string;
  waveClass: string;
}

export const FILTER_CATEGORIES = ["All", "Sci-Fi", "Comms", "Acoustics", "Horror"] as const;

export const FILTER_UI_CONFIGS: Record<string, FilterUIConfig> = {
  robotic: {
    dspTag: "Ring Mod · 65Hz",
    quickLabel: "🎮 LitRPG Alert",
    summary: "Metallic ring modulation for LitRPG system prompts & AI.",
    themeCategory: "Sci-Fi",
    badgeClass: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/25",
    activeBorderClass: "border-cyan-500/50 dark:border-cyan-500/60 shadow-cyan-500/10 ring-1 ring-cyan-500/40",
    activeBgClass: "bg-cyan-500/[0.05] dark:bg-cyan-500/[0.08]",
    iconClass: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30",
    playBtnClass: "bg-cyan-600 text-white hover:bg-cyan-500 dark:bg-cyan-500 dark:text-neutral-950 dark:hover:bg-cyan-400",
    waveClass: "text-cyan-500 dark:text-cyan-400",
  },
  radio: {
    dspTag: "Bandpass · 400Hz–3.5kHz",
    quickLabel: "📻 Tactical Comms",
    summary: "Bandpass telephone curve with analog harmonic drive.",
    themeCategory: "Comms",
    badgeClass: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/25",
    activeBorderClass: "border-amber-500/50 dark:border-amber-500/60 shadow-amber-500/10 ring-1 ring-amber-500/40",
    activeBgClass: "bg-amber-500/[0.05] dark:bg-amber-500/[0.08]",
    iconClass: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30",
    playBtnClass: "bg-amber-600 text-white hover:bg-amber-500 dark:bg-amber-500 dark:text-neutral-950 dark:hover:bg-amber-400",
    waveClass: "text-amber-500 dark:text-amber-400",
  },
  reverb: {
    dspTag: "Cathedral · 3.2s Hall",
    quickLabel: "🏰 Cathedral Hall",
    summary: "Spacious stone room acoustics with reflection decay.",
    themeCategory: "Acoustics",
    badgeClass: "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/25",
    activeBorderClass: "border-purple-500/50 dark:border-purple-500/60 shadow-purple-500/10 ring-1 ring-purple-500/40",
    activeBgClass: "bg-purple-500/[0.05] dark:bg-purple-500/[0.08]",
    iconClass: "bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30",
    playBtnClass: "bg-purple-600 text-white hover:bg-purple-500 dark:bg-purple-500 dark:text-neutral-950 dark:hover:bg-purple-400",
    waveClass: "text-purple-500 dark:text-purple-400",
  },
  telepathic: {
    dspTag: "Diffusion · Multi-Tap",
    quickLabel: "🔮 Mind-Speech",
    summary: "Expansive ethereal reverb for mind-speech & deities.",
    themeCategory: "Sci-Fi",
    badgeClass: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/25",
    activeBorderClass: "border-indigo-500/50 dark:border-indigo-500/60 shadow-indigo-500/10 ring-1 ring-indigo-500/40",
    activeBgClass: "bg-indigo-500/[0.05] dark:bg-indigo-500/[0.08]",
    iconClass: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30",
    playBtnClass: "bg-indigo-600 text-white hover:bg-indigo-500 dark:bg-indigo-500 dark:text-neutral-950 dark:hover:bg-indigo-400",
    waveClass: "text-indigo-500 dark:text-indigo-400",
  },
  telephone: {
    dspTag: "Narrow Band · 300Hz–3kHz",
    quickLabel: "☎️ Phone Call",
    summary: "Vintage carbon mic telephone curve for remote calls.",
    themeCategory: "Comms",
    badgeClass: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25",
    activeBorderClass: "border-emerald-500/50 dark:border-emerald-500/60 shadow-emerald-500/10 ring-1 ring-emerald-500/40",
    activeBgClass: "bg-emerald-500/[0.05] dark:bg-emerald-500/[0.08]",
    iconClass: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30",
    playBtnClass: "bg-emerald-600 text-white hover:bg-emerald-500 dark:bg-emerald-500 dark:text-neutral-950 dark:hover:bg-emerald-400",
    waveClass: "text-emerald-500 dark:text-emerald-400",
  },
  megaphone: {
    dspTag: "Horn Drive · Slapback",
    quickLabel: "📢 Megaphone PA",
    summary: "Resonant horn distortion with metallic slapback echo.",
    themeCategory: "Comms",
    badgeClass: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/25",
    activeBorderClass: "border-rose-500/50 dark:border-rose-500/60 shadow-rose-500/10 ring-1 ring-rose-500/40",
    activeBgClass: "bg-rose-500/[0.05] dark:bg-rose-500/[0.08]",
    iconClass: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30",
    playBtnClass: "bg-rose-600 text-white hover:bg-rose-500 dark:bg-rose-500 dark:text-neutral-950 dark:hover:bg-rose-400",
    waveClass: "text-rose-500 dark:text-rose-400",
  },
  whisper: {
    dspTag: "High-Shelf · Chorus",
    quickLabel: "👻 Ghost Whisper",
    summary: "Airy high-shelf presence boost with subtle stereo chorus.",
    themeCategory: "Horror",
    badgeClass: "bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/25",
    activeBorderClass: "border-slate-500/50 dark:border-slate-500/60 shadow-slate-500/10 ring-1 ring-slate-500/40",
    activeBgClass: "bg-slate-500/[0.05] dark:bg-slate-500/[0.08]",
    iconClass: "bg-slate-500/15 text-slate-600 dark:text-slate-400 border border-slate-500/30",
    playBtnClass: "bg-slate-600 text-white hover:bg-slate-500 dark:bg-slate-500 dark:text-neutral-950 dark:hover:bg-slate-400",
    waveClass: "text-slate-500 dark:text-slate-400",
  },
};

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
