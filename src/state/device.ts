import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import { clearSessionPin } from "./session";
import { clearAllDrafts } from "./drafts";
import { clearReporterProfile } from "./reporterProfile";

const DEVICE_CONFIGURED_KEY = "device_configured";
const DEVICE_PIN_HASH_KEY = "device_pin_hash";
const DEVICE_DECOY_PIN_HASH_KEY = "device_decoy_pin_hash";
const DEVICE_FAILED_ATTEMPTS_KEY = "device_failed_attempts";
const DEVICE_LOCKOUT_UNTIL_KEY = "device_lockout_until";

const SOFT_DELAY_AFTER_ATTEMPTS = 3;
const SOFT_DELAY_MS = 10 * 1000;
const HARD_COOLDOWN_AFTER_ATTEMPTS = 5;
const HARD_COOLDOWN_MS = 60 * 1000;

const RANDOMIZE_KEYPAD_KEY = "randomize_keypad";

async function hashPin(pin: string) {
  return await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    pin
  );
}

export async function isDeviceConfigured() {
  const value = await SecureStore.getItemAsync(DEVICE_CONFIGURED_KEY);
  return value === "true";
}

export async function markDeviceConfigured() {
  await SecureStore.setItemAsync(DEVICE_CONFIGURED_KEY, "true");
}

export async function clearDeviceConfigured() {
  clearSessionPin();
  await clearAllDrafts();
  await clearReporterProfile();
  await SecureStore.deleteItemAsync(DEVICE_CONFIGURED_KEY);
  await SecureStore.deleteItemAsync(DEVICE_PIN_HASH_KEY);
  await SecureStore.deleteItemAsync(DEVICE_DECOY_PIN_HASH_KEY);
  await SecureStore.deleteItemAsync(DEVICE_FAILED_ATTEMPTS_KEY);
  await SecureStore.deleteItemAsync(DEVICE_LOCKOUT_UNTIL_KEY);
}

export async function setDevicePin(pin: string) {
  const pinHash = await hashPin(pin);
  await SecureStore.setItemAsync(DEVICE_PIN_HASH_KEY, pinHash);
  await SecureStore.setItemAsync(DEVICE_FAILED_ATTEMPTS_KEY, "0");
  await SecureStore.deleteItemAsync(DEVICE_LOCKOUT_UNTIL_KEY);
}

export async function verifyDevicePin(pin: string) {
  const storedHash = await SecureStore.getItemAsync(DEVICE_PIN_HASH_KEY);
  if (!storedHash) return false;

  const incomingHash = await hashPin(pin);
  return storedHash === incomingHash;
}

export async function setDecoyPin(pin: string) {
  const pinHash = await hashPin(pin);
  await SecureStore.setItemAsync(DEVICE_DECOY_PIN_HASH_KEY, pinHash);
}

export async function hasDecoyPin() {
  const value = await SecureStore.getItemAsync(DEVICE_DECOY_PIN_HASH_KEY);
  return !!value;
}

export async function verifyDecoyPin(pin: string) {
  const storedHash = await SecureStore.getItemAsync(DEVICE_DECOY_PIN_HASH_KEY);
  if (!storedHash) return false;
  const incomingHash = await hashPin(pin);
  return storedHash === incomingHash;
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
  const current = await getFailedAttempts();
  const next = current + 1;

  // Threat hardening: progressive cooldowns without revealing extra modes.
  // - After 3 wrong attempts: 10s delay
  // - After 5 wrong attempts: 60s cooldown and reset counter
  if (next >= HARD_COOLDOWN_AFTER_ATTEMPTS) {
    const lockoutUntil = Date.now() + HARD_COOLDOWN_MS;
    await SecureStore.setItemAsync(DEVICE_FAILED_ATTEMPTS_KEY, "0");
    await SecureStore.setItemAsync(DEVICE_LOCKOUT_UNTIL_KEY, String(lockoutUntil));
    return { failedAttempts: 0, locked: true, lockoutUntil };
  }

  if (next >= SOFT_DELAY_AFTER_ATTEMPTS) {
    const lockoutUntil = Date.now() + SOFT_DELAY_MS;
    await SecureStore.setItemAsync(DEVICE_FAILED_ATTEMPTS_KEY, String(next));
    await SecureStore.setItemAsync(DEVICE_LOCKOUT_UNTIL_KEY, String(lockoutUntil));
    return { failedAttempts: next, locked: true, lockoutUntil };
  }

  await SecureStore.setItemAsync(DEVICE_FAILED_ATTEMPTS_KEY, String(next));
  return { failedAttempts: next, locked: false, lockoutUntil: null };
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
