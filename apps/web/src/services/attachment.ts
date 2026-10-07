import { apiClient } from "./api-client";
import type { ApiResponse, Attachment } from "@novelova/shared-types";

export async function uploadAttachment(file: File): Promise<Attachment> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await apiClient.post<ApiResponse<Attachment>>(
    "/attachments/upload",
    formData,
    {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    },
  );

  return response.data.data;
}

export async function getAttachment(id: string): Promise<Attachment> {
  const response = await apiClient.get<ApiResponse<Attachment>>(
    `/attachments/${id}`,
  );
  return response.data.data;
}
