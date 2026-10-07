import React from "react";
import ReactDOM from "react-dom/client";
import { SWRConfig } from "swr";
import { swrFetcher } from "./services/api-client";
import { AppRouter } from "./router/index";
import "./index.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element not found in DOM");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <SWRConfig
      value={{
        fetcher: swrFetcher,
        revalidateOnFocus: true,
        revalidateOnReconnect: true,
        dedupingInterval: 5000,
        errorRetryCount: 2,
      }}
    >
      <AppRouter />
    </SWRConfig>
  </React.StrictMode>,
);
