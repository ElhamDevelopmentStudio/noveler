import { apiClient } from "./api-client";
import type {
  ApiResponse,
  ApplyFoleyDto,
  ApplyFoleyResponse,
  ApplySfxPlanRequest,
  ApplySfxPlanResponse,
  AutoSfxCueResponse,
  ScanFoleyOccurrencesDto,
  ScanFoleyOccurrencesResponse,
  SFXCategory,
  SfxDesignJob,
  SfxDesignRequest,
  SFXItem,
} from "@novelova/shared-types";

interface SFXListResponse {
  items: SFXItem[];
  total: number;
}

export async function getSFXItems(
  projectId?: string,
  category?: SFXCategory,
): Promise<SFXItem[]> {
  const params = new URLSearchParams();
  if (projectId) params.append("project_id", projectId);
  if (category) params.append("category", category);

  const query = params.toString() ? `?${params.toString()}` : "";
  const response = await apiClient.get<ApiResponse<SFXListResponse>>(`/sfx${query}`);
  return response.data.data.items;
}

export async function getSFXItem(id: string): Promise<SFXItem> {
  const response = await apiClient.get<ApiResponse<SFXItem>>(`/sfx/${id}`);
  return response.data.data;
}

export async function createSFXItem(formData: FormData): Promise<SFXItem> {
  const response = await apiClient.post<ApiResponse<SFXItem>>("/sfx", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
  return response.data.data;
}

export async function updateSFXItem(
  id: string,
  formData: FormData,
): Promise<SFXItem> {
  const response = await apiClient.patch<ApiResponse<SFXItem>>(`/sfx/${id}`, formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
  return response.data.data;
}

export async function deleteSFXItem(id: string): Promise<void> {
  await apiClient.delete<ApiResponse<{ deleted_id: string }>>(`/sfx/${id}`);
}

export async function scanFoleyOccurrences(
  sfxId: string,
  projectId: string,
  dto: ScanFoleyOccurrencesDto,
): Promise<ScanFoleyOccurrencesResponse> {
  const response = await apiClient.post<ApiResponse<ScanFoleyOccurrencesResponse>>(
    `/sfx/${sfxId}/scan?project_id=${encodeURIComponent(projectId)}`,
    dto,
  );
  return response.data.data;
}

export async function applyFoleyToNovel(
  sfxId: string,
  projectId: string,
  dto: ApplyFoleyDto,
): Promise<ApplyFoleyResponse> {
  const response = await apiClient.post<ApiResponse<ApplyFoleyResponse>>(
    `/sfx/${sfxId}/apply?project_id=${encodeURIComponent(projectId)}`,
    dto,
  );
  return response.data.data;
}

export async function autoDetectProjectSfx(
  projectId: string,
  payload: {
    chapter_ids: string[];
    dry_run?: boolean;
    include_foley?: boolean;
    include_atmosphere?: boolean;
    propose_missing_assets?: boolean;
  },
): Promise<AutoSfxCueResponse> {
  const response = await apiClient.post<ApiResponse<AutoSfxCueResponse>>(
    `/sfx/projects/${projectId}/auto-cue`,
    payload,
  );
  return response.data.data;
}

export async function applyReviewedSfxPlan(
  projectId: string,
  payload: ApplySfxPlanRequest,
): Promise<ApplySfxPlanResponse> {
  const response = await apiClient.post<ApiResponse<ApplySfxPlanResponse>>(
    `/projects/${projectId}/sfx/apply-plan`,
    payload,
  );
  return response.data.data;
}

export async function startSfxDesignJob(
  payload: SfxDesignRequest,
): Promise<SfxDesignJob> {
  const response = await apiClient.post<ApiResponse<SfxDesignJob>>(
    "/sfx-design",
    payload,
  );
  return response.data.data;
}

export async function getSfxDesignJob(jobId: string): Promise<SfxDesignJob> {
  const response = await apiClient.get<ApiResponse<SfxDesignJob>>(
    `/sfx-design/${jobId}`,
  );
  return response.data.data;
}

export async function listProjectSfxDesignJobs(
  projectId: string,
): Promise<SfxDesignJob[]> {
  const response = await apiClient.get<
    ApiResponse<{ jobs: SfxDesignJob[]; total: number }>
  >(`/projects/${projectId}/sfx-design/jobs`);
  return response.data.data.jobs || [];
}
