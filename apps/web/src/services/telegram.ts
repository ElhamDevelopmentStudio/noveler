import { apiClient } from "./api-client";
import type {
  ApiResponse,
  TelegramSettings,
  UpdateTelegramSettingsDto,
  TelegramTestRequestDto,
  TelegramTestResponse,
} from "@novelova/shared-types";

export async function getTelegramSettings(): Promise<TelegramSettings> {
  const response = await apiClient.get<ApiResponse<TelegramSettings>>("/profile/telegram");
  return response.data.data;
}

export async function updateTelegramSettings(
  dto: UpdateTelegramSettingsDto
): Promise<TelegramSettings> {
  const response = await apiClient.put<ApiResponse<TelegramSettings>>("/profile/telegram", dto);
  return response.data.data;
}

export async function testTelegramConnection(
  dto?: TelegramTestRequestDto
): Promise<TelegramTestResponse> {
  const response = await apiClient.post<ApiResponse<TelegramTestResponse>>(
    "/profile/telegram/test",
    dto || {}
  );
  return response.data.data;
}
