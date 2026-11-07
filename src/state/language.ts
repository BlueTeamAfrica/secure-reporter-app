/**
 * Language choice. Stored outside the vault (the PIN screen needs it before unlock); holds only
 * the language code. A change of layout direction needs a reload (forceRTL + reloadAsync).
 */
import { I18nManager } from "react-native";
import * as SecureStore from "expo-secure-store";
import * as Updates from "expo-updates";

import {
  clearRuntimeWorkingReportSnapshot,
  flushRuntimeWorkingReportSnapshotToStorage,
} from "./editorDraft";
import {
  LANGUAGE_KEY,
  needsReload,
  parseLanguage,
  rtlFlagsFor,
  type Language,
} from "./languagePlan";
import { endSession } from "./session";

/**
 * forceRTL gives no completion signal and reloadAsync runs on a different native queue, so this
 * gives the flags time to reach native before the reload starts.
 */
const NATIVE_FLAGS_SETTLE_MS = 200;

export async function getStoredLanguage(): Promise<Language | null> {
  return parseLanguage(await SecureStore.getItemAsync(LANGUAGE_KEY));
}

/**
 * Closes the session the way a lock does (flush, then overwrite the data key), applies the RTL
 * flags and reloads. The new JS runtime starts locked, so the next screen is the PIN screen.
 *
 * Throws with the session still open if the language can't be stored. Throws with the session
 * closed if the reload fails: the caller checks isSessionUnlocked() to tell which.
 */
export async function switchLanguageAndReload(next: Language): Promise<void> {
  await flushRuntimeWorkingReportSnapshotToStorage();
  await SecureStore.setItemAsync(LANGUAGE_KEY, next);
  clearRuntimeWorkingReportSnapshot();

  const flags = rtlFlagsFor(next);
  I18nManager.allowRTL(flags.allowRTL);
  I18nManager.forceRTL(flags.forceRTL);

  endSession();
  await new Promise((resolve) => setTimeout(resolve, NATIVE_FLAGS_SETTLE_MS));
  await Updates.reloadAsync();
}

/**
 * First launch: stores the choice and applies the RTL flags. Reloads only if the layout
 * direction must change; returns false when setup can simply continue. No session exists yet.
 */
export async function chooseLanguageAtSetup(language: Language): Promise<boolean> {
  await SecureStore.setItemAsync(LANGUAGE_KEY, language);
  const flags = rtlFlagsFor(language);
  I18nManager.allowRTL(flags.allowRTL);
  I18nManager.forceRTL(flags.forceRTL);
  if (!needsReload(language, I18nManager.isRTL)) return false;
  await new Promise((resolve) => setTimeout(resolve, NATIVE_FLAGS_SETTLE_MS));
  await Updates.reloadAsync();
  return true;
}

/** Reloads the JS app (after erase). Same mechanism as the language switch. */
export async function reloadApp(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, NATIVE_FLAGS_SETTLE_MS));
  await Updates.reloadAsync();
}
