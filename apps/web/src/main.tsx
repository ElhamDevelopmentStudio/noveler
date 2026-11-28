import React from "react";
import ReactDOM from "react-dom/client";
import { SWRConfig } from "swr";
import { Toaster } from "sonner";
import { swrFetcher } from "./services/api-client";
import { AuthProvider } from "./context/auth-context";
import { ThemeProvider, useTheme } from "./context/theme-context";
import { ConfirmDialogProvider } from "./components/ui/confirm-dialog";
import { TooltipProvider } from "./components/ui/tooltip";
import { AppRouter } from "./router/index";
import "./index.css";

function ThemedToaster() {
  const { resolvedTheme } = useTheme();
  return <Toaster theme={resolvedTheme} position="bottom-right" richColors closeButton />;
}

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element not found in DOM");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <TooltipProvider>
          <ConfirmDialogProvider>
            <SWRConfig
              value={{
                fetcher: swrFetcher,
                revalidateOnFocus: false,
                revalidateOnReconnect: true,
                dedupingInterval: 5000,
                errorRetryCount: 2,
              }}
            >
              <AppRouter />
              <ThemedToaster />
            </SWRConfig>
          </ConfirmDialogProvider>
        </TooltipProvider>
      </AuthProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
