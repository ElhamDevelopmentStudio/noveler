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
import { RegisterForm } from "./components/register-form";

export function RegisterPage() {
  const navigate = useNavigate();

  const handleRegisterSuccess = () => {
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
          Create an enterprise account
        </h2>
      </div>

      <div className="w-full max-w-md">
        <Card>
          <CardHeader>
            <CardTitle>Sign Up</CardTitle>
            <CardDescription>
              Get started with the Novelova polyglot monorepo template.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RegisterForm onSuccess={handleRegisterSuccess} />
          </CardContent>
        </Card>
      </div>
    </ScrollFade>
  );
}

export default RegisterPage;
