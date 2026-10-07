import type { RouteObject } from "react-router-dom";
import { Navigate } from "react-router-dom";
import { Layout } from "../components/layout";
import { MaintenancePage } from "../pages/(system)/maintenance";
import { NotFoundPage } from "../pages/(system)/not-found";
import { ProfilePage } from "../pages/(main)/profile";
import { useAuth } from "../context/auth-context";

function RootRedirect() {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) {
    return null;
  }
  if (isAuthenticated) {
    return <Navigate to="/profile" replace />;
  }
  return <Navigate to="/login" replace />;
}

export const mainRoutes: RouteObject[] = [
  {
    path: "/maintenance",
    element: <MaintenancePage />,
  },
  {
    path: "/",
    element: <RootRedirect />,
  },
  {
    element: <Layout />,
    children: [
      {
        path: "/profile",
        element: <ProfilePage />,
      },
      {
        path: "*",
        element: <NotFoundPage />,
      },
    ],
  },
];
