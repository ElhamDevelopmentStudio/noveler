import { apiClient } from "./api-client";
import type {
  ApiResponse,
  Chapter,
  ParseOptionsDto,
  ParseResponseData,
} from "@novelova/shared-types";

export async function parseProject(
  projectId: string,
  options?: ParseOptionsDto,
): Promise<ParseResponseData> {
  const response = await apiClient.post<ApiResponse<ParseResponseData>>(
    `/projects/${projectId}/parse`,
    options || {},
  );
  return response.data.data;
}

export async function getChapters(projectId: string): Promise<Chapter[]> {
  const response = await apiClient.get<ApiResponse<Chapter[]>>(
    `/projects/${projectId}/chapters`,
  );
  return response.data.data;
}

export async function getChapterDetail(
  projectId: string,
  chapterId: string,
): Promise<Chapter> {
  const response = await apiClient.get<ApiResponse<Chapter>>(
    `/projects/${projectId}/chapters/${chapterId}`,
  );
  return response.data.data;
}

export interface TaggingSummary {
  project_id: string;
  chapters_tagged: number;
  total_segments_tagged: number;
  total_characters: number;
}

export async function tagProject(projectId: string): Promise<TaggingSummary> {
  const response = await apiClient.post<ApiResponse<TaggingSummary>>(
    `/projects/${projectId}/tag`,
  );
  return response.data.data;
}

export async function tagChapter(
  projectId: string,
  chapterId: string,
): Promise<{ chapter_id: string; segments_tagged: number }> {
  const response = await apiClient.post<
    ApiResponse<{ chapter_id: string; segments_tagged: number }>
  >(`/projects/${projectId}/chapters/${chapterId}/tag`);
  return response.data.data;
}

