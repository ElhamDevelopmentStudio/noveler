import { BrandLogo } from "@/components/brand-logo";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { ScrollFade } from "@/components/ui/scroll-fade";
import { ResetPasswordForm } from "./components/reset-password-form";

export function ResetPasswordPage() {
  return (
    <ScrollFade className="h-screen w-full flex flex-col justify-center items-center py-12 px-4 sm:px-6 lg:px-8 bg-background">
      <div className="w-full max-w-md text-center mb-6">
        <div className="inline-flex items-center gap-2.5 font-bold text-2xl tracking-tight text-foreground">
          <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center text-primary-foreground shadow">
            <BrandLogo className="h-6 w-6" />
          </div>
          <span>Novelova</span>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Secure credential recovery
        </p>
      </div>

      <div className="w-full max-w-md">
        <Card className="shadow-lg border-border">
          <CardHeader className="text-center space-y-1">
            <CardTitle className="text-2xl font-bold tracking-tight">
              Create New Password
            </CardTitle>
            <CardDescription>
              Enter your reset token and your new chosen password
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResetPasswordForm />
          </CardContent>
        </Card>
      </div>
    </ScrollFade>
  );
}

export default ResetPasswordPage;
