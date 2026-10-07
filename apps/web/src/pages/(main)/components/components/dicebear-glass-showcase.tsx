import { Sparkles } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  TypographyH4,
  TypographyInlineCode,
} from "@/components/ui/typography";

export function DicebearGlassShowcase() {
  return (
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
  );
}

export default DicebearGlassShowcase;
