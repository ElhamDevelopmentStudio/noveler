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
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Sparkles } from "lucide-react";
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

          {/* DiceBear Glass Avatars Card */}
          <Card className="md:col-span-2">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-amber-500" />
                    DiceBear Glass Avatar Fallbacks
                  </CardTitle>
                  <CardDescription>
                    Client-side deterministic glassmorphic 3D avatars generated with{" "}
                    <TypographyInlineCode>@dicebear/glass</TypographyInlineCode>.
                  </CardDescription>
                </div>
                <Badge variant="outline" className="border-primary/30 text-primary">
                  Glass Style
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <TypographyH4 className="text-sm font-semibold mb-3">
                  Deterministic Seed Generation
                </TypographyH4>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                  {[
                    { seed: "alice@novelova.dev", name: "Alice", role: "Admin" },
                    { seed: "bob.designer", name: "Bob", role: "Designer" },
                    { seed: "charlie-ops", name: "Charlie", role: "DevOps" },
                    { seed: "elham.lead", name: "Elham", role: "Tech Lead" },
                    { seed: "sarah_core", name: "Sarah", role: "Backend" },
                    { seed: "quantum-bot", name: "System", role: "Scheduler" },
                  ].map((user) => (
                    <div
                      key={user.seed}
                      className="flex flex-col items-center text-center p-3 rounded-lg border bg-card/60 gap-2"
                    >
                      <Avatar className="h-12 w-12 shadow-sm">
                        <AvatarFallback seed={user.seed}>
                          {user.name.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-xs font-semibold leading-tight">{user.name}</p>
                        <p className="text-[10px] text-muted-foreground">{user.role}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t pt-4">
                <TypographyH4 className="text-sm font-semibold mb-3">
                  Sizes & Graceful Image Fallbacks
                </TypographyH4>
                <div className="flex flex-wrap items-center gap-6">
                  <div className="text-center space-y-1">
                    <Avatar className="h-8 w-8 mx-auto">
                      <AvatarFallback seed="size-sm" />
                    </Avatar>
                    <span className="text-[10px] text-muted-foreground">32px</span>
                  </div>
                  <div className="text-center space-y-1">
                    <Avatar className="h-10 w-10 mx-auto">
                      <AvatarFallback seed="size-md" />
                    </Avatar>
                    <span className="text-[10px] text-muted-foreground">40px</span>
                  </div>
                  <div className="text-center space-y-1">
                    <Avatar className="h-12 w-12 mx-auto">
                      <AvatarFallback seed="size-lg" />
                    </Avatar>
                    <span className="text-[10px] text-muted-foreground">48px</span>
                  </div>
                  <div className="text-center space-y-1">
                    <Avatar className="h-16 w-16 mx-auto">
                      <AvatarFallback seed="size-xl" />
                    </Avatar>
                    <span className="text-[10px] text-muted-foreground">64px</span>
                  </div>

                  {/* Fallback demo: broken image URL falls back to DiceBear Glass */}
                  <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/40 sm:ml-auto">
                    <Avatar className="h-11 w-11">
                      <AvatarImage
                        src="https://invalid-domain.example/non-existent.png"
                        alt="Broken User"
                      />
                      <AvatarFallback seed="broken-fallback" />
                    </Avatar>
                    <div className="text-xs">
                      <p className="font-medium">Failed Image URL</p>
                      <p className="text-[11px] text-muted-foreground">
                        Gracefully renders Glass fallback
                      </p>
                    </div>
                  </div>
                </div>
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
