/**
 * "Erase everything": the steps and the recovery rule. Pure, so interrupted and repeated erases
 * are tested against the real vault code (erasePlan.test.ts); src/state/erase.ts runs it on device.
 *
 * Safe to repeat: every step succeeds when its data is already gone (deleting a missing key or
 * folder is not an error), every step runs even if an earlier one failed, and the order means
 * any interruption leaves the vault unreadable or absent, never half-readable:
 *   1. vault.wipeAll: device secret first (crypto-shreds every blob), then headers and records
 *   2. local attachment files
 *   3. lockout counters, keypad and language settings
 *   4. RTL flags back to fresh-install values
 */
import type { Vault } from "../lib/vault/vault";

/** SecureStore keys outside the vault. Single source: device.ts and languagePlan.ts use these. */
export const DEVICE_FAILED_ATTEMPTS_KEY = "device_failed_attempts";
export const DEVICE_LOCKOUT_UNTIL_KEY = "device_lockout_until";
export const RANDOMIZE_KEYPAD_KEY = "randomize_keypad";

export type EraseDeps = {
  vault: Pick<Vault, "wipeAll">;
  deleteAllAttachments: () => Promise<void>;
  deleteSecure: (key: string) => Promise<void>;
  resetLayout: () => Promise<void>;
};

export type EraseResult = { complete: boolean; failedSteps: string[] };

export async function runErase(deps: EraseDeps, keysOutsideVault: readonly string[]): Promise<EraseResult> {
  const failedSteps: string[] = [];
  const step = async (name: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch {
      failedSteps.push(name);
    }
  };
  await step("vault", () => deps.vault.wipeAll());
  await step("attachments", () => deps.deleteAllAttachments());
  for (const key of keysOutsideVault) await step(`key:${key}`, () => deps.deleteSecure(key));
  await step("layout", () => deps.resetLayout());
  return { complete: failedSteps.length === 0, failedSteps };
}

/**
 * Errors that mean the stored data can never be opened again (the device secret is gone, or
 * the vault is half-erased), so the PIN screen or setup offers "Erase everything" without a
 * PIN. Not offered for UNSUPPORTED_FORMAT (a newer app version may still read the data) or
 * for transient or unknown errors.
 */
const UNRECOVERABLE = new Set(["DEVICE_SECRET_MISSING", "NOT_INITIALIZED", "ALREADY_INITIALIZED"]);

export function offersRecoveryErase(error: unknown): boolean {
  const code = error && typeof error === "object" && "code" in error ? (error as { code?: unknown }).code : undefined;
  return typeof code === "string" && UNRECOVERABLE.has(code);
}
