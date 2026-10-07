import type { RouteObject } from "react-router-dom";
import { LoginPage } from "../pages/auth/login-page";
import { RegisterPage } from "../pages/auth/register-page";

export const authRoutes: RouteObject[] = [
  {
    path: "/login",
    element: <LoginPage />,
  },
  {
    path: "/register",
    element: <RegisterPage />,
  },
];
