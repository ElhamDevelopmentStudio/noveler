import { apiClient } from "./api-client";
import type {
  ApiResponse,
  AuthResponse,
  User,
  UpdateProfileDto,
  ForgotPasswordResponse,
} from "@novelova/shared-types";

export interface LoginParams {
  email: string;
  password: string;
}

export interface ResetPasswordParams {
  token: string;
  newPassword: string;
}

export async function loginUser(params: LoginParams): Promise<AuthResponse> {
  const response = await apiClient.post<ApiResponse<AuthResponse>>(
    "/auth/login",
    params,
  );
  const data = response.data.data;
  localStorage.setItem("token", data.access_token);
  return data;
}

export async function getCurrentUser(): Promise<User> {
  const response = await apiClient.get<ApiResponse<User>>("/auth/me");
  return response.data.data;
}

export async function updateCurrentUser(data: UpdateProfileDto): Promise<User> {
  const response = await apiClient.put<ApiResponse<User>>("/auth/me", data);
  return response.data.data;
}

export async function forgotPassword(
  email: string,
): Promise<ForgotPasswordResponse> {
  const response = await apiClient.post<ApiResponse<ForgotPasswordResponse>>(
    "/auth/forgot-password",
    { email },
  );
  return response.data.data;
}

export async function resetPassword(
  params: ResetPasswordParams,
): Promise<{ reset: boolean }> {
  const response = await apiClient.post<ApiResponse<{ reset: boolean }>>(
    "/auth/reset-password",
    {
      token: params.token,
      new_password: params.newPassword,
    },
  );
  return response.data.data;
}

export function logoutUser(): void {
  localStorage.removeItem("token");
}
