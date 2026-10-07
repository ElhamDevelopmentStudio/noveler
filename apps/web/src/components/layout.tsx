import { NavLink, Outlet } from "react-router-dom";
import {
  Zap,
  Layers,
  Database,
  Clock,
  LogIn,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ScrollFade } from "@/components/ui/scroll-fade";

export function Layout() {
  const navLinkClasses = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
      isActive
        ? "bg-secondary text-secondary-foreground font-semibold"
        : "text-muted-foreground hover:bg-muted hover:text-foreground"
    }`;

  return (
    <TooltipProvider>
      <div className="h-screen bg-background text-foreground flex flex-col overflow-hidden">
        {/* Top Navigation */}
        <header className="shrink-0 border-b bg-background/85 backdrop-blur-md z-40">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <div className="flex items-center gap-8">
              <NavLink
                to="/"
                className="flex items-center gap-2.5 font-bold text-lg tracking-tight"
              >
                <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground shadow-xs">
                  <Zap className="h-4 w-4" />
                </div>
                <span>Novelova</span>
                <Badge
                  variant="outline"
                  className="text-[10px] py-0 px-1.5 h-4"
                >
                  shadcn
                </Badge>
              </NavLink>

              <nav className="hidden md:flex items-center gap-1">
                <NavLink to="/" className={navLinkClasses}>
                  <Layers className="h-4 w-4" />
                  Dashboard
                </NavLink>
                <NavLink to="/items" className={navLinkClasses}>
                  <Database className="h-4 w-4" />
                  Items & Form
                </NavLink>
                <NavLink to="/scheduler" className={navLinkClasses}>
                  <Clock className="h-4 w-4" />
                  Scheduler
                </NavLink>
                <NavLink to="/components" className={navLinkClasses}>
                  <Zap className="h-4 w-4" />
                  Components
                </NavLink>
              </nav>
            </div>

            <div className="flex items-center gap-3">
              <Tooltip>
                <TooltipTrigger asChild>
                  <a
                    href="http://localhost:8000/api/v1/docs"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Button
                      variant="outline"
                      size="sm"
                      className="hidden sm:inline-flex"
                    >
                      API Docs
                      <ExternalLink className="h-3.5 w-3.5 ml-1" />
                    </Button>
                  </a>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Open interactive FastAPI OpenAPI documentation</p>
                </TooltipContent>
              </Tooltip>

              <NavLink to="/login">
                <Button size="sm">
                  <LogIn className="h-3.5 w-3.5 mr-1" />
                  Sign In
                </Button>
              </NavLink>

              <Avatar className="h-8 w-8 border">
                <AvatarFallback className="text-xs font-semibold bg-muted">
                  NV
                </AvatarFallback>
              </Avatar>
            </div>
          </div>
        </header>

        {/* Dynamic Scrollable Content Area with ScrollFade */}
        <ScrollFade className="flex-1 w-full">
          <div className="min-h-full flex flex-col justify-between">
            <main className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
              <Outlet />
            </main>

            {/* Footer */}
            <footer className="border-t py-6 text-center text-xs text-muted-foreground mt-auto">
              <p>
                Novelova Monorepo • React 19 • Tailwind CSS v4 • shadcn/ui • FastAPI
                • PostgreSQL • APScheduler
              </p>
            </footer>
          </div>
        </ScrollFade>
      </div>
    </TooltipProvider>
  );
}

export default Layout;
