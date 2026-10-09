import { apiClient } from "./api-client";
import type {
  ApiResponse,
  Chapter,
  ParseOptionsDto,
  ParseResponseData,
  ScriptSegment,
  ScriptSegmentMergeDto,
  ScriptSegmentSplitDto,
  ScriptSegmentUpdateDto,
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
  allowOfflineHeuristic: boolean = false,
): Promise<TaggingJob> {
  const params = new URLSearchParams({
    resume: String(resume),
    allow_offline_heuristic: String(allowOfflineHeuristic),
  });
  const response = await apiClient.post<ApiResponse<TaggingJob>>(
    `/projects/${projectId}/tag?${params.toString()}`,
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


