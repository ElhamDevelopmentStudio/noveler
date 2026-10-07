import type { RouteObject } from "react-router-dom";
import { Layout } from "../components/Layout";
import { DashboardPage } from "../pages/main/DashboardPage";
import { ItemsPage } from "../pages/main/ItemsPage";
import { SchedulerPage } from "../pages/main/SchedulerPage";
import { NotFoundPage } from "../pages/NotFoundPage";

export const mainRoutes: RouteObject[] = [
  {
    path: "/",
    element: <Layout />,
    children: [
      {
        index: true,
        element: <DashboardPage />,
      },
      {
        path: "items",
        element: <ItemsPage />,
      },
      {
        path: "scheduler",
        element: <SchedulerPage />,
      },
      {
        path: "*",
        element: <NotFoundPage />,
      },
    ],
  },
];
