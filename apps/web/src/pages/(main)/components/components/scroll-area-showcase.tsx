import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TypographyH4 } from "@/components/ui/typography";

export function ScrollAreaShowcase() {
  return (
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
  );
}

export default ScrollAreaShowcase;
