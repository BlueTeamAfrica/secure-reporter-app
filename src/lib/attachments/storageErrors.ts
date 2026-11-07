/**
 * Classifies a storage upload error (Supabase StorageApiError: HTTP `status`, server
 * `statusCode`, `message`). Pure.
 * - "exists": the object is already at its fixed path, from an earlier attempt of this item.
 * - "too_large": the server refuses the file for its size; retrying can't help.
 */
export type StorageErrorKind = "exists" | "too_large" | "other";

export function classifyStorageError(error: unknown): StorageErrorKind {
  if (!error || typeof error !== "object") return "other";
  const e = error as { status?: unknown; statusCode?: unknown; message?: unknown; error?: unknown };
  const status = typeof e.status === "number" ? e.status : Number(e.status);
  const code = String(e.statusCode ?? "");
  const text = `${typeof e.message === "string" ? e.message : ""} ${typeof e.error === "string" ? e.error : ""}`;
  if (status === 409 || code === "409" || /already exists|duplicate/i.test(text)) return "exists";
  if (status === 413 || code === "413" || /maximum allowed size|too large|payload too large/i.test(text)) {
    return "too_large";
  }
  return "other";
}
