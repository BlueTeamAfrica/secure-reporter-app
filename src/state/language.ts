/**
 * Language switch for the RTL reload test. Stored outside the vault; holds only the language code.
 */
import { I18nManager } from "react-native";
import * as SecureStore from "expo-secure-store";
import * as Updates from "expo-updates";

import {
  clearRuntimeWorkingReportSnapshot,
  flushRuntimeWorkingReportSnapshotToStorage,
} from "./editorDraft";
import { LANGUAGE_KEY, parseLanguage, rtlFlagsFor, type Language } from "./languagePlan";
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
