import { apiClient } from "./api-client";
import type {
  ApiResponse,
  BuildDossiersResponse,
  VoiceDesignJob,
  VoiceDesignRequest,
} from "@novelova/shared-types";

export async function generateCharacterDossiers(
  projectId: string,
  payload: {
    character_ids?: string[] | null;
    refresh?: boolean;
    max_excerpts_per_character?: number;
  } = {},
): Promise<BuildDossiersResponse> {
  const response = await apiClient.post<ApiResponse<BuildDossiersResponse>>(
    `/projects/${projectId}/characters/dossiers/generate`,
    payload,
  );
  return response.data.data;
}

export async function startVoiceDesignJob(
  payload: VoiceDesignRequest,
): Promise<VoiceDesignJob> {
  const response = await apiClient.post<ApiResponse<VoiceDesignJob>>(
    "/voice-design",
    payload,
  );
  return response.data.data;
}

export async function getVoiceDesignJob(jobId: string): Promise<VoiceDesignJob> {
  const response = await apiClient.get<ApiResponse<VoiceDesignJob>>(
    `/voice-design/${jobId}`,
  );
  return response.data.data;
}

export async function listProjectVoiceDesignJobs(
  projectId: string,
): Promise<VoiceDesignJob[]> {
  const response = await apiClient.get<
    ApiResponse<{ jobs: VoiceDesignJob[]; total: number }>
  >(`/projects/${projectId}/voice-design/jobs`);
  return response.data.data.jobs;
}

export async function autoCueProjectSfx(
  projectId: string,
  payload: {
    chapter_ids: string[];
    dry_run?: boolean;
    include_foley?: boolean;
    include_atmosphere?: boolean;
  },
): Promise<{
  project_id: string;
  dry_run: boolean;
  chapters_processed: number;
  applied_foley_count: number;
  applied_atmosphere_segments: number;
  plans: Array<Record<string, unknown>>;
  message: string;
}> {
  const response = await apiClient.post(
    `/sfx/projects/${projectId}/auto-cue`,
    payload,
  );
  return response.data.data;
}

export async function extractPronunciationGlossary(
  projectId: string,
  payload: {
    chapter_ids?: string[] | null;
    sample_chapters?: number;
    save_as_drafts?: boolean;
  } = {},
): Promise<{
  project_id: string;
  created_drafts_count: number;
  suggestions: Array<{
    rule_id?: string | null;
    phrase: string;
    replacement: string;
    match_case: boolean;
    reason: string;
    occurrences_count: number;
    is_active: boolean;
  }>;
  message: string;
}> {
  const response = await apiClient.post(
    `/projects/${projectId}/pronunciation/extract`,
    payload,
  );
  return response.data.data;
}

export async function togglePronunciationRule(
  projectId: string,
  ruleId: string,
  isActive: boolean,
): Promise<void> {
  await apiClient.patch(`/projects/${projectId}/pronunciation/${ruleId}/toggle`, {
    is_active: isActive,
  });
}

export async function generateChapterPackaging(
  projectId: string,
  payload: { chapter_ids: string[]; style?: string },
): Promise<{
  project_id: string;
  generated_count: number;
  items: Array<Record<string, unknown>>;
  message: string;
}> {
  const response = await apiClient.post(
    `/projects/${projectId}/chapters/packaging/generate`,
    payload,
  );
  return response.data.data;
}
