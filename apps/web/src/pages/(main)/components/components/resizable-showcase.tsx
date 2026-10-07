import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { TypographyInlineCode } from "@/components/ui/typography";

export function ResizableShowcase() {
  return (
    <Card className="md:col-span-2">
      <CardHeader>
        <CardTitle>Resizable Panels</CardTitle>
        <CardDescription>
          Draggable split-view layout powered by{" "}
          <TypographyInlineCode>react-resizable-panels</TypographyInlineCode>.
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
  );
}

export default ResizableShowcase;
