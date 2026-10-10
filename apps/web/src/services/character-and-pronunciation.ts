import { apiClient } from "./api-client";
import type {
  ApiResponse,
  Character,
  CharacterAliasSuggestion,
  CharacterMergeDto,
  CharacterMergePreviewResponse,
  PronunciationRule,
  PronunciationSearchResponseData,
} from "@novelova/shared-types";

export interface CharacterListResponseData {
  characters: Character[];
  total: number;
  unassigned_count: number;
}

export async function getCharacters(
  projectId: string,
): Promise<CharacterListResponseData> {
  const response = await apiClient.get<ApiResponse<CharacterListResponseData>>(
    `/projects/${projectId}/characters`,
  );
  return response.data.data;
}

export async function updateCharacter(
  projectId: string,
  characterId: string,
  payload: {
    name?: string;
    gender?: string;
    role_description?: string;
    assigned_voice_id?: string | null;
    assigned_voice_name?: string | null;
  },
): Promise<Character> {
  const response = await apiClient.put<ApiResponse<Character>>(
    `/projects/${projectId}/characters/${characterId}`,
    payload,
  );
  return response.data.data;
}

export async function setDefaultsByGender(
  projectId: string,
): Promise<Character[]> {
  const response = await apiClient.post<ApiResponse<Character[]>>(
    `/projects/${projectId}/characters/set-defaults-by-gender`,
  );
  return response.data.data;
}

export async function resetAllCast(
  projectId: string,
): Promise<Character[]> {
  const response = await apiClient.post<ApiResponse<Character[]>>(
    `/projects/${projectId}/characters/reset-all`,
  );
  return response.data.data;
}

export async function syncCharacters(
  projectId: string,
): Promise<Character[]> {
  const response = await apiClient.post<ApiResponse<Character[]>>(
    `/projects/${projectId}/characters/sync`,
  );
  return response.data.data;
}

export async function findPronunciationOccurrences(
  projectId: string,
  payload: {
    word: string;
    replacement: string;
    match_case?: boolean;
    scope?: string;
  },
): Promise<PronunciationSearchResponseData> {
  const response = await apiClient.post<
    ApiResponse<PronunciationSearchResponseData>
  >(`/projects/${projectId}/pronunciation/find`, payload);
  return response.data.data;
}

export async function listPronunciationRules(
  projectId: string,
): Promise<PronunciationRule[]> {
  const response = await apiClient.get<
    ApiResponse<{ rules: PronunciationRule[]; total: number }>
  >(`/projects/${projectId}/pronunciation`);
  return response.data.data.rules;
}

export async function savePronunciationRule(
  projectId: string,
  rule: {
    phrase: string;
    replacement: string;
    match_case?: boolean;
    scope?: string;
    occurrences_count?: number;
    excluded_segment_ids?: string[];
  },
): Promise<PronunciationRule> {
  const response = await apiClient.post<ApiResponse<PronunciationRule>>(
    `/projects/${projectId}/pronunciation`,
    rule,
  );
  return response.data.data;
}

export async function deletePronunciationRule(
  projectId: string,
  ruleId: string,
): Promise<void> {
  await apiClient.delete<ApiResponse<null>>(
    `/projects/${projectId}/pronunciation/${ruleId}`,
  );
}

export async function mergeCharacters(
  projectId: string,
  payload: CharacterMergeDto,
): Promise<Character> {
  const response = await apiClient.post<ApiResponse<Character>>(
    `/projects/${projectId}/characters/merge`,
    payload,
  );
  return response.data.data;
}

export async function getAliasSuggestions(
  projectId: string,
): Promise<CharacterAliasSuggestion[]> {
  const response = await apiClient.get<
    ApiResponse<CharacterAliasSuggestion[]>
  >(`/projects/${projectId}/characters/alias-suggestions`);
  return response.data.data;
}

export async function getCharacterMergePreview(
  projectId: string,
  sourceCharacterId: string,
  targetCharacterId?: string,
): Promise<CharacterMergePreviewResponse> {
  const params = new URLSearchParams({ source_character_id: sourceCharacterId });
  if (targetCharacterId) {
    params.set("target_character_id", targetCharacterId);
  }
  const response = await apiClient.get<
    ApiResponse<CharacterMergePreviewResponse>
  >(`/projects/${projectId}/characters/merge-preview?${params.toString()}`);
  return response.data.data;
}

