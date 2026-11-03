import { apiClient } from "./api-client";
import type {
  ApiResponse,
  CreateProjectDto,
  PackageChaptersRequest,
  PackagePreviewResponse,
  PaginatedProjects,
  Project,
  ProjectArchivePreviewResponse,
  ProjectSettings,
  RawContentResponse,
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

export async function getRawManuscriptContent(
  projectId: string,
  offset: number = 0,
  limit: number = 150000,
): Promise<RawContentResponse> {
  const response = await apiClient.get<ApiResponse<RawContentResponse>>(
    `/projects/${projectId}/raw-content?offset=${offset}&limit=${limit}`,
  );
  return response.data.data;
}

export async function downloadProjectArchive(
  projectId: string,
  fallbackFilename: string = "novelova-project-export.zip",
): Promise<void> {
  const response = await apiClient.get<Blob>(`/projects/${projectId}/export`, {
    responseType: "blob",
  });

  let filename = fallbackFilename;
  const disposition =
    response.headers?.["content-disposition"] ||
    (typeof response.headers?.get === "function" ? response.headers.get("content-disposition") : undefined);

  if (disposition && typeof disposition === "string") {
    const filenameMatch = disposition.match(/filename\*?=['"]?(?:UTF-\d['"]*)?([^;\r\n"']*)['"]?/i);
    if (filenameMatch && filenameMatch[1]) {
      filename = decodeURIComponent(filenameMatch[1]);
    }
  }

  const blob = new Blob([response.data], { type: "application/zip" });
  const downloadUrl = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = downloadUrl;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(downloadUrl);
}

export async function getPackagePreview(
  projectId: string,
): Promise<PackagePreviewResponse> {
  const response = await apiClient.get<ApiResponse<PackagePreviewResponse>>(
    `/projects/${projectId}/package-preview`,
  );
  return response.data.data;
}

export async function downloadChapterMp3(
  projectId: string,
  chapterId: string,
  fallbackFilename: string = "chapter.mp3",
): Promise<void> {
  const response = await apiClient.get<Blob>(
    `/projects/${projectId}/chapters/${chapterId}/package-mp3`,
    {
      responseType: "blob",
    },
  );

  let filename = fallbackFilename;
  const disposition =
    response.headers?.["content-disposition"] ||
    (typeof response.headers?.get === "function" ? response.headers.get("content-disposition") : undefined);

  if (disposition && typeof disposition === "string") {
    const filenameMatch = disposition.match(/filename\*?=['"]?(?:UTF-\d['"]*)?([^;\r\n"']*)['"]?/i);
    if (filenameMatch && filenameMatch[1]) {
      filename = decodeURIComponent(filenameMatch[1]);
    }
  }

  const blob = new Blob([response.data], { type: "audio/mpeg" });
  const downloadUrl = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = downloadUrl;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(downloadUrl);
}

export async function downloadPackagedChaptersArchive(
  projectId: string,
  payload: PackageChaptersRequest,
  fallbackFilename: string = "novelova-packaged-audio.zip",
): Promise<void> {
  const response = await apiClient.post<Blob>(
    `/projects/${projectId}/package-download`,
    payload,
    {
      responseType: "blob",
    },
  );

  let filename = fallbackFilename;
  const disposition =
    response.headers?.["content-disposition"] ||
    (typeof response.headers?.get === "function" ? response.headers.get("content-disposition") : undefined);

  if (disposition && typeof disposition === "string") {
    const filenameMatch = disposition.match(/filename\*?=['"]?(?:UTF-\d['"]*)?([^;\r\n"']*)['"]?/i);
    if (filenameMatch && filenameMatch[1]) {
      filename = decodeURIComponent(filenameMatch[1]);
    }
  }

  const blob = new Blob([response.data], { type: "application/zip" });
  const downloadUrl = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = downloadUrl;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(downloadUrl);
}

export async function downloadFullProjectArchive(
  projectId: string,
  fallbackFilename: string = "novelova-project-archive.zip",
): Promise<void> {
  const response = await apiClient.get<Blob>(
    `/projects/${projectId}/export-archive`,
    {
      responseType: "blob",
    },
  );

  let filename = fallbackFilename;
  const disposition =
    response.headers?.["content-disposition"] ||
    (typeof response.headers?.get === "function" ? response.headers.get("content-disposition") : undefined);

  if (disposition && typeof disposition === "string") {
    const filenameMatch = disposition.match(/filename\*?=['"]?(?:UTF-\d['"]*)?([^;\r\n"']*)['"]?/i);
    if (filenameMatch && filenameMatch[1]) {
      filename = decodeURIComponent(filenameMatch[1]);
    }
  }

  const blob = new Blob([response.data], { type: "application/zip" });
  const downloadUrl = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = downloadUrl;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(downloadUrl);
}

export async function previewProjectArchive(
  file: File,
): Promise<ProjectArchivePreviewResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await apiClient.post<ApiResponse<ProjectArchivePreviewResponse>>(
    "/projects/preview-archive",
    formData,
    {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    },
  );
  return response.data.data;
}

export async function importProjectArchive(
  file: File,
  overrideTitle?: string,
): Promise<Project> {
  const formData = new FormData();
  formData.append("file", file);
  if (overrideTitle && overrideTitle.trim()) {
    formData.append("override_title", overrideTitle.trim());
  }

  const response = await apiClient.post<ApiResponse<Project>>(
    "/projects/import-archive",
    formData,
    {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    },
  );
  return response.data.data;
}





