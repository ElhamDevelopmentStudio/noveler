import { lazy, Suspense } from "react";
import type { RouteObject } from "react-router-dom";
import { GlobalLoading } from "../components/ui/global-loading";

const LoginPage = lazy(() =>
  import("../pages/(auth)/login").then((m) => ({ default: m.LoginPage })),
);
const ForgotPasswordPage = lazy(() =>
  import("../pages/(auth)/forgot-password").then((m) => ({ default: m.ForgotPasswordPage })),
);
const ResetPasswordPage = lazy(() =>
  import("../pages/(auth)/reset-password").then((m) => ({ default: m.ResetPasswordPage })),
);

export const authRoutes: RouteObject[] = [
  {
    path: "/login",
    element: (
      <Suspense fallback={<GlobalLoading />}>
        <LoginPage />
      </Suspense>
    ),
  },
  {
    path: "/forgot-password",
    element: (
      <Suspense fallback={<GlobalLoading />}>
        <ForgotPasswordPage />
      </Suspense>
    ),
  },
  {
    path: "/reset-password",
    element: (
      <Suspense fallback={<GlobalLoading />}>
        <ResetPasswordPage />
      </Suspense>
    ),
  },
];
