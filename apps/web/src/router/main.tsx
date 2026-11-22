import { lazy, Suspense } from "react";
import type { RouteObject } from "react-router-dom";
import { Navigate } from "react-router-dom";
import { Layout } from "../components/layout";
import { GlobalLoading } from "../components/ui/global-loading";
import { useAuth } from "../context/auth-context";

const MaintenancePage = lazy(() =>
  import("../pages/(system)/maintenance").then((m) => ({ default: m.MaintenancePage })),
);
const NotFoundPage = lazy(() =>
  import("../pages/(system)/not-found").then((m) => ({ default: m.NotFoundPage })),
);
const ProfilePage = lazy(() =>
  import("../pages/(main)/profile").then((m) => ({ default: m.ProfilePage })),
);
const ProjectsPage = lazy(() =>
  import("../pages/(main)/projects").then((m) => ({ default: m.ProjectsPage })),
);
const CreateProjectPage = lazy(() =>
  import("../pages/(main)/create-project").then((m) => ({ default: m.CreateProjectPage })),
);
const ProjectWorkspacePage = lazy(() =>
  import("../pages/(main)/project-workspace").then((m) => ({ default: m.ProjectWorkspacePage })),
);

function LazyRoute({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<GlobalLoading />}>{children}</Suspense>;
}

function RootRedirect() {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) {
    return <GlobalLoading />;
  }
  if (isAuthenticated) {
    return <Navigate to="/projects" replace />;
  }
  return <Navigate to="/login" replace />;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) {
    return <GlobalLoading />;
  }
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return <LazyRoute>{children}</LazyRoute>;
}

export const mainRoutes: RouteObject[] = [
  {
    path: "/maintenance",
    element: (
      <LazyRoute>
        <MaintenancePage />
      </LazyRoute>
    ),
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
    path: "/projects/:projectId",
    element: (
      <ProtectedRoute>
        <ProjectWorkspacePage />
      </ProtectedRoute>
    ),
  },
  {
    path: "/profile",
    element: (
      <ProtectedRoute>
        <ProfilePage />
      </ProtectedRoute>
    ),
  },
  {
    element: <Layout />,
    children: [
      {
        path: "*",
        element: (
          <LazyRoute>
            <NotFoundPage />
          </LazyRoute>
        ),
      },
    ],
  },
];
