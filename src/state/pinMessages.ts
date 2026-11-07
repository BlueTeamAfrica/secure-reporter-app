/**
 * User-facing messages for setup and unlock failures. Pure (no React Native imports) so the
 * mapping is unit-tested. Text lives in src/i18n/strings.ts; neutral wording (no "encrypted", "secure", "report").
 *
 * The same message is shown whichever vault a PIN belongs to: nothing here may reveal that a
 * second PIN exists.
 */
import { t, TABLES } from "../i18n/strings.ts";

type PinStrings = typeof TABLES.en.pin;

/**
 * The active language's PIN strings (getters over src/i18n/strings.ts, so the language chosen
 * at start-up applies). Same keys and English text as before.
 */
export const PIN_STRINGS = Object.defineProperties(
  {} as PinStrings,
  Object.fromEntries(
    (Object.keys(TABLES.en.pin) as (keyof PinStrings)[]).map((key) => [
      key,
      { enumerable: true, get: () => t().pin[key] },
    ]),
  ),
);

export type PinErrorMessage = string;

/** Maps a thrown error to a constant message. Never includes the error's own text. */
export function pinErrorMessage(error: unknown): PinErrorMessage {
  const code =
    error && typeof error === "object" && "code" in error ? (error as { code?: unknown }).code : undefined;
  switch (code) {
    case "INVALID_PIN":
      return PIN_STRINGS.errInvalidPin;
    case "PINS_NOT_DISTINCT":
      return PIN_STRINGS.setupSameAsFirst;
    case "UNSUPPORTED_FORMAT":
      return PIN_STRINGS.errUnsupported;
    case "DEVICE_SECRET_MISSING":
      return PIN_STRINGS.errDeviceKeyMissing;
    case "KDF_UNAVAILABLE":
      return PIN_STRINGS.errUnavailable;
    case "NOT_INITIALIZED":
      return PIN_STRINGS.errNotSetUp;
    default:
      return PIN_STRINGS.errGeneric;
  }
}

/** Errors after which retrying the same PIN cannot help (the screen disables the keypad). */
export function isPermanentUnlockError(error: unknown): boolean {
  const code =
    error && typeof error === "object" && "code" in error ? (error as { code?: unknown }).code : undefined;
  return code === "UNSUPPORTED_FORMAT" || code === "DEVICE_SECRET_MISSING" || code === "KDF_UNAVAILABLE";
}
