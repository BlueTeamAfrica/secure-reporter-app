/**
 * File names on the phone and in storage contain no part of the original file name: only the
 * attachment id and an extension (`<attachmentId>.<ext>`). The original name, Arabic included,
 * travels only inside the submission (payload and the existing `name` field), so the desk can
 * show and download it under that name. Pure.
 */
const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "text/plain": "txt",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/amr": "amr",
  "audio/3gpp": "3gp",
};

/** Lower-case ASCII extension from the name, else from the MIME type, else "bin". */
export function fileExtension(name: string, mimeType: string): string {
  const match = /\.([A-Za-z0-9]{1,8})$/.exec((name ?? "").trim());
  if (match) return match[1].toLowerCase();
  return MIME_EXTENSIONS[(mimeType ?? "").toLowerCase()] ?? "bin";
}

/** `<attachmentId>.<ext>`: the local copy's file name and the storage object name. */
export function attachmentFileName(attachmentId: string, name: string, mimeType: string): string {
  return `${attachmentId}.${fileExtension(name, mimeType)}`;
}

/** Fixed storage path per item: retries reuse it, so a crash never leaves a second copy. */
export function itemStoragePath(submissionId: string, attachmentId: string, name: string, mimeType: string): string {
  return `submissions/${submissionId}/attachments/${attachmentFileName(attachmentId, name, mimeType)}`;
}
