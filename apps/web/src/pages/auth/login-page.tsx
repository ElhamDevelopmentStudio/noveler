import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Zap, LogIn, KeyRound } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
  InputOTPSeparator,
} from "@/components/ui/input-otp";

import { ScrollFade } from "@/components/ui/scroll-fade";

const loginSchema = z.object({
  email: z.string().email({ message: "Please enter a valid email address." }),
  password: z
    .string()
    .min(6, { message: "Password must be at least 6 characters." }),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export function LoginPage() {
  const navigate = useNavigate();
  const [showOtp, setShowOtp] = useState(false);
  const [otpValue, setOtpValue] = useState("");

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "admin@novelova.dev",
      password: "password123",
    },
  });

  const onSubmit = async () => {
    // Show 2FA OTP step demo
    setShowOtp(true);
  };

  const handleVerifyOtp = () => {
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
              <div className="space-y-6 pt-2">
                <div className="flex justify-center">
                  <InputOTP
                    maxLength={6}
                    value={otpValue}
                    onChange={(value) => setOtpValue(value)}
                  >
                    <InputOTPGroup>
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                    </InputOTPGroup>
                    <InputOTPSeparator />
                    <InputOTPGroup>
                      <InputOTPSlot index={3} />
                      <InputOTPSlot index={4} />
                      <InputOTPSlot index={5} />
                    </InputOTPGroup>
                  </InputOTP>
                </div>

                <Button
                  className="w-full"
                  onClick={handleVerifyOtp}
                  disabled={otpValue.length < 6}
                >
                  <KeyRound className="h-4 w-4 mr-1.5" />
                  Verify & Enter
                </Button>

                <div className="text-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowOtp(false)}
                  >
                    Back to password login
                  </Button>
                </div>
              </div>
            ) : (
              <Form {...form}>
                <form
                  onSubmit={form.handleSubmit(onSubmit)}
                  className="space-y-4"
                >
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email Address</FormLabel>
                        <FormControl>
                          <Input
                            type="email"
                            placeholder="admin@example.com"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password</FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            placeholder="••••••••"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button
                    type="submit"
                    className="w-full mt-2"
                    disabled={form.formState.isSubmitting}
                  >
                    <LogIn className="h-4 w-4 mr-1.5" />
                    Sign In
                  </Button>

                  <div className="text-center text-xs text-muted-foreground pt-2">
                    Don't have an account?{" "}
                    <Link
                      to="/register"
                      className="text-primary font-semibold hover:underline"
                    >
                      Sign up
                    </Link>
                  </div>
                </form>
              </Form>
            )}
          </CardContent>
        </Card>
      </div>
    </ScrollFade>
  );
}

export default LoginPage;
