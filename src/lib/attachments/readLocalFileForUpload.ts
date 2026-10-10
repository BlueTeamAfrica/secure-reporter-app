import * as FileSystem from "expo-file-system/legacy";

/** Thrown when the sandbox path no longer exists (purge/OS cleanup); submission text should still proceed. */
export const ATTACHMENT_LOCAL_FILE_MISSING_CODE = "attachment/local_file_missing";

export function normalizeLocalFileUri(uri: string): string {
  const t = uri.trim();
  if (t.startsWith("file://")) return t;
  if (t.startsWith("/")) return `file://${t}`;
  return t;
}

export function missingLocalAttachmentError(): Error & { code: string } {
  const err = new Error("Local attachment file is missing or not a file") as Error & { code: string };
  err.code = ATTACHMENT_LOCAL_FILE_MISSING_CODE;
  return err;
}

/** True when the attachment URI pointed at nothing readable (skip upload; do not fail the report). */
export function isMissingLocalAttachmentError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = "code" in err ? (err as { code?: unknown }).code : undefined;
  if (code === ATTACHMENT_LOCAL_FILE_MISSING_CODE) return true;

  const nested =
    "cause" in err && err.cause && typeof err.cause === "object" && "code" in err.cause
      ? (err.cause as { code?: unknown }).code
      : undefined;
  if (nested === ATTACHMENT_LOCAL_FILE_MISSING_CODE) return true;

  const msg =
    err instanceof Error
      ? err.message
      : typeof (err as { message?: unknown }).message === "string"
        ? String((err as { message: string }).message)
        : "";
  if (!msg) return false;
  const m = msg.toLowerCase();
  if (m.includes("enoent")) return true;
  if (m.includes("no such file")) return true;
  if (m.includes("does not exist")) return true;
  if (m.includes("filenotfoundexception")) return true;
  if (m.includes("file not found")) return true;
  if (
    (m.includes("couldn't be opened") || m.includes("could not be opened")) &&
    (m.includes("no such") || m.includes("doesn't exist") || m.includes("does not exist"))
  ) {
    return true;
  }
  return false;
}

/** Preflight before relay upload: confirms local file exists (no binary read into JS). */
export async function assertLocalAttachmentReadable(localUri: string): Promise<void> {
  const trimmed = localUri.trim();
  if (!trimmed) {
    throw missingLocalAttachmentError();
  }

  const uri = normalizeLocalFileUri(trimmed);
  let info: FileSystem.FileInfo;
  try {
    info = await FileSystem.getInfoAsync(uri);
  } catch (e) {
    if (isMissingLocalAttachmentError(e)) throw missingLocalAttachmentError();
    throw e;
  }
  // Avoid logging local file URIs (may include filenames or sensitive paths).
  console.log("[SEND:relay] local file preflight", {
    exists: info.exists,
    isDirectory: info.exists ? info.isDirectory : undefined,
    size: info.exists ? info.size : undefined,
  });
  if (!info.exists || info.isDirectory) {
    throw missingLocalAttachmentError();
  }
}
