import type {
  ApiResponse,
  CreateItemDto,
  Item,
  PaginatedResponse,
  UpdateItemDto,
} from "@novelova/shared-types";
import { apiClient } from "./apiClient";

export async function getItems(
  page: number = 1,
  pageSize: number = 10,
  status?: string,
): Promise<PaginatedResponse<Item>> {
  const response = await apiClient.get<ApiResponse<PaginatedResponse<Item>>>(
    "/items",
    {
      params: { page, pageSize, status },
    },
  );
  return response.data.data;
}

export async function getItem(id: string): Promise<Item> {
  const response = await apiClient.get<ApiResponse<Item>>(`/items/${id}`);
  return response.data.data;
}

export async function createItem(dto: CreateItemDto): Promise<Item> {
  const response = await apiClient.post<ApiResponse<Item>>("/items", dto);
  return response.data.data;
}

export async function updateItem(
  id: string,
  dto: UpdateItemDto,
): Promise<Item> {
  const response = await apiClient.put<ApiResponse<Item>>(`/items/${id}`, dto);
  return response.data.data;
}

export async function deleteItem(id: string): Promise<void> {
  await apiClient.delete<ApiResponse<{ id: string; deleted: boolean }>>(
    `/items/${id}`,
  );
}
