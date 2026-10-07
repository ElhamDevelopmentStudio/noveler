import { apiClient } from "./api-client";
import type { ApiResponse, StageBJob } from "@novelova/shared-types";

export async function getStageBStatus(projectId: string): Promise<StageBJob> {
  const response = await apiClient.get<ApiResponse<StageBJob>>(
    `/projects/${projectId}/stage-b/status`,
  );
  return response.data.data;
}

export async function startStageB(projectId: string): Promise<StageBJob> {
  const response = await apiClient.post<ApiResponse<StageBJob>>(
    `/projects/${projectId}/stage-b/start`,
  );
  return response.data.data;
}

export async function stopStageB(projectId: string): Promise<StageBJob> {
  const response = await apiClient.post<ApiResponse<StageBJob>>(
    `/projects/${projectId}/stage-b/stop`,
  );
  return response.data.data;
}

export async function stepStageB(projectId: string): Promise<StageBJob> {
  const response = await apiClient.post<ApiResponse<StageBJob>>(
    `/projects/${projectId}/stage-b/step`,
  );
  return response.data.data;
}
