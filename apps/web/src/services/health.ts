import type { HealthResponse } from "@novelova/shared-types";
import { apiClient } from "./api-client";

export async function getHealth(): Promise<HealthResponse> {
  const response = await apiClient.get<HealthResponse>("/health");
  return response.data;
}

/**
 * Health probe specifically configured to bypass maintenance page redirection,
 * used for polling whether backend services have recovered.
 */
export async function checkHealthStatus(): Promise<HealthResponse | null> {
  try {
    const response = await apiClient.get<HealthResponse>("/health", {
      skipMaintenanceRedirect: true,
      timeout: 5000,
    });
    return response.data;
  } catch {
    return null;
  }
}
