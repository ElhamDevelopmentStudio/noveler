import { createAvatar } from "@dicebear/core";
import * as glass from "@dicebear/glass";

const avatarCache = new Map<string, string>();

export interface DicebearGlassOptions {
  seed?: string;
  size?: number;
}

/**
 * Generates an SVG Data URI using DiceBear's Glass style.
 * Results are cached in memory for instant subsequent lookups.
 */
export function getDicebearGlassAvatar(
  seed: string = "novelova",
  options?: Omit<DicebearGlassOptions, "seed">,
): string {
  const cacheKey = `${seed}_${options?.size ?? "default"}`;
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
