import { apiClient } from "./api-client";
import type { ApiResponse, Voice } from "@novelova/shared-types";

interface VoiceListResponse {
  voices: Voice[];
  total: number;
}

export async function getVoices(projectId?: string): Promise<Voice[]> {
  const url = projectId ? `/voices?project_id=${encodeURIComponent(projectId)}` : "/voices";
  const response = await apiClient.get<ApiResponse<VoiceListResponse>>(url);
  return response.data.data.voices;
}

export async function getVoice(voiceId: string): Promise<Voice> {
  const response = await apiClient.get<ApiResponse<Voice>>(`/voices/${voiceId}`);
  return response.data.data;
}

export async function createVoice(formData: FormData): Promise<Voice> {
  const response = await apiClient.post<ApiResponse<Voice>>("/voices", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
  return response.data.data;
}

export async function updateVoice(voiceId: string, formData: FormData): Promise<Voice> {
  const response = await apiClient.patch<ApiResponse<Voice>>(`/voices/${voiceId}`, formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
  return response.data.data;
}

export async function deleteVoice(voiceId: string): Promise<void> {
  await apiClient.delete<ApiResponse<{ deleted_id: string }>>(`/voices/${voiceId}`);
}
