import { apiClient } from "./api-client";
import type {
  ApiResponse,
  Character,
  CharacterVoiceAssignmentDto,
  PronunciationRule,
  PronunciationSearchResponseData,
} from "@novelova/shared-types";

export async function getCharacters(projectId: string): Promise<Character[]> {
  const response = await apiClient.get<ApiResponse<Character[]>>(
    `/projects/${projectId}/characters`,
  );
  return response.data.data;
}

export async function batchAssignVoices(
  projectId: string,
  assignments: CharacterVoiceAssignmentDto[],
): Promise<Character[]> {
  const response = await apiClient.post<ApiResponse<Character[]>>(
    `/projects/${projectId}/characters/batch-assign`,
    { assignments },
  );
  return response.data.data;
}

export async function setDefaultsByGender(
  projectId: string,
): Promise<Character[]> {
  const response = await apiClient.post<ApiResponse<Character[]>>(
    `/projects/${projectId}/characters/defaults-by-gender`,
  );
  return response.data.data;
}

export async function searchPronunciation(
  projectId: string,
  phrase: string,
  replacement: string,
  matchCase: boolean = false,
  scope: string = "entire_manuscript",
): Promise<PronunciationSearchResponseData> {
  const response = await apiClient.post<
    ApiResponse<PronunciationSearchResponseData>
  >(`/projects/${projectId}/pronunciation/search`, {
    phrase,
    replacement,
    match_case: matchCase,
    scope,
  });
  return response.data.data;
}

export async function savePronunciationRule(
  projectId: string,
  rule: {
    phrase: string;
    replacement: string;
    match_case?: boolean;
    scope?: string;
    occurrences_count?: number;
  },
): Promise<PronunciationRule> {
  const response = await apiClient.post<ApiResponse<PronunciationRule>>(
    `/projects/${projectId}/pronunciation`,
    rule,
  );
  return response.data.data;
}

export async function listPronunciationRules(
  projectId: string,
): Promise<PronunciationRule[]> {
  const response = await apiClient.get<ApiResponse<PronunciationRule[]>>(
    `/projects/${projectId}/pronunciation`,
  );
  return response.data.data;
}
