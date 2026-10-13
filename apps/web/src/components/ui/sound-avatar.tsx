import * as React from "react";
import { getDicebearGlassAvatar } from "@/lib/dicebear";
import { cn } from "@/lib/utils";

export interface SoundAvatarProps
  extends React.HTMLAttributes<HTMLDivElement> {
  seed: string;
  size?: number;
}

export function SoundAvatar({
  seed,
  size,
  className,
  ...props
}: SoundAvatarProps) {
  const avatarUri = React.useMemo(() => {
    return getDicebearGlassAvatar(seed, { size });
  }, [seed, size]);

  return (
    <div
      className={cn(
        "relative rounded-xl shrink-0 overflow-hidden select-none bg-neutral-100 dark:bg-neutral-800 ring-1 ring-black/5 dark:ring-white/10 shadow-2xs",
        className,
      )}
      {...props}
    >
      <img
        src={avatarUri}
        alt={seed}
        className="w-full h-full object-cover"
        loading="lazy"
        draggable={false}
      />
    </div>
  );
}
