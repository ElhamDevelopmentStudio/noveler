import { apiClient } from "./api-client";
import type {
  ApiResponse,
  ApiTokenCreated,
  ApiTokenCreateRequest,
  ApiTokenListResponse,
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
