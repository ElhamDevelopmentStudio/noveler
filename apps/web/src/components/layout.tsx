import { Outlet } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ScrollFade } from "@/components/ui/scroll-fade";
import { AppHeader } from "@/components/app-header";

export function Layout() {
  return (
    <TooltipProvider>
      <div className="h-screen bg-background text-foreground flex flex-col overflow-hidden">
        <AppHeader />

        <ScrollFade className="flex-1 w-full">
          <div className="min-h-full flex flex-col justify-between">
            <main className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
              <Outlet />
            </main>
          </div>
        </ScrollFade>
      </div>
    </TooltipProvider>
  );
}

export default Layout;
