export interface ApiResponse<T = unknown> {
  success: boolean;
  data: T;
  message?: string;
  timestamp: string;
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  timestamp: string;
}

export interface HealthResponse {
  status: "ok" | "degraded" | "error";
  service: string;
  version: string;
  environment: string;
  uptimeSeconds: number;
  timestamp: string;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  meta: PaginationMeta;
}

export interface Item {
  id: string;
  title: string;
  description: string | null;
  status: "draft" | "published" | "archived";
  createdAt: string;
  updatedAt: string;
}

export interface CreateItemDto {
  title: string;
  description?: string;
  status?: "draft" | "published" | "archived";
}

export interface UpdateItemDto {
  title?: string;
  description?: string;
  status?: "draft" | "published" | "archived";
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: "admin" | "editor" | "viewer";
  createdAt: string;
}
