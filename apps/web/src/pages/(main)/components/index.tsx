import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DirectionProvider } from "@/components/ui/direction";
import { TypographyH2, TypographyMuted } from "@/components/ui/typography";
import { PopoverCommandShowcase } from "./components/popover-command-showcase";
import { RadioTooltipShowcase } from "./components/radio-tooltip-showcase";
import { DicebearGlassShowcase } from "./components/dicebear-glass-showcase";
import { ResizableShowcase } from "./components/resizable-showcase";
import { ScrollAreaShowcase } from "./components/scroll-area-showcase";

export function ComponentsPage() {
  const [direction, setDirection] = useState<"ltr" | "rtl">("ltr");

  return (
    <DirectionProvider dir={direction}>
      <div className="space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <TypographyH2 className="border-0 pb-0">
              shadcn Component Catalog
            </TypographyH2>
            <TypographyMuted>
              Interactive showcase of all installed shadcn/ui components in
              Tailwind v4.
            </TypographyMuted>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDirection((d) => (d === "ltr" ? "rtl" : "ltr"))}
          >
            Direction: {direction.toUpperCase()}
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <PopoverCommandShowcase />
          <RadioTooltipShowcase />
          <DicebearGlassShowcase />
          <ResizableShowcase />
          <ScrollAreaShowcase />
        </div>
      </div>
    </DirectionProvider>
  );
}

export default ComponentsPage;
