/**
 * Device setup, unlock and lockout. No PIN and no PIN hash is stored anywhere: a PIN is
 * correct only if it opens a vault (see src/lib/vault/vault.ts).
 *
 * Lockout counters stay in plain SecureStore. They hold only a count and a timestamp.
 */
import * as SecureStore from "expo-secure-store";

import { deleteAllImportedAttachments } from "../lib/attachments/persistLocal";
import { getVault, getVaultScryptChoice } from "../lib/vault/expoStorage";
import { VaultError, type VaultKind } from "../lib/vault/vault";
import { afterFailedAttempt } from "./lockoutPolicy";
import { guardedPinAttempt, type PinAttemptResult } from "./pinAttempts";
import { endSession, markSessionStarted } from "./session";

const DEVICE_FAILED_ATTEMPTS_KEY = "device_failed_attempts";
const DEVICE_LOCKOUT_UNTIL_KEY = "device_lockout_until";

const RANDOMIZE_KEYPAD_KEY = "randomize_keypad";

/** Test builds show this in Diagnostics. Duration only; no PIN-dependent detail. */
let lastUnlockDurationMs: number | null = null;
export function getLastUnlockDurationMs() {
  return lastUnlockDurationMs;
}

export async function isDeviceConfigured() {
  return await getVault().isInitialized();
}

/** Throws VaultError("KDF_UNAVAILABLE") when this build cannot derive keys (no JS fallback). */
async function requireKeyDerivation() {
  if ((await getVaultScryptChoice()) !== "native") {
    throw new VaultError("KDF_UNAVAILABLE", "Key derivation is not available on this device.");
  }
}

/**
 * Creates both vaults. Leaves a REAL session open (markSessionStarted is called), so setup can
 * continue straight to the profile step.
 */
export async function createDevicePins(realPin: string, coverPin: string) {
  await requireKeyDerivation();
  await getVault().createVaults(realPin, coverPin);
  markSessionStarted();
  await resetFailedAttempts();
}

/**
 * Tries the PIN against both vaults (always both). Returns the kind that opened, or null for a
 * wrong PIN. Throws VaultError for INVALID_PIN, UNSUPPORTED_FORMAT, DEVICE_SECRET_MISSING,
 * KDF_UNAVAILABLE, NOT_INITIALIZED, CORRUPT.
 */
export async function unlockWithPin(pin: string): Promise<VaultKind | null> {
  await requireKeyDerivation();
  const t0 = Date.now();
  const result = await getVault().unlock(pin);
  lastUnlockDurationMs = Date.now() - t0;
  if (!result) return null;
  markSessionStarted();
  return result.kind;
}

/**
 * Erases everything on this phone: both vaults (device secret first, so the blobs are useless
 * even if a delete fails), every local attachment file, the lockout counters and the keypad
 * preference. Every step runs even if an earlier one fails. The language choice is removed by
 * the caller (language.ts), which then reloads to first launch.
 */
export async function wipeDevice(): Promise<{ complete: boolean }> {
  endSession();
  let complete = true;
  const step = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch {
      complete = false;
    }
  };
  await step(() => getVault().wipeAll());
  await step(() => deleteAllImportedAttachments());
  for (const key of [DEVICE_FAILED_ATTEMPTS_KEY, DEVICE_LOCKOUT_UNTIL_KEY, RANDOMIZE_KEYPAD_KEY]) {
    await step(() => SecureStore.deleteItemAsync(key));
  }
  return { complete };
}

/**
 * Sets a new code after the current one was checked (checkPinInSession). The vault refuses a
 * new code equal to the other one (PINS_NOT_DISTINCT); "real" re-checks the current code.
 */
export async function changeDevicePin(kind: VaultKind, currentPin: string, newPin: string) {
  await requireKeyDerivation();
  if (kind === "real") await getVault().changePin("real", currentPin, newPin);
  else await getVault().changePin("cover", null, newPin);
}

export async function getFailedAttempts() {
  const value = await SecureStore.getItemAsync(DEVICE_FAILED_ATTEMPTS_KEY);
  return Number(value ?? "0");
}

export async function resetFailedAttempts() {
  await SecureStore.setItemAsync(DEVICE_FAILED_ATTEMPTS_KEY, "0");
  await SecureStore.deleteItemAsync(DEVICE_LOCKOUT_UNTIL_KEY);
}

export async function recordFailedAttempt() {
  // Threat hardening: progressive cooldowns without revealing extra modes (lockoutPolicy.ts).
  const result = afterFailedAttempt(await getFailedAttempts(), Date.now());
  await SecureStore.setItemAsync(DEVICE_FAILED_ATTEMPTS_KEY, String(result.failedAttempts));
  if (result.lockoutUntil !== null) {
    await SecureStore.setItemAsync(DEVICE_LOCKOUT_UNTIL_KEY, String(result.lockoutUntil));
  }
  return result;
}

/**
 * Checks a PIN inside the open real session (Settings). Uses the same lockout counters as the
 * PIN screen; never changes the session. See pinAttempts.ts.
 */
export async function checkPinInSession(kind: VaultKind, pin: string): Promise<PinAttemptResult> {
  await requireKeyDerivation();
  return guardedPinAttempt(
    { getLockoutUntil, recordFailedAttempt, resetFailedAttempts },
    () => getVault().checkPin(kind, pin),
  );
}

export async function setRandomizeKeypad(enabled: boolean) {
  await SecureStore.setItemAsync(RANDOMIZE_KEYPAD_KEY, enabled ? "true" : "false");
}

export async function getRandomizeKeypadEnabled() {
  const v = await SecureStore.getItemAsync(RANDOMIZE_KEYPAD_KEY);
  return v === "true";
}

export async function getLockoutUntil() {
  const value = await SecureStore.getItemAsync(DEVICE_LOCKOUT_UNTIL_KEY);
  if (!value) return null;

  const timestamp = Number(value);
  if (Number.isNaN(timestamp)) return null;

  if (Date.now() >= timestamp) {
    await SecureStore.deleteItemAsync(DEVICE_LOCKOUT_UNTIL_KEY);
    return null;
  }

  return timestamp;
}

export function getRemainingLockSeconds(lockoutUntil: number) {
  return Math.max(0, Math.ceil((lockoutUntil - Date.now()) / 1000));
}
