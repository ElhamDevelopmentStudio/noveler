import { apiClient } from "./api-client";
import type {
  ApiResponse,
  KaggleAccount,
  CreateKaggleAccountDto,
  UpdateKaggleAccountDto,
  KaggleAccountTestResponse,
  KagglePoolSummary,
} from "@novelova/shared-types";

export async function getKaggleAccounts(): Promise<KaggleAccount[]> {
  const response = await apiClient.get<ApiResponse<KaggleAccount[]>>("/profile/kaggle/accounts");
  return response.data.data;
}

export async function getKagglePoolSummary(): Promise<KagglePoolSummary> {
  const response = await apiClient.get<ApiResponse<KagglePoolSummary>>("/profile/kaggle/summary");
  return response.data.data;
}

export async function createKaggleAccount(
  dto: CreateKaggleAccountDto
): Promise<KaggleAccount> {
  const response = await apiClient.post<ApiResponse<KaggleAccount>>(
    "/profile/kaggle/accounts",
    dto
  );
  return response.data.data;
}

export async function updateKaggleAccount(
  accountId: string,
  dto: UpdateKaggleAccountDto
): Promise<KaggleAccount> {
  const response = await apiClient.put<ApiResponse<KaggleAccount>>(
    `/profile/kaggle/accounts/${accountId}`,
    dto
  );
  return response.data.data;
}

export async function deleteKaggleAccount(accountId: string): Promise<void> {
  await apiClient.delete<ApiResponse<{ deleted_id: string }>>(
    `/profile/kaggle/accounts/${accountId}`
  );
}

export async function testKaggleAccount(
  accountId: string
): Promise<KaggleAccountTestResponse> {
  const response = await apiClient.post<ApiResponse<KaggleAccountTestResponse>>(
    `/profile/kaggle/accounts/${accountId}/test`
  );
  return response.data.data;
}

export async function testKaggleCredentials(
  username: string,
  key: string
): Promise<KaggleAccountTestResponse> {
  const response = await apiClient.post<ApiResponse<KaggleAccountTestResponse>>(
    "/profile/kaggle/test-credentials",
    { username, key }
  );
  return response.data.data;
}
