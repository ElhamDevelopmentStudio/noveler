import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { GlobalLoading } from "@/components/ui/global-loading";
import { ScrollFade } from "@/components/ui/scroll-fade";
import { BrandLogo } from "@/components/brand-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/context/auth-context";
import { LoginForm } from "./components/login-form";

function getSafeRedirectTarget(state: unknown): string {
  const from = (state as { from?: { pathname?: string; search?: string; hash?: string } } | null)?.from;
  if (!from?.pathname || !from.pathname.startsWith("/") || from.pathname.startsWith("//")) {
    return "/projects";
  }
  return `${from.pathname}${from.search || ""}${from.hash || ""}`;
}

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, isLoading } = useAuth();
  const redirectTo = getSafeRedirectTarget(location.state);

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate(redirectTo, { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate, redirectTo]);

  const handleLoginSuccess = () => {
    navigate(redirectTo, { replace: true });
  };

  if (isLoading) {
    return <GlobalLoading />;
  }


  return (
    <ScrollFade className="relative h-screen w-full flex flex-col justify-center items-center py-12 px-4 sm:px-6 lg:px-8 bg-background el-orb-backdrop">
      <div className="absolute top-4 right-4 z-50">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-md text-center mb-8">
        <div className="inline-flex items-center gap-2.5 text-2xl tracking-tight text-foreground">
          <div className="h-9 w-9 rounded-full bg-primary flex items-center justify-center text-primary-foreground shadow-sm">
            <BrandLogo className="h-5 w-5" />
          </div>
          <span className="font-medium tracking-tight">Novelova</span>
        </div>
        <p className="mt-2.5 text-sm text-muted-foreground tracking-[0.01em]">
          AI Audiobook &amp; Voice Production Studio
        </p>
      </div>

      <div className="w-full max-w-md">
        <Card className="shadow-sm border-border/80 bg-card/95 backdrop-blur-sm rounded-2xl">
          <CardHeader className="text-center space-y-1.5 pb-4">
            <CardTitle className="font-display text-3xl text-foreground">
              Welcome back
            </CardTitle>
            <CardDescription className="text-sm text-muted-foreground">
              Sign in to continue producing your stories
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm onSuccess={handleLoginSuccess} />
          </CardContent>
        </Card>
      </div>
    </ScrollFade>
  );
}

export default LoginPage;
