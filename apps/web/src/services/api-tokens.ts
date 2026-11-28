import { apiClient } from "./api-client";
import type {
  ApiResponse,
  ApiTokenCreated,
  ApiTokenCreateRequest,
  ApiTokenListResponse,
  HfTokenStatus,
} from "@novelova/shared-types";

export async function getApiTokens(): Promise<ApiTokenListResponse> {
  const response = await apiClient.get<ApiResponse<ApiTokenListResponse>>("/profile/api-tokens");
  return response.data.data;
}

export async function createApiToken(
  payload: ApiTokenCreateRequest
): Promise<ApiTokenCreated> {
  const response = await apiClient.post<ApiResponse<ApiTokenCreated>>(
    "/profile/api-tokens",
    payload
  );
  return response.data.data;
}

export async function revokeApiToken(tokenId: string): Promise<{ revoked_token_id: string }> {
  const response = await apiClient.delete<ApiResponse<{ revoked_token_id: string }>>(
    `/profile/api-tokens/${tokenId}`
  );
  return response.data.data;
}

export async function getHfTokenStatus(): Promise<HfTokenStatus> {
  const response = await apiClient.get<ApiResponse<HfTokenStatus>>(
    "/profile/api-tokens/hf-token"
  );
  return response.data.data;
}

export async function updateHfToken(hfToken: string): Promise<HfTokenStatus> {
  const response = await apiClient.put<ApiResponse<HfTokenStatus>>(
    "/profile/api-tokens/hf-token",
    { hf_token: hfToken }
  );
  return response.data.data;
}

export async function deleteHfToken(): Promise<HfTokenStatus> {
  const response = await apiClient.delete<ApiResponse<HfTokenStatus>>(
    "/profile/api-tokens/hf-token"
  );
  return response.data.data;
}
