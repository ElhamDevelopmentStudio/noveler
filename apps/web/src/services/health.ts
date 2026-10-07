import type { HealthResponse } from "@novelova/shared-types";
import { apiClient } from "./api-client";

export async function getHealth(): Promise<HealthResponse> {
  const response = await apiClient.get<HealthResponse>("/health");
  return response.data;
}
