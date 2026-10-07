import axios, { type AxiosError } from "axios";

// Target is dynamically resolved from VITE_API_BASE_URL or falls back to /api/v1 (routed via Vite proxy)
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api/v1";

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
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

// Interceptor for uniform error messages
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ detail?: string; error?: { message?: string } }>) => {
    const message =
      error.response?.data?.detail ||
      error.response?.data?.error?.message ||
      error.message ||
      "An unexpected network error occurred";
    return Promise.reject(new Error(message));
  },
);

// Global SWR Axios fetcher
export const swrFetcher = async <T>(url: string): Promise<T> => {
  const response = await apiClient.get<T>(url);
  return response.data;
};

export default apiClient;
