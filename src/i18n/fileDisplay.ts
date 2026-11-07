/** Plain file type and size for the editor (S8): no MIME strings. Western digits. Pure. */
import { fmt, type Strings } from "./strings.ts";

export type FileKind = "image" | "pdf" | "document" | "text" | "audio" | "file";

export function fileKind(mimeType: string, name: string): FileKind {
  const m = (mimeType ?? "").toLowerCase();
  const ext = (/\.([a-z0-9]{1,8})$/i.exec(name ?? "")?.[1] ?? "").toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("audio/")) return "audio";
  if (m === "application/pdf" || ext === "pdf") return "pdf";
  if (m.startsWith("text/") || ext === "txt") return "text";
  if (m.includes("word") || m.includes("officedocument") || ["doc", "docx", "odt", "rtf"].includes(ext)) return "document";
  return "file";
}

export function formatFileSize(bytes: number, strings: Strings): string {
  const e = strings.editor;
  if (!(bytes > 0)) return "";
  if (bytes < 1024 * 1024) return fmt(e.sizeKB, { size: Math.max(1, Math.round(bytes / 1024)) });
  const mb = bytes / (1024 * 1024);
  return fmt(e.sizeMB, { size: mb < 10 ? mb.toFixed(1) : String(Math.round(mb)) });
}

export function fileDescription(mimeType: string, name: string, bytes: number, strings: Strings): string {
  const kind = strings.editor.kinds[fileKind(mimeType, name)];
  const size = formatFileSize(bytes, strings);
  return size ? `${kind} · ${size}` : kind;
}
