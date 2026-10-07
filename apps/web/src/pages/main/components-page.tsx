import { useState } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DirectionProvider } from "@/components/ui/direction";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  TypographyH2,
  TypographyMuted,
  TypographyH4,
  TypographyP,
  TypographyInlineCode,
} from "@/components/ui/typography";

export function ComponentsPage() {
  const [direction, setDirection] = useState<"ltr" | "rtl">("ltr");
  const [selectedRadio, setSelectedRadio] = useState("option-1");

  return (
    <DirectionProvider dir={direction}>
      <div className="space-y-8 scroll-fade">
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
          {/* Popover & Command */}
          <Card>
            <CardHeader>
              <CardTitle>Popover & Command</CardTitle>
              <CardDescription>
                Dropdown overlay and filterable command menu.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm">
                      Open Popover
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80">
                    <div className="grid gap-2">
                      <TypographyH4 className="text-sm">
                        Popover Settings
                      </TypographyH4>
                      <TypographyP className="text-xs text-muted-foreground !mt-0">
                        Configure application environment properties directly
                        inside a floating popover.
                      </TypographyP>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="border rounded-lg p-2 bg-card">
                <Command className="rounded-lg border shadow-sm">
                  <CommandInput placeholder="Type a command or search..." />
                  <CommandList>
                    <CommandEmpty>No results found.</CommandEmpty>
                    <CommandGroup heading="Suggestions">
                      <CommandItem>Dashboard</CommandItem>
                      <CommandItem>PostgreSQL Items</CommandItem>
                      <CommandItem>APScheduler Jobs</CommandItem>
                    </CommandGroup>
                  </CommandList>
                </Command>
              </div>
            </CardContent>
          </Card>

          {/* Radio Group & Tooltip */}
          <Card>
            <CardHeader>
              <CardTitle>Radio Group & Tooltip</CardTitle>
              <CardDescription>
                Accessible single selection and contextual tooltips.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <RadioGroup
                value={selectedRadio}
                onValueChange={setSelectedRadio}
                className="space-y-2"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="option-1" id="r1" />
                  <Label htmlFor="r1">
                    Standard Deployment (PostgreSQL + API)
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="option-2" id="r2" />
                  <Label htmlFor="r2">Cluster Mode with Redis Queue</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="option-3" id="r3" />
                  <Label htmlFor="r3">Local Dev with SQLite Fallback</Label>
                </div>
              </RadioGroup>

              <div className="pt-2">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="secondary" size="sm">
                        Hover for Tooltip
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Built with Radix UI Tooltip primitive</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </CardContent>
          </Card>

          {/* Resizable Panels */}
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>Resizable Panels</CardTitle>
              <CardDescription>
                Draggable split-view layout powered by{" "}
                <TypographyInlineCode>
                  react-resizable-panels
                </TypographyInlineCode>
                .
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-48 rounded-lg border overflow-hidden">
                <ResizablePanelGroup direction="horizontal">
                  <ResizablePanel defaultSize={35} minSize={20}>
                    <div className="flex h-full items-center justify-center p-6 bg-muted/40 font-semibold text-sm">
                      Navigation Panel (35%)
                    </div>
                  </ResizablePanel>
                  <ResizableHandle withHandle />
                  <ResizablePanel defaultSize={65}>
                    <div className="flex h-full items-center justify-center p-6 bg-background font-semibold text-sm">
                      Workspace Content Canvas (65%)
                    </div>
                  </ResizablePanel>
                </ResizablePanelGroup>
              </div>
            </CardContent>
          </Card>

          {/* Scroll Area */}
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>Scroll Area</CardTitle>
              <CardDescription>
                Custom styled scrollable container with custom scrollbar.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-44 w-full rounded-md border p-4">
                <div className="space-y-3">
                  <TypographyH4 className="text-sm">
                    Changelog & Release Notes
                  </TypographyH4>
                  {Array.from({ length: 10 }).map((_, i) => (
                    <div
                      key={i}
                      className="text-xs text-muted-foreground border-b pb-2"
                    >
                      <span className="font-semibold text-foreground">
                        v0.{i + 1}.0:
                      </span>{" "}
                      Enhanced polyglot architecture with React 19, FastAPI,
                      PostgreSQL, and shadcn design system.
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>
    </DirectionProvider>
  );
}

export default ComponentsPage;
