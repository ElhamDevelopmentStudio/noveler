import { apiClient } from "./api-client";
import type {
  ApiResponse,
  Chapter,
  FormatOptionsDto,
  FormatResponseData,
  ParseOptionsDto,
  ParseResponseData,
  ScriptSegment,
  ScriptSegmentMergeDto,
  ScriptSegmentSplitDto,
  ScriptSegmentUpdateDto,
  TaggingJob,
  TaggingJobOptionsDto,
  UrlImportResponseDto,
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

export async function formatProjectScript(
  projectId: string,
  options: FormatOptionsDto,
): Promise<FormatResponseData> {
  const response = await apiClient.post<ApiResponse<FormatResponseData>>(
    `/projects/${projectId}/format`,
    options,
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
  options?: TaggingJobOptionsDto | boolean,
  allowOfflineHeuristic?: boolean,
): Promise<TaggingJob> {
  let body: TaggingJobOptionsDto = {};
  if (typeof options === "boolean") {
    body = {
      resume: options,
      allow_offline_heuristic: allowOfflineHeuristic || false,
    };
  } else if (options) {
    body = options;
  }
  const response = await apiClient.post<ApiResponse<TaggingJob>>(
    `/projects/${projectId}/tag`,
    body,
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

export async function getTaggingJobHistory(
  projectId: string,
): Promise<TaggingJob[]> {
  const response = await apiClient.get<ApiResponse<TaggingJob[]>>(
    `/projects/${projectId}/tag/history`,
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

export async function updateSegment(
  projectId: string,
  segmentId: string,
  payload: ScriptSegmentUpdateDto,
): Promise<ScriptSegment> {
  const response = await apiClient.patch<ApiResponse<ScriptSegment>>(
    `/projects/${projectId}/segments/${segmentId}`,
    payload,
  );
  return response.data.data;
}

export async function splitSegment(
  projectId: string,
  segmentId: string,
  splitIndex: number,
): Promise<ScriptSegment[]> {
  const payload: ScriptSegmentSplitDto = { split_index: splitIndex };
  const response = await apiClient.post<ApiResponse<ScriptSegment[]>>(
    `/projects/${projectId}/segments/${segmentId}/split`,
    payload,
  );
  return response.data.data;
}

export async function mergeSegment(
  projectId: string,
  segmentId: string,
  direction: "next" | "previous" = "next",
): Promise<ScriptSegment> {
  const payload: ScriptSegmentMergeDto = { direction };
  const response = await apiClient.post<ApiResponse<ScriptSegment>>(
    `/projects/${projectId}/segments/${segmentId}/merge`,
    payload,
  );
  return response.data.data;
}

export async function createChapter(
  projectId: string,
  title?: string,
): Promise<Chapter> {
  const response = await apiClient.post<ApiResponse<Chapter>>(
    `/projects/${projectId}/chapters`,
    title ? { title } : {},
  );
  return response.data.data;
}

export async function updateChapter(
  projectId: string,
  chapterId: string,
  title: string,
): Promise<Chapter> {
  const response = await apiClient.patch<ApiResponse<Chapter>>(
    `/projects/${projectId}/chapters/${chapterId}`,
    { title },
  );
  return response.data.data;
}

export async function reorderChapters(
  projectId: string,
  chapterIds: string[],
): Promise<Chapter[]> {
  const response = await apiClient.patch<ApiResponse<Chapter[]>>(
    `/projects/${projectId}/chapters/reorder`,
    { chapter_ids: chapterIds },
  );
  return response.data.data;
}

export async function deleteChapter(
  projectId: string,
  chapterId: string,
): Promise<void> {
  await apiClient.delete<ApiResponse<null>>(
    `/projects/${projectId}/chapters/${chapterId}`,
  );
}

export async function saveChapterText(
  projectId: string,
  chapterId: string,
  text: string,
): Promise<Chapter> {
  const response = await apiClient.post<ApiResponse<Chapter>>(
    `/projects/${projectId}/chapters/${chapterId}/text`,
    { text },
  );
  return response.data.data;
}

export async function importUrlText(
  projectId: string,
  url: string,
): Promise<UrlImportResponseDto> {
  const response = await apiClient.post<ApiResponse<UrlImportResponseDto>>(
    `/projects/${projectId}/import-url`,
    { url },
  );
  return response.data.data;
}




