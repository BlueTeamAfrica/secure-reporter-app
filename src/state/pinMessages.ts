/**
 * User-facing messages for setup and unlock failures. Pure (no React Native imports) so the
 * mapping is unit-tested. English for now; neutral wording (no "encrypted", "secure", "report").
 *
 * The same message is shown whichever vault a PIN belongs to: nothing here may reveal that a
 * second PIN exists.
 */
export const PIN_STRINGS = {
  // Setup
  setupCreateTitle: "Create a code",
  setupCreateBody: "You will use this code every time you open the app. 4 to 6 digits.",
  setupConfirmTitle: "Confirm code",
  setupConfirmBody: "Enter the same code again to confirm.",
  setupSecondTitle: "Create a second code",
  setupSecondBody:
    "This code opens a simple notes view. Use it if you are ever made to open the app. It must be different from your first code.",
  setupSecondConfirmTitle: "Confirm second code",
  setupMismatch: "Codes do not match. Try again.",
  setupSameAsFirst: "The second code must be different from the first.",
  setupAckTitle: "Before you continue",
  setupAckBody:
    "If you forget your code, your drafts can't be recovered. There is no reset and no recovery.",
  setupAckButton: "I understand",
  setupWorking: "Setting up…",

  // Unlock
  unlockTitle: "Continue",
  unlockBody: "Enter your code to continue.",
  unlockButton: "Continue",
  unlockWorking: "Checking…",
  unlockTryAgain: "Try again.",
  unlockWait: "Please wait a moment.",

  // Errors (shared)
  errInvalidPin: "Use 4 to 6 digits.",
  errUnsupported: "This version can't open the data on this phone. Install the latest version.",
  errDeviceKeyMissing: "The data on this phone can't be opened on this device.",
  errUnavailable: "This version of the app is missing a required component. Install the latest version.",
  errNotSetUp: "The app needs to be set up again.",
  errGeneric: "Something went wrong. Try again.",
} as const;

export type PinErrorMessage =
  | typeof PIN_STRINGS.errInvalidPin
  | typeof PIN_STRINGS.errUnsupported
  | typeof PIN_STRINGS.errDeviceKeyMissing
  | typeof PIN_STRINGS.errUnavailable
  | typeof PIN_STRINGS.errNotSetUp
  | typeof PIN_STRINGS.errGeneric
  | typeof PIN_STRINGS.setupSameAsFirst;

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
