import type { RouteObject } from "react-router-dom";
import { Layout } from "../components/layout";
import { DashboardPage } from "../pages/(main)/dashboard";
import { MaintenancePage } from "../pages/(system)/maintenance";
import { NotFoundPage } from "../pages/(system)/not-found";

export const mainRoutes: RouteObject[] = [
  {
    path: "/maintenance",
    element: <MaintenancePage />,
  },
  {
    path: "/",
    element: <Layout />,
    children: [
      {
        index: true,
        element: <DashboardPage />,
      },
      {
        path: "*",
        element: <NotFoundPage />,
      },
    ],
  },
];
