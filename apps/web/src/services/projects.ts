import { apiClient } from "./api-client";
import type {
  ApiResponse,
  CreateProjectDto,
  PaginatedProjects,
  Project,
  ProjectSettings,
  UpdateProjectDto,
} from "@novelova/shared-types";

export interface ProjectListParams {
  search?: string;
  status?: string;
  sort_by?: string;
  sort_order?: "asc" | "desc";
  page?: number;
  page_size?: number;
}

export async function getProjects(
  params?: ProjectListParams,
): Promise<PaginatedProjects> {
  const query = new URLSearchParams();
  if (params?.search) query.set("search", params.search);
  if (params?.status && params.status !== "all") query.set("status", params.status);
  if (params?.sort_by) query.set("sort_by", params.sort_by);
  if (params?.sort_order) query.set("sort_order", params.sort_order);
  if (params?.page) query.set("page", params.page.toString());
  if (params?.page_size) query.set("page_size", params.page_size.toString());

  const queryString = query.toString();
  const endpoint = `/projects${queryString ? `?${queryString}` : ""}`;

  const response = await apiClient.get<ApiResponse<PaginatedProjects>>(endpoint);
  return response.data.data;
}

export async function getProject(id: string): Promise<Project> {
  const response = await apiClient.get<ApiResponse<Project>>(`/projects/${id}`);
  return response.data.data;
}

export async function createProject(
  payload: CreateProjectDto,
): Promise<Project> {
  const response = await apiClient.post<ApiResponse<Project>>(
    "/projects",
    payload,
  );
  return response.data.data;
}

export async function updateProject(
  id: string,
  payload: UpdateProjectDto,
): Promise<Project> {
  const response = await apiClient.put<ApiResponse<Project>>(
    `/projects/${id}`,
    payload,
  );
  return response.data.data;
}

export async function updateProjectSettings(
  id: string,
  settings: ProjectSettings,
): Promise<Project> {
  const response = await apiClient.patch<ApiResponse<Project>>(
    `/projects/${id}/settings`,
    settings,
  );
  return response.data.data;
}

export async function deleteProject(id: string): Promise<void> {
  await apiClient.delete<ApiResponse<{ deleted: boolean }>>(`/projects/${id}`);
}

