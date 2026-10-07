import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { authRoutes } from "./auth";
import { mainRoutes } from "./main";

export const router = createBrowserRouter([...authRoutes, ...mainRoutes]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}

export default AppRouter;
