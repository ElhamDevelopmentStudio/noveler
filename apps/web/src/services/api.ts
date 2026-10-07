import type {
  ApiResponse,
  CreateItemDto,
  HealthResponse,
  Item,
  PaginatedResponse,
} from "@novelova/shared-types";

const API_BASE = "/api/v1";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(
      errorBody?.detail ||
        errorBody?.error?.message ||
        `HTTP error ${response.status}`,
    );
  }

  return response.json();
}

export async function fetchHealth(): Promise<HealthResponse> {
  return request<HealthResponse>("/health");
}

export async function fetchItems(): Promise<PaginatedResponse<Item>> {
  const result = await request<ApiResponse<PaginatedResponse<Item>>>("/items");
  return result.data;
}

export async function createItem(dto: CreateItemDto): Promise<Item> {
  const result = await request<ApiResponse<Item>>("/items", {
    method: "POST",
    body: JSON.stringify(dto),
  });
  return result.data;
}

export async function deleteItem(id: string): Promise<void> {
  await request<ApiResponse<{ id: string; deleted: boolean }>>(`/items/${id}`, {
    method: "DELETE",
  });
}
