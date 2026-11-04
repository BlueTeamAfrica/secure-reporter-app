/** Local file URIs end in `<attachmentId>_<file name>`, so they are never logged or stored. */
function redactLocalUris(message: string): string {
  return message.replace(/file:\/\/[^\s]{0,200}/g, "[local file]");
}

/** User-visible / log-safe formatting for send pipeline failures. */
export function formatSubmissionPipelineError(err: unknown): string {
  if (err && typeof err === "object") {
    const o = err as { code?: string; message?: string };
    if (typeof o.code === "string") {
      const msg = typeof o.message === "string" ? redactLocalUris(o.message) : "";
      if (o.code.startsWith("storage/")) {
        return `Cloud Storage (${o.code})${msg ? `: ${msg}` : ""}`.slice(0, 320);
      }
      if (o.code.startsWith("auth/")) {
        return `Authentication (${o.code})${msg ? `: ${msg}` : ""}`.slice(0, 320);
      }
      return `${o.code}${msg ? `: ${msg}` : ""}`.slice(0, 320);
    }
  }
  if (err instanceof Error) {
    return redactLocalUris(err.message).slice(0, 320);
  }
  return redactLocalUris(String(err)).slice(0, 320);
}
