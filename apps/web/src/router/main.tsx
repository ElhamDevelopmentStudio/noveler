import type { RouteObject } from "react-router-dom";
import { Layout } from "../components/layout";
import { DashboardPage } from "../pages/main/dashboard-page";
import { ItemsPage } from "../pages/main/items-page";
import { SchedulerPage } from "../pages/main/scheduler-page";
import { NotFoundPage } from "../pages/not-found-page";

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
