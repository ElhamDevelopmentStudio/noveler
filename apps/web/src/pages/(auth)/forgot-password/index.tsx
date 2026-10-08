import { BrandLogo } from "@/components/brand-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { ScrollFade } from "@/components/ui/scroll-fade";
import { ForgotPasswordForm } from "./components/forgot-password-form";

export function ForgotPasswordPage() {
  return (
    <ScrollFade className="relative h-screen w-full flex flex-col justify-center items-center py-12 px-4 sm:px-6 lg:px-8 bg-background">
      <div className="absolute top-4 right-4 z-50">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-md text-center mb-6">
        <div className="inline-flex items-center gap-2.5 font-bold text-2xl tracking-tight text-foreground">
          <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center text-primary-foreground shadow">
            <BrandLogo className="h-6 w-6" />
          </div>
          <span>Novelova</span>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Account recovery and credential management
        </p>
      </div>

      <div className="w-full max-w-md">
        <Card className="shadow-lg border-border">
          <CardHeader className="text-center space-y-1">
            <CardTitle className="text-2xl font-bold tracking-tight">
              Reset Password
            </CardTitle>
            <CardDescription>
              Enter your email to receive password reset instructions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ForgotPasswordForm />
          </CardContent>
        </Card>
      </div>
    </ScrollFade>
  );
}

export default ForgotPasswordPage;
