/**
 * TEST BUILDS ONLY. Diagnostics action "Simulate interrupted erase". Removed together with
 * Diagnostics before the reporter's APK (delete this folder with app/settings/storage-check.tsx).
 *
 * Leaves dead-end state 1 of the Phase 2b erase review: an erase killed right after its first
 * step. The device secret is deleted (exactly what vault.wipeAll does first), the vault blobs
 * stay. Every blob is then unreadable for good; the PIN screen reports DEVICE_SECRET_MISSING
 * and offers the recovery "Erase everything". Vault format and encryption are not touched.
 */
import { __internals, type VaultStorage } from "../lib/vault/vault.ts";

export async function simulateInterruptedErase(
  storage: Pick<VaultStorage, "secureDelete">,
  isTestBuild: boolean,
): Promise<void> {
  if (!isTestBuild) throw new Error("Not available.");
  await storage.secureDelete(__internals.DEVICE_SECRET_KEY);
}
