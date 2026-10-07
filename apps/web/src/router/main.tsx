import type { RouteObject } from "react-router-dom";
import { Navigate } from "react-router-dom";
import { Layout } from "../components/layout";
import { MaintenancePage } from "../pages/(system)/maintenance";
import { NotFoundPage } from "../pages/(system)/not-found";
import { ProfilePage } from "../pages/(main)/profile";
import { ProjectsPage } from "../pages/(main)/projects";
import { CreateProjectPage } from "../pages/(main)/create-project";
import { useAuth } from "../context/auth-context";

function RootRedirect() {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) {
    return null;
  }
  if (isAuthenticated) {
    return <Navigate to="/projects" replace />;
  }
  return <Navigate to="/login" replace />;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) {
    return null;
  }
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
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
    path: "/projects",
    element: (
      <ProtectedRoute>
        <ProjectsPage />
      </ProtectedRoute>
    ),
  },
  {
    path: "/projects/card",
    element: (
      <ProtectedRoute>
        <ProjectsPage initialViewMode="card" />
      </ProtectedRoute>
    ),
  },
  {
    path: "/projects/table",
    element: (
      <ProtectedRoute>
        <ProjectsPage initialViewMode="table" />
      </ProtectedRoute>
    ),
  },
  {
    path: "/projects/new",
    element: (
      <ProtectedRoute>
        <CreateProjectPage />
      </ProtectedRoute>
    ),
  },
  {
    path: "/projects/create",
    element: (
      <ProtectedRoute>
        <CreateProjectPage />
      </ProtectedRoute>
    ),
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
