import { createAvatar } from "@dicebear/core";
import * as glass from "@dicebear/glass";
import * as notionists from "@dicebear/notionists";

const avatarCache = new Map<string, string>();

export interface DicebearGlassOptions {
  seed?: string;
  size?: number;
}

export interface DicebearNotionistOptions {
  seed?: string;
  size?: number;
  gender?: string | null;
}

// 17 Short/Masculine hair variants in Notionists
export const MALE_HAIR_VARIANTS = [
  "variant01",
  "variant03",
  "variant04",
  "variant06",
  "variant12",
  "variant15",
  "variant21",
  "variant27",
  "variant29",
  "variant33",
  "variant35",
  "variant38",
  "variant39",
  "variant44",
  "variant54",
  "variant56",
  "variant59",
] as const;

// 32 Medium/Long/Feminine hair variants in Notionists
export const FEMALE_HAIR_VARIANTS = [
  "variant63",
  "variant62",
  "variant61",
  "variant58",
  "variant57",
  "variant51",
  "variant50",
  "variant49",
  "variant48",
  "variant47",
  "variant46",
  "variant43",
  "variant42",
  "variant41",
  "variant40",
  "variant36",
  "variant32",
  "variant31",
  "variant30",
  "variant28",
  "variant25",
  "variant24",
  "variant20",
  "variant19",
  "variant18",
  "variant17",
  "variant14",
  "variant13",
  "variant10",
  "variant08",
  "variant07",
] as const;

// Curated Duotone Gradient Palettes (Two-tone combinations)
export const MALE_DUOTONE_PALETTES: [string, string][] = [
  ["1e3a8a", "3b82f6"], // Navy & Cobalt Blue
  ["0f766e", "14b8a6"], // Deep Teal & Cyan
  ["312e81", "6366f1"], // Deep Indigo & Electric Indigo
  ["1e293b", "0284c7"], // Slate & Sky Blue
  ["14532d", "22c55e"], // Forest & Emerald
  ["1e1b4b", "4f46e5"], // Midnight & Royal Violet
];

export const FEMALE_DUOTONE_PALETTES: [string, string][] = [
  ["831843", "f43f5e"], // Berry Wine & Rose
  ["581c87", "a855f7"], // Deep Purple & Lavender Violet
  ["701a75", "d946ef"], // Wild Plum & Fuchsia
  ["881337", "fb7185"], // Crimson & Soft Coral
  ["7c2d12", "f97316"], // Terracotta & Amber
  ["4c1d95", "ec4899"], // Royal Velvet & Hot Pink
];

export const NEUTRAL_DUOTONE_PALETTES: [string, string][] = [
  ["18181b", "71717a"], // Zinc & Steel
  ["1e293b", "64748b"], // Dark Slate & Slate
  ["312e81", "818cf8"], // Deep Indigo & Periwinkle
  ["064e3b", "10b981"], // Deep Emerald & Mint
];

/**
 * Deterministically pick an item from an array based on seed string.
 */
function pickBySeed<T>(arr: readonly T[] | T[], seed: string): T {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % arr.length;
  return arr[index];
}

/**
 * Normalizes or infers character gender from name and explicit attribute.
 */
export function inferCharacterGender(
  name: string,
  explicitGender?: string | null,
): "male" | "female" | "neutral" {
  if (explicitGender) {
    const g = explicitGender.toLowerCase().trim();
    if (g === "female" || g === "f" || g === "woman" || g === "girl") return "female";
    if (g === "male" || g === "m" || g === "man" || g === "boy") return "male";
  }

  const lower = name.toLowerCase().trim();
  const femaleKeywords = [
    "woman", "girl", "lady", "female", "mother", "sister", "queen",
    "princess", "mrs", "miss", "madam", "daughter", "aunt", "elena",
    "sarah", "bella", "clara", "laura", "alice", "matilda", "freya",
    "charlotte", "emma", "olivia", "sophia", "isabella", "mia", "amelia",
  ];
  if (femaleKeywords.some((k) => lower.includes(k))) return "female";

  const maleKeywords = [
    "man", "boy", "lord", "male", "father", "brother", "king",
    "prince", "mr", "sir", "son", "uncle", "george", "henry",
    "arthur", "roger", "charlie", "callum", "harry", "liam", "will",
    "adam", "brian", "julien", "david", "john", "michael", "james",
  ];
  if (maleKeywords.some((k) => lower.includes(k))) return "male";

  return "neutral";
}

/**
 * Generates an SVG Data URI using DiceBear's Glass style.
 * Used for sound avatars, voices, SFX, and ambient audio fallbacks.
 * Results are cached in memory for instant subsequent lookups.
 */
export function getDicebearGlassAvatar(
  seed: string = "novelova",
  options?: Omit<DicebearGlassOptions, "seed">,
): string {
  const cacheKey = `glass_${seed}_${options?.size ?? "default"}`;
  if (avatarCache.has(cacheKey)) {
    return avatarCache.get(cacheKey)!;
  }

  const avatar = createAvatar(glass, {
    seed,
    size: options?.size,
  });

  const uri = avatar.toDataUri();
  avatarCache.set(cacheKey, uri);
  return uri;
}

/**
 * Generates an SVG Data URI using DiceBear's Notionists duotone icon style.
 * Specifically tailored for characters:
 * - Male characters: masculine hairstyles, facial hair possibility, cool/deep duotone palettes.
 * - Female characters: feminine hairstyles, no facial hair, warm/vibrant duotone palettes.
 * Results are cached in memory for instant subsequent lookups.
 */
export function getDicebearCharacterAvatar(
  name: string = "Character",
  gender?: string | null,
  options?: Omit<DicebearNotionistOptions, "seed" | "gender">,
): string {
  const inferred = inferCharacterGender(name, gender);
  const cacheKey = `notionist_${name}_${inferred}_${options?.size ?? "default"}`;
  if (avatarCache.has(cacheKey)) {
    return avatarCache.get(cacheKey)!;
  }

  const seed = `${name}_${inferred}`;

  let hairVariants: readonly string[];
  let beardProbability = 0;
  let duotoneColors: [string, string];

  if (inferred === "male") {
    hairVariants = MALE_HAIR_VARIANTS;
    beardProbability = 35;
    duotoneColors = pickBySeed(MALE_DUOTONE_PALETTES, seed);
  } else if (inferred === "female") {
    hairVariants = FEMALE_HAIR_VARIANTS;
    beardProbability = 0;
    duotoneColors = pickBySeed(FEMALE_DUOTONE_PALETTES, seed);
  } else {
    hairVariants = [...MALE_HAIR_VARIANTS, ...FEMALE_HAIR_VARIANTS];
    beardProbability = 0;
    duotoneColors = pickBySeed(NEUTRAL_DUOTONE_PALETTES, seed);
  }

  const avatar = createAvatar(notionists, {
    seed,
    size: options?.size,
    hair: hairVariants as any,
    beardProbability,
    backgroundColor: duotoneColors,
    backgroundType: ["gradientLinear"],
    backgroundRotation: [120, 135, 150],
  });

  const uri = avatar.toDataUri();
  avatarCache.set(cacheKey, uri);
  return uri;
}
