import axios, { type AxiosError } from "axios";

declare module "axios" {
  export interface AxiosRequestConfig {
    skipMaintenanceRedirect?: boolean;
  }
}

// Target is dynamically resolved from VITE_API_BASE_URL or falls back to /api/v1 (routed via Vite proxy)
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api/v1";

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 45000,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

// Interceptor for auth / logging
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export class ApiClientError extends Error {
  status?: number;
  code?: string;
  response?: AxiosError["response"];

  constructor(
    message: string,
    options?: {
      status?: number;
      code?: string;
      response?: AxiosError["response"];
    },
  ) {
    super(message);
    this.name = "ApiClientError";
    this.status = options?.status;
    this.code = options?.code;
    this.response = options?.response;
  }
}

// Interceptor for uniform error messages & CORS / backend down redirection
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ detail?: string; error?: { code?: string; message?: string } }>) => {
    const config = error.config;
    const isTimeoutOrCanceled =
      error.code === "ECONNABORTED" || error.code === "ERR_CANCELED";

    const isNetworkOrCorsError =
      !isTimeoutOrCanceled &&
      (error.code === "ERR_NETWORK" ||
        error.message === "Network Error" ||
        !error.response);

    const isServerUnavailable =
      isNetworkOrCorsError ||
      Boolean(error.response && [502, 503, 504].includes(error.response.status));

    if (
      isServerUnavailable &&
      !config?.skipMaintenanceRedirect &&
      typeof window !== "undefined" &&
      window.location.pathname !== "/maintenance"
    ) {
      // Preserve current route so maintenance recovery can return here
      try {
        sessionStorage.setItem(
          "returnUrl",
          window.location.pathname + window.location.search,
        );
      } catch {
        // ignore storage quota errors
      }
      // Backend is down or CORS failed; navigate to under maintenance page
      window.location.href = "/maintenance";
    }

    const message =
      error.response?.data?.detail ||
      error.response?.data?.error?.message ||
      (error.code === "ECONNABORTED"
        ? "Request timed out. The server is still processing heavy operations in the background."
        : error.message || "An unexpected network error occurred");

    return Promise.reject(
      new ApiClientError(message, {
        status: error.response?.status,
        code: error.response?.data?.error?.code || error.code,
        response: error.response,
      }),
    );
  },
);

// Global SWR Axios fetcher
export const swrFetcher = async <T>(url: string): Promise<T> => {
  const response = await apiClient.get<T>(url);
  return response.data;
};

export default apiClient;
