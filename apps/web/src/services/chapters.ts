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
