import { api, ApiError, apiUrl, tokenStore } from "./api";
import { uploadInChunks, UploadCancelled, type Progress, type Transport } from "./chunkedUpload";
import type { DocDocument } from "./types";

/** File types Document Q&A can read. */
export const DOC_ACCEPT = ".pdf,.docx,.txt,.md,.markdown,.rst";
export const DOC_TYPES_LABEL = "PDF, Word (.docx), text or Markdown";
export const isDocFile = (name: string) => /\.(pdf|docx|txt|md|markdown|rst)$/i.test(name);

/** Sends one piece with XMLHttpRequest, which (unlike fetch) reports upload progress. */
function sendChunk(uploadId: string, index: number, body: Blob, onBytes: (sent: number) => void, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", apiUrl(`/doc-qa/uploads/${uploadId}/chunks/${index}`));
    const token = tokenStore.get();
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.upload.onprogress = (e) => onBytes(e.loaded);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      let message = `Upload failed (${xhr.status})`;
      try { message = JSON.parse(xhr.responseText).detail ?? message; } catch { /* not JSON */ }
      reject(new ApiError(xhr.status, message));
    };
    xhr.onerror = () => reject(new ApiError(0, "Network problem while uploading. Retrying…"));
    xhr.onabort = () => reject(new UploadCancelled());
    signal.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(body);
  });
}

export const httpTransport: Transport = {
  start: (f) => api.post("/doc-qa/uploads", { filename: f.name, size: f.size }),
  sendChunk,
  complete: (id) => api.post(`/doc-qa/uploads/${id}/complete`),
  cancel: (id) => api.del(`/doc-qa/uploads/${id}`),
};

/**
 * Uploads one document in pieces. Resolves with the document as soon as the upload is complete
 * (its status is then "processing" while the server reads and indexes it).
 */
export function uploadDocument(file: File, opts: { onProgress?: (p: Progress) => void; signal?: AbortSignal } = {}) {
  if (!isDocFile(file.name)) return Promise.reject(new ApiError(400, `Unsupported file type. Use ${DOC_TYPES_LABEL}.`));
  return uploadInChunks<DocDocument>(file, httpTransport, opts);
}

export type DocUploadResult = { uploaded: DocDocument[]; failed: { name: string; message: string }[] };

/** Uploads several documents one after another and reports which succeeded. */
export async function uploadDocuments(files: File[]): Promise<DocUploadResult> {
  const out: DocUploadResult = { uploaded: [], failed: [] };
  for (const f of files) {
    try {
      out.uploaded.push(await uploadDocument(f));
    } catch (e) {
      out.failed.push({ name: f.name, message: (e as Error).message });
    }
  }
  return out;
}

export const fmtBytes = (n: number) =>
  n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${(n / 1024).toFixed(0)} KB` : n < 1024 ** 3 ? `${(n / 1024 ** 2).toFixed(1)} MB` : `${(n / 1024 ** 3).toFixed(2)} GB`;
