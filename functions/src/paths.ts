/** Mirrors app `storageObjectName` / `sanitizeFileName` — keep paths aligned with mobile. */

export function sanitizeFileName(name: string) {
  const trimmed = name.trim() || "attachment";
  const safe = trimmed.replace(/[^\w.\- ()\[\]]+/g, "_").replace(/_+/g, "_");
  return safe.slice(0, 160) || "attachment.bin";
}

export function storageObjectName(attachmentId: string, displayName: string) {
  const safe = sanitizeFileName(displayName);
  return `${attachmentId}_${safe}`;
}
