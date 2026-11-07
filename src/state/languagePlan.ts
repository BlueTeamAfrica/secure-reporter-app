/**
 * Pure language decisions (no React Native imports, so they are unit-tested).
 * The stored value is one of these two codes and nothing else.
 */
export type Language = "en" | "ar";

/** SecureStore key, outside the vault: the PIN screen needs the language before unlock. */
export const LANGUAGE_KEY = "app_language";

/** Anything other than a known code reads as "not set". */
export function parseLanguage(value: string | null | undefined): Language | null {
  return value === "en" || value === "ar" ? value : null;
}

/**
 * React Native lays out RTL when forced, or when allowed on a device whose own language is RTL.
 * English therefore turns off both: with allowRTL left on, an Arabic-language phone stays RTL.
 */
export function rtlFlagsFor(language: Language): { allowRTL: boolean; forceRTL: boolean } {
  const rtl = language === "ar";
  return { allowRTL: rtl, forceRTL: rtl };
}

export function otherLanguage(language: Language): Language {
  return language === "ar" ? "en" : "ar";
}

/** A reload is needed only when the layout direction must change. */
export function needsReload(language: Language, isRTLNow: boolean): boolean {
  return (language === "ar") !== isRTLNow;
}

/** Fresh-install values of React Native's RTL flags, restored by "Erase everything". */
export const DEFAULT_RTL_FLAGS = { allowRTL: true, forceRTL: false } as const;
