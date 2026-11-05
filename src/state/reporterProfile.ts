import { getVault } from "../lib/vault/expoStorage";
import { isRealSession } from "./session";

/**
 * Stored in the real vault's "profile" record (encrypted by the vault; readable only in a
 * real session). Sent as plaintext metadata on the Firestore doc at submission time.
 */
export type ReporterProfile = {
  reporterName: string;
  reporterRegion: string;
  reporterPhone: string;
  /** Reserved for future alias-based identity; V1 uses real names in `reporterName`. */
  reporterAlias: string;
};

export type ReporterFirestoreFields = {
  reporterName: string;
  reporterRegion: string;
  reporterPhone: string;
  reporterAlias: string;
};

/** Null when locked, in a cover session, when no profile is saved, or if it can't be read. */
export async function getReporterProfile(): Promise<ReporterProfile | null> {
  if (!isRealSession()) return null;
  try {
    const parsed = await getVault().get<Partial<ReporterProfile>>("profile");
    if (!parsed || typeof parsed !== "object") return null;
    return {
      reporterName: typeof parsed.reporterName === "string" ? parsed.reporterName : "",
      reporterRegion: typeof parsed.reporterRegion === "string" ? parsed.reporterRegion : "",
      reporterPhone: typeof parsed.reporterPhone === "string" ? parsed.reporterPhone : "",
      reporterAlias: typeof parsed.reporterAlias === "string" ? parsed.reporterAlias : "",
    };
  } catch {
    return null;
  }
}

export async function saveReporterProfile(profile: ReporterProfile): Promise<void> {
  if (!isRealSession()) throw new Error("Vault locked");
  const normalized: ReporterProfile = {
    reporterName: profile.reporterName.trim(),
    reporterRegion: profile.reporterRegion.trim(),
    reporterPhone: profile.reporterPhone.trim(),
    reporterAlias: profile.reporterAlias.trim(),
  };
  await getVault().put("profile", normalized);
}

export async function hasReporterProfileComplete(): Promise<boolean> {
  const p = await getReporterProfile();
  return !!p?.reporterName?.trim();
}

/** Top-level Firestore strings; all keys always present for stable dashboard reads. */
export async function getReporterMetadataForSubmission(): Promise<ReporterFirestoreFields | null> {
  const p = await getReporterProfile();
  if (!p?.reporterName?.trim()) return null;
  return {
    reporterName: p.reporterName.trim(),
    reporterRegion: p.reporterRegion.trim(),
    reporterPhone: p.reporterPhone.trim(),
    reporterAlias: p.reporterAlias.trim(),
  };
}
