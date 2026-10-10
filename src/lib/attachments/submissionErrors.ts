/** User-visible / log-safe formatting for send pipeline failures. */
export function formatSubmissionPipelineError(err: unknown): string {
  if (err && typeof err === "object") {
    const o = err as { code?: string; message?: string };
    if (typeof o.code === "string") {
      const msg = typeof o.message === "string" ? o.message : "";
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
    return err.message.replace(/file:\/\/[^\s]{0,200}/g, "[local file]").slice(0, 320);
  }
  return String(err).slice(0, 320);
}
