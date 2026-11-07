import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { describe, it } from "node:test";

import { makeVault, VaultError, type VaultStorage } from "../lib/vault/vault.ts";
import { offersRecoveryErase, runErase } from "../state/erasePlan.ts";
import { simulateInterruptedErase } from "./simulateInterruptedErase.ts";

function setup() {
  const blobs = new Map<string, string>();
  const secure = new Map<string, string>();
  const storage: VaultStorage = {
    get: async (k) => blobs.get(k) ?? null,
    set: async (k, v) => void blobs.set(k, v),
    delete: async (k) => void blobs.delete(k),
    secureGet: async (k) => secure.get(k) ?? null,
    secureSet: async (k, v) => void secure.set(k, v),
    secureDelete: async (k) => void secure.delete(k),
  };
  const newVault = () =>
    makeVault({ storage, randomBytes: (n) => new Uint8Array(randomBytes(n)), kdfParams: { logN: 10, r: 8, p: 1 } });
  return { storage, blobs, secure, newVault };
}

describe("Diagnostics: simulate interrupted erase (test builds only)", () => {
  it("leaves the dead-end state 'device secret gone, vault left', which offers the recovery erase", async () => {
    const { storage, blobs, newVault } = setup();
    const v = newVault();
    await v.createVaults("482916", "7351");
    v.lock();
    const blobCount = blobs.size;

    await simulateInterruptedErase(storage, true);

    const after = newVault(); // after the app returns to the PIN screen / restarts
    assert.equal(await after.isInitialized(), true, "the app still goes to the PIN screen, not setup");
    assert.equal(blobs.size, blobCount, "vault blobs left in place");
    for (const pin of ["482916", "7351", "0000"]) {
      await assert.rejects(after.unlock(pin), (e: unknown) => {
        assert.ok(e instanceof VaultError && e.code === "DEVICE_SECRET_MISSING");
        assert.equal(offersRecoveryErase(e), true);
        return true;
      });
    }
  });

  it("the recovery erase then reaches first launch", async () => {
    const { storage, newVault } = setup();
    await newVault().createVaults("482916", "7351");
    await simulateInterruptedErase(storage, true);
    const r = await runErase(
      { vault: newVault(), deleteAllAttachments: async () => {}, deleteSecure: async () => {}, resetLayout: async () => {} },
      [],
    );
    assert.equal(r.complete, true);
    const fresh = newVault();
    assert.equal(await fresh.isInitialized(), false);
    await fresh.createVaults("1111", "2222");
  });

  it("refuses outside test builds and deletes nothing", async () => {
    const { storage, secure, newVault } = setup();
    await newVault().createVaults("482916", "7351");
    const before = [...secure.entries()];
    await assert.rejects(simulateInterruptedErase(storage, false));
    assert.deepEqual([...secure.entries()], before);
  });
});
