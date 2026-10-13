export interface VoiceOption {
  id: string;
  name: string;
  title: string;
  description: string;
  gender: "female" | "male" | "neutral";
  category: "Narration" | "Conversational" | "Characters" | "Expressive" | "News";
  collection: "ElevenLabs" | "Standard" | "Community";
  created_by: "ElevenLabs" | "Community";
  accent: "American" | "British" | "Australian" | "Neutral";
  gradient: string;
}

export const VOICES_CATALOG: VoiceOption[] = [
  {
    id: "bella-professional",
    name: "Bella",
    title: "Bella - Professional, Bright, Warm",
    description: "This voice is warm, bright, and engaging, perfect for clear and inviting narrations.",
    gender: "female",
    category: "Narration",
    collection: "ElevenLabs",
    created_by: "ElevenLabs",
    accent: "American",
    gradient: "from-blue-500 via-purple-500 to-indigo-600",
  },
  {
    id: "roger-laid-back",
    name: "Roger",
    title: "Roger - Laid-Back, Casual, Resonant",
    description: "Easy going and perfect for laid-back conversations, audiobooks, and podcasts.",
    gender: "male",
    category: "Conversational",
    collection: "ElevenLabs",
    created_by: "ElevenLabs",
    accent: "American",
    gradient: "from-amber-600 via-stone-700 to-neutral-900",
  },
  {
    id: "sarah-mature",
    name: "Sarah",
    title: "Sarah - Mature, Reassuring, Clear",
    description: "Young adult woman with a reassuring, natural tone suited for heartfelt storytelling.",
    gender: "female",
    category: "Narration",
    collection: "ElevenLabs",
    created_by: "ElevenLabs",
    accent: "American",
    gradient: "from-purple-400 via-pink-500 to-rose-500",
  },
  {
    id: "laura-enthusiast",
    name: "Laura",
    title: "Laura - Enthusiast, Quirky Attitude",
    description: "This young adult female voice has a vibrant, upbeat persona with lively inflection.",
    gender: "female",
    category: "Expressive",
    collection: "ElevenLabs",
    created_by: "ElevenLabs",
    accent: "American",
    gradient: "from-sky-400 via-cyan-500 to-blue-600",
  },
  {
    id: "charlie-deep",
    name: "Charlie",
    title: "Charlie - Deep, Confident, Expressive",
    description: "A young Australian male with resonant lows, confident cadence, and friendly warmth.",
    gender: "male",
    category: "Characters",
    collection: "ElevenLabs",
    created_by: "ElevenLabs",
    accent: "Australian",
    gradient: "from-teal-500 via-emerald-600 to-slate-800",
  },
  {
    id: "george-warm",
    name: "George",
    title: "George - Warm, Captivating Storyteller",
    description: "Warm resonance that instantly draws listeners in; classical British dramatic warmth.",
    gender: "male",
    category: "Narration",
    collection: "ElevenLabs",
    created_by: "ElevenLabs",
    accent: "British",
    gradient: "from-rose-500 via-red-600 to-purple-800",
  },
  {
    id: "callum-husky",
    name: "Callum",
    title: "Callum - Husky Trickster",
    description: "Deceptively gravelly, yet intensely articulate for rogues, anti-heroes, and villains.",
    gender: "male",
    category: "Characters",
    collection: "ElevenLabs",
    created_by: "ElevenLabs",
    accent: "American",
    gradient: "from-amber-700 via-orange-800 to-neutral-950",
  },
  {
    id: "river-relaxed",
    name: "River",
    title: "River - Relaxed, Neutral, Informative",
    description: "A relaxed, neutral voice reading with quiet confidence and balanced rhythm.",
    gender: "neutral",
    category: "News",
    collection: "ElevenLabs",
    created_by: "ElevenLabs",
    accent: "Neutral",
    gradient: "from-emerald-300 via-teal-500 to-slate-700",
  },
  {
    id: "harry-fierce",
    name: "Harry",
    title: "Harry - Fierce Warrior",
    description: "An animated warrior ready to charge into battle with passionate grit and power.",
    gender: "male",
    category: "Characters",
    collection: "ElevenLabs",
    created_by: "ElevenLabs",
    accent: "British",
    gradient: "from-stone-500 via-zinc-700 to-neutral-900",
  },
  {
    id: "liam-energetic",
    name: "Liam",
    title: "Liam - Energetic, Social Media",
    description: "A young adult with snappy delivery and modern inflection for high-energy scenes.",
    gender: "male",
    category: "Conversational",
    collection: "ElevenLabs",
    created_by: "Community",
    accent: "American",
    gradient: "from-violet-600 via-fuchsia-600 to-pink-500",
  },
  {
    id: "alice-clear",
    name: "Alice",
    title: "Alice - Clear, Engaging Educator",
    description: "Clear and engaging, friendly British cadence that explains intricate worlds seamlessly.",
    gender: "female",
    category: "Narration",
    collection: "ElevenLabs",
    created_by: "ElevenLabs",
    accent: "British",
    gradient: "from-indigo-400 via-violet-600 to-slate-900",
  },
  {
    id: "matilda-knowledgeable",
    name: "Matilda",
    title: "Matilda - Knowledgeable, Professional",
    description: "A professional woman with an insightful and authoritative, yet gracious tone.",
    gender: "female",
    category: "Narration",
    collection: "ElevenLabs",
    created_by: "ElevenLabs",
    accent: "American",
    gradient: "from-teal-600 via-cyan-800 to-slate-950",
  },
  {
    id: "will-relaxed",
    name: "Will",
    title: "Will - Relaxed Optimist",
    description: "Conversational and laid back, evoking an open-hearted, friendly companion.",
    gender: "male",
    category: "Conversational",
    collection: "ElevenLabs",
    created_by: "ElevenLabs",
    accent: "American",
    gradient: "from-slate-400 via-blue-700 to-indigo-950",
  },
  {
    id: "adam-bold",
    name: "Adam",
    title: "Adam - Bold, Deep Narration",
    description: "Deep, resonant classic audiobook narration voice with steady gravitas.",
    gender: "male",
    category: "Narration",
    collection: "Standard",
    created_by: "ElevenLabs",
    accent: "American",
    gradient: "from-zinc-600 via-stone-800 to-black",
  },
  {
    id: "freya-adventurous",
    name: "Freya",
    title: "Freya - Adventurous, Young Female",
    description: "Bright and confident young heroine tone with dynamic emotional range.",
    gender: "female",
    category: "Expressive",
    collection: "Community",
    created_by: "Community",
    accent: "American",
    gradient: "from-pink-400 via-rose-500 to-purple-700",
  },
  {
    id: "charlotte-posh",
    name: "Charlotte",
    title: "Charlotte - Seductive, Posh British",
    description: "Refined British accent with delicate elegance and regal charisma.",
    gender: "female",
    category: "Characters",
    collection: "Standard",
    created_by: "ElevenLabs",
    accent: "British",
    gradient: "from-fuchsia-500 via-purple-700 to-slate-900",
  },
  {
    id: "brian-commander",
    name: "Brian",
    title: "Brian - Authoritative Commander",
    description: "Steely resolve and commanding discipline; perfect for captains and leaders.",
    gender: "male",
    category: "Characters",
    collection: "Standard",
    created_by: "ElevenLabs",
    accent: "British",
    gradient: "from-amber-600 via-red-800 to-neutral-900",
  },
  {
    id: "system-chime",
    name: "System Chime",
    title: "System - Neutral Synthetic Interface",
    description: "Crisp synthetic cadence for futuristic game screens, AI companions, and skills.",
    gender: "neutral",
    category: "News",
    collection: "Standard",
    created_by: "ElevenLabs",
    accent: "Neutral",
    gradient: "from-cyan-400 via-blue-500 to-indigo-700",
  },
];

export function findVoiceByIdOrName(
  voiceIdOrName?: string | null,
): VoiceOption | undefined {
  if (!voiceIdOrName) return undefined;
  const lower = voiceIdOrName.toLowerCase();
  return (
    VOICES_CATALOG.find((v) => v.id.toLowerCase() === lower) ||
    VOICES_CATALOG.find((v) => v.name.toLowerCase() === lower) ||
    VOICES_CATALOG.find((v) => v.title.toLowerCase().includes(lower))
  );
}

export function getDefaultVoiceForCharacter(
  gender?: string | null,
  isSystem?: boolean,
): VoiceOption {
  if (isSystem) {
    return (
      VOICES_CATALOG.find((v) => v.id === "system-chime") || VOICES_CATALOG[0]
    );
  }
  const g = (gender || "").toLowerCase();
  if (g.includes("female")) {
    return (
      VOICES_CATALOG.find((v) => v.id === "bella-professional") ||
      VOICES_CATALOG[0]
    );
  }
  if (g.includes("male")) {
    return (
      VOICES_CATALOG.find((v) => v.id === "roger-laid-back") ||
      VOICES_CATALOG[1]
    );
  }
  return VOICES_CATALOG[0];
}
