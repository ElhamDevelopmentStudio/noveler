import { apiClient } from "./api-client";
import type { ApiResponse, SFXCategory, SFXItem } from "@novelova/shared-types";

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
