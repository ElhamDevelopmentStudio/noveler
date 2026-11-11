import { apiClient } from "./api-client";
import type {
  ApiResponse,
  TaggedProjectSummary,
  ExportTaggedDatasetPayload,
} from "@novelova/shared-types";

export async function getTaggedProjectsSummary(): Promise<TaggedProjectSummary[]> {
  const response = await apiClient.get<ApiResponse<TaggedProjectSummary[]>>(
    "/exports/tagged/summary",
  );
  return response.data.data;
}

export async function downloadTaggedDataset(
  payload: ExportTaggedDatasetPayload,
  fallbackFilename: string = "novelova_tagged_dataset.zip",
): Promise<void> {
  const response = await apiClient.post<Blob>(
    "/exports/tagged/download",
    payload,
    {
      responseType: "blob",
    },
  );

  let filename = fallbackFilename;
  const disposition =
    response.headers?.["content-disposition"] ||
    (typeof response.headers?.get === "function"
      ? response.headers.get("content-disposition")
      : undefined);

  if (disposition && typeof disposition === "string") {
    const filenameMatch = disposition.match(
      /filename\*?=['"]?(?:UTF-\d['"]*)?([^;\r\n"']*)['"]?/i,
    );
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
