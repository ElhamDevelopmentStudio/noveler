import type { ApiResponse } from "@novelova/shared-types";
import { apiClient } from "./apiClient";

export interface ScheduledJobInfo {
  id: string;
  name: string;
  next_run_time: string | null;
  trigger: string;
  is_active: boolean;
}

export async function getScheduledJobs(): Promise<ScheduledJobInfo[]> {
  const response =
    await apiClient.get<ApiResponse<ScheduledJobInfo[]>>("/scheduler/jobs");
  return response.data.data;
}

export async function triggerScheduledJob(jobId: string): Promise<void> {
  await apiClient.post<ApiResponse<{ job_id: string; triggered: boolean }>>(
    `/scheduler/jobs/${jobId}/trigger`,
  );
}
