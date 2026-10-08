import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  RiLoginBoxLine,
  RiLogoutBoxRLine,
  RiExternalLinkLine,
} from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ScrollFade } from "@/components/ui/scroll-fade";
import { BrandLogo } from "@/components/brand-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/context/auth-context";

export function Layout() {
  const navigate = useNavigate();
  const { user, isAuthenticated, logout } = useAuth();

  const handleSignOut = () => {
    logout();
    navigate("/login");
  };

  return (
    <TooltipProvider>
      <div className="h-screen bg-background text-foreground flex flex-col overflow-hidden">
        {/* Top Navigation */}
        <header className="shrink-0 border-b bg-background/85 backdrop-blur-md z-40">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <div className="flex items-center gap-8">
              <NavLink
                to="/projects"
                className="flex items-center gap-2.5 font-bold text-lg tracking-tight"
              >
                <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground shadow-xs">
                  <BrandLogo className="h-5 w-5" />
                </div>
                <span>Novelova</span>
              </NavLink>
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
                      <RiExternalLinkLine className="h-3.5 w-3.5 ml-1" />
                    </Button>
                  </a>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Open interactive FastAPI OpenAPI documentation</p>
                </TooltipContent>
              </Tooltip>

              <ThemeToggle />

              {isAuthenticated && user ? (
                <div className="flex items-center gap-2">
                  <NavLink
                    to="/profile"
                    className="flex items-center gap-2 hover:opacity-85 transition-opacity"
                  >
                    <Avatar className="h-8 w-8 ring-1 ring-border">
                      <AvatarImage
                        src={user.avatar_url || undefined}
                        alt={user.name}
                        className="object-cover"
                      />
                      <AvatarFallback seed={user.handle}>
                        {user.name.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="hidden sm:inline-block text-sm font-medium">
                      {user.name}
                    </span>
                  </NavLink>

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleSignOut}
                    title="Sign Out"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  >
                    <RiLogoutBoxRLine className="h-4 w-4" />
                    <span className="sr-only">Sign Out</span>
                  </Button>
                </div>
              ) : (
                <NavLink to="/login">
                  <Button size="sm">
                    <RiLoginBoxLine className="h-3.5 w-3.5 mr-1" />
                    Sign In
                  </Button>
                </NavLink>
              )}
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
