import { apiClient } from "./api-client";
import type {
  ApiResponse,
  Chapter,
  ParseOptionsDto,
  ParseResponseData,
  TaggingJob,
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

export async function startTaggingJob(
  projectId: string,
  resume: boolean = true,
): Promise<TaggingJob> {
  const response = await apiClient.post<ApiResponse<TaggingJob>>(
    `/projects/${projectId}/tag?resume=${resume}`,
  );
  return response.data.data;
}

export async function getTaggingJobStatus(
  projectId: string,
): Promise<TaggingJob | null> {
  const response = await apiClient.get<ApiResponse<TaggingJob | null>>(
    `/projects/${projectId}/tag/status`,
  );
  return response.data.data;
}

export async function cancelTaggingJob(
  projectId: string,
): Promise<TaggingJob> {
  const response = await apiClient.post<ApiResponse<TaggingJob>>(
    `/projects/${projectId}/tag/cancel`,
  );
  return response.data.data;
}


