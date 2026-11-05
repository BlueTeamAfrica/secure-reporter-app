/**
 * Executes the one-time legacy wipe (see legacyWipePlan.ts) silently at startup, before any
 * setup/unlock routing. Never touches vault keys. Logs nothing but a count.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

import { deleteAllImportedAttachments } from "../lib/attachments/persistLocal";
import { getVault } from "../lib/vault/expoStorage";
import { LEGACY_ASYNC_KEYS, LEGACY_SECURE_MARKER_KEYS, planLegacyWipe } from "./legacyWipePlan";

let once: Promise<void> | null = null;

async function present<T extends string>(keys: readonly T[], read: (k: T) => Promise<string | null>) {
  const found: T[] = [];
  for (const key of keys) {
    if ((await read(key).catch(() => null)) !== null) found.push(key);
  }
  return found;
}

async function runLegacyWipe(): Promise<void> {
  const steps = planLegacyWipe({
    presentAsyncKeys: await present(LEGACY_ASYNC_KEYS, (k) => AsyncStorage.getItem(k)),
    presentSecureMarkers: await present(LEGACY_SECURE_MARKER_KEYS, (k) => SecureStore.getItemAsync(k)),
    vaultInitialized: await getVault().isInitialized(),
  });
  if (!steps.length) return;

  for (const step of steps) {
    try {
      if (step.kind === "deleteAttachmentFolder") await deleteAllImportedAttachments();
      else if (step.kind === "deleteAsync") await AsyncStorage.removeItem(step.key);
      else await SecureStore.deleteItemAsync(step.key);
    } catch {
      // Keep going; a remaining marker makes the next start retry.
    }
  }
  console.log("[startup] previous-version local data cleared", { steps: steps.length });
}

/** Idempotent; safe to await from several places. Never throws. */
export function ensureLegacyDataWiped(): Promise<void> {
  once ??= runLegacyWipe().catch(() => {
    once = null; // allow a retry on the next call
  });
  return once;
}
