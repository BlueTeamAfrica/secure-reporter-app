/** "1.0.0 (12)": app version and Android versionCode (EAS remote, auto-incremented). Pure. */
export function versionLabel(version: string | null | undefined, buildNumber: string | null | undefined): string {
  const v = (version ?? "").trim() || "1.0.0";
  const b = (buildNumber ?? "").trim();
  return b ? `${v} (${b})` : v;
}
