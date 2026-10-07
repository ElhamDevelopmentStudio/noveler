import * as React from "react";
import * as AvatarPrimitive from "@radix-ui/react-avatar";
import { cn } from "@/lib/utils";
import { getDicebearGlassAvatar } from "@/lib/dicebear";

const Avatar = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Root
    ref={ref}
    className={cn(
      "relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full ring-1 ring-border/50",
      className,
    )}
    {...props}
  />
));
Avatar.displayName = AvatarPrimitive.Root.displayName;

const AvatarImage = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Image>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Image
    ref={ref}
    className={cn("aspect-square h-full w-full object-cover", className)}
    {...props}
  />
));
AvatarImage.displayName = AvatarPrimitive.Image.displayName;

export interface AvatarFallbackProps
  extends React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback> {
  /**
   * Seed string used to generate deterministic DiceBear Glass avatar.
   * If omitted, falls back to string children or "novelova".
   */
  seed?: string;
  /**
   * Whether to use DiceBear Glass style for fallback. Defaults to true.
   * Set to false to render raw children (e.g. text initials).
   */
  dicebear?: boolean;
}

const AvatarFallback = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Fallback>,
  AvatarFallbackProps
>(({ className, children, seed, dicebear = true, ...props }, ref) => {
  const fallbackSeed =
    seed ||
    (typeof children === "string" && children.trim()
      ? children.trim()
      : "novelova");

  const avatarUri = React.useMemo(() => {
    if (!dicebear) return null;
    return getDicebearGlassAvatar(fallbackSeed);
  }, [dicebear, fallbackSeed]);

  return (
    <AvatarPrimitive.Fallback
      ref={ref}
      className={cn(
        "flex h-full w-full items-center justify-center rounded-full bg-muted/60 overflow-hidden relative select-none",
        className,
      )}
      {...props}
    >
      {avatarUri ? (
        <img
          src={avatarUri}
          alt={fallbackSeed}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      ) : (
        children
      )}
    </AvatarPrimitive.Fallback>
  );
});
AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName;

export { Avatar, AvatarImage, AvatarFallback };
