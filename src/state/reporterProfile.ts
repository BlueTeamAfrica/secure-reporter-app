import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import { encryptDraftText, decryptDraftText } from "../lib/crypto/drafts";

const STORAGE_KEY = "reporter_profile_v1";
/**
 * Device-specific AES key for reporter profile encryption.
 * Stored in SecureStore (hardware-backed on iOS/Android).
 * Separate from the PIN so profile encryption survives PIN changes.
 */
const DEVICE_KEY_STORAGE = "reporter_profile_device_key";

async function getOrCreateDeviceProfileKey(): Promise<string> {
  const existing = await SecureStore.getItemAsync(DEVICE_KEY_STORAGE);
  if (existing) return existing;

  const bytes = await Crypto.getRandomBytesAsync(32);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  await SecureStore.setItemAsync(DEVICE_KEY_STORAGE, hex);
  return hex;
}

/** Persisted locally; mirrors top-level Firestore submission fields for dashboard use. */
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

export async function getReporterProfile(): Promise<ReporterProfile | null> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    const deviceKey = await getOrCreateDeviceProfileKey();

    // Try decryption first. Legacy plaintext profiles (pre-encryption) fall through to direct parse.
    let plaintext: string;
    try {
      const decrypted = decryptDraftText(raw, deviceKey);
      if (!decrypted) throw new Error("empty");
      plaintext = decrypted;
    } catch {
      // Legacy plaintext fallback — will be re-encrypted on next save.
      plaintext = raw;
    }

    const parsed = JSON.parse(plaintext) as Partial<ReporterProfile>;
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
  const normalized: ReporterProfile = {
    reporterName: profile.reporterName.trim(),
    reporterRegion: profile.reporterRegion.trim(),
    reporterPhone: profile.reporterPhone.trim(),
    reporterAlias: profile.reporterAlias.trim(),
  };
  const deviceKey = await getOrCreateDeviceProfileKey();
  const encrypted = encryptDraftText(JSON.stringify(normalized), deviceKey);
  await AsyncStorage.setItem(STORAGE_KEY, encrypted);
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

export async function clearReporterProfile(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
  await SecureStore.deleteItemAsync(DEVICE_KEY_STORAGE).catch(() => {});
}
