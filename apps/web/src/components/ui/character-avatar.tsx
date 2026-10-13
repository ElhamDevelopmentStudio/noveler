import * as React from "react";
import { getDicebearCharacterAvatar } from "@/lib/dicebear";
import { cn } from "@/lib/utils";

export interface CharacterAvatarProps
  extends React.HTMLAttributes<HTMLDivElement> {
  name: string;
  gender?: string | null;
  size?: number;
}

export function CharacterAvatar({
  name,
  gender,
  size,
  className,
  ...props
}: CharacterAvatarProps) {
  const avatarUri = React.useMemo(() => {
    return getDicebearCharacterAvatar(name, gender, { size });
  }, [name, gender, size]);

  return (
    <div
      className={cn(
        "relative rounded-full shrink-0 overflow-hidden select-none bg-neutral-100 dark:bg-neutral-800 ring-1 ring-black/5 dark:ring-white/10",
        className,
      )}
      {...props}
    >
      <img
        src={avatarUri}
        alt={name}
        className="w-full h-full object-cover"
        loading="lazy"
        draggable={false}
      />
    </div>
  );
}
