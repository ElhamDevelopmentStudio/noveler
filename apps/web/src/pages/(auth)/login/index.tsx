import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Zap } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { ScrollFade } from "@/components/ui/scroll-fade";
import { LoginForm } from "./components/login-form";
import { OtpStep } from "./components/otp-step";

export function LoginPage() {
  const navigate = useNavigate();
  const [showOtp, setShowOtp] = useState(false);

  const handleLoginSubmit = () => {
    // Proceed to OTP 2FA step
    setShowOtp(true);
  };

  const handleOtpSuccess = () => {
    localStorage.setItem("token", "demo-token-" + Date.now());
    navigate("/");
  };

  return (
    <ScrollFade className="h-screen w-full flex flex-col justify-center items-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md text-center mb-6">
        <Link
          to="/"
          className="inline-flex items-center gap-2 font-bold text-2xl tracking-tight"
        >
          <div className="h-9 w-9 rounded-xl bg-primary flex items-center justify-center text-primary-foreground shadow">
            <Zap className="h-5 w-5" />
          </div>
          <span>Novelova</span>
        </Link>
        <h2 className="mt-3 text-lg font-semibold tracking-tight">
          Sign in to your workspace
        </h2>
      </div>

      <div className="w-full max-w-md">
        <Card>
          <CardHeader>
            <CardTitle>
              {showOtp ? "Two-Factor Verification" : "Sign In"}
            </CardTitle>
            <CardDescription>
              {showOtp
                ? "Enter the 6-digit one-time code sent to your device."
                : "Enter credentials to access the admin portal."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {showOtp ? (
              <OtpStep
                onSuccess={handleOtpSuccess}
                onBack={() => setShowOtp(false)}
              />
            ) : (
              <LoginForm onSuccess={handleLoginSubmit} />
            )}
          </CardContent>
        </Card>
      </div>
    </ScrollFade>
  );
}

export default LoginPage;
