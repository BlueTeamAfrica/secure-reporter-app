/**
 * Erase everything on device (see erasePlan.ts for the rules). One path, used by Settings
 * (after the real code) and by the recovery button on a half-erased or unreadable vault.
 */
import { I18nManager } from "react-native";
import * as SecureStore from "expo-secure-store";

import { deleteAllImportedAttachments } from "../lib/attachments/persistLocal";
import { getVault } from "../lib/vault/expoStorage";
import {
  DEVICE_FAILED_ATTEMPTS_KEY,
  DEVICE_LOCKOUT_UNTIL_KEY,
  RANDOMIZE_KEYPAD_KEY,
  runErase,
  type EraseResult,
} from "./erasePlan";
import { reloadApp } from "./language";
import { DEFAULT_RTL_FLAGS, LANGUAGE_KEY } from "./languagePlan";
import { endSession } from "./session";

export const KEYS_OUTSIDE_VAULT = [
  DEVICE_FAILED_ATTEMPTS_KEY,
  DEVICE_LOCKOUT_UNTIL_KEY,
  RANDOMIZE_KEYPAD_KEY,
  LANGUAGE_KEY,
] as const;

export async function eraseEverything(): Promise<EraseResult> {
  endSession();
  return runErase(
    {
      vault: getVault(),
      deleteAllAttachments: deleteAllImportedAttachments,
      deleteSecure: (key) => SecureStore.deleteItemAsync(key),
      resetLayout: async () => {
        I18nManager.allowRTL(DEFAULT_RTL_FLAGS.allowRTL);
        I18nManager.forceRTL(DEFAULT_RTL_FLAGS.forceRTL);
      },
    },
    KEYS_OUTSIDE_VAULT,
  );
}

/**
 * Erases and reloads to first launch. Returns false if the reload itself is unavailable, so the
 * caller can route to "/" instead. A partial erase can simply be run again.
 */
export async function eraseEverythingAndRestart(): Promise<boolean> {
  await eraseEverything();
  try {
    await reloadApp();
    return true;
  } catch {
    return false;
  }
}
