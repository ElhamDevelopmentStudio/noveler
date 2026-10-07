import type { RouteObject } from "react-router-dom";
import { LoginPage } from "../pages/(auth)/login";
import { ForgotPasswordPage } from "../pages/(auth)/forgot-password";
import { ResetPasswordPage } from "../pages/(auth)/reset-password";

export const authRoutes: RouteObject[] = [
  {
    path: "/login",
    element: <LoginPage />,
  },
  {
    path: "/forgot-password",
    element: <ForgotPasswordPage />,
  },
  {
    path: "/reset-password",
    element: <ResetPasswordPage />,
  },
];
