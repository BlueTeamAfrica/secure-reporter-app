import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { describe, it } from "node:test";

import { makeVault, VaultError, type VaultStorage } from "../lib/vault/vault.ts";
import {
  DEVICE_FAILED_ATTEMPTS_KEY,
  DEVICE_LOCKOUT_UNTIL_KEY,
  offersRecoveryErase,
  RANDOMIZE_KEYPAD_KEY,
  runErase,
} from "./erasePlan.ts";
import { DEFAULT_RTL_FLAGS, LANGUAGE_KEY } from "./languagePlan.ts";

const REAL_PIN = "482916";
const COVER_PIN = "7351";
const KEYS = [DEVICE_FAILED_ATTEMPTS_KEY, DEVICE_LOCKOUT_UNTIL_KEY, RANDOMIZE_KEYPAD_KEY, LANGUAGE_KEY];
const KDF = { logN: 10, r: 8, p: 1 };

class AppDied extends Error {}

/**
 * The whole phone: vault storage, SecureStore, attachment files, RTL flags. `crashAfter` makes
 * every operation from the n-th on throw, as if the app was killed at that point (nothing
 * after it reaches storage).
 */
function phone() {
  const blobs = new Map<string, string>();
  const secure = new Map<string, string>();
  const files = new Set<string>();
  const flags = { allowRTL: false, forceRTL: false };
  let ops = 0;
  let crashAfter = Infinity;
  const op = () => {
    if (ops++ >= crashAfter) throw new AppDied("app killed");
  };
  const storage: VaultStorage = {
    get: async (k) => blobs.get(k) ?? null,
    set: async (k, v) => {
      op();
      blobs.set(k, v);
    },
    delete: async (k) => {
      op();
      blobs.delete(k);
    },
    secureGet: async (k) => secure.get(k) ?? null,
    secureSet: async (k, v) => {
      op();
      secure.set(k, v);
    },
    secureDelete: async (k) => {
      op();
      secure.delete(k);
    },
  };
  const newVault = () => makeVault({ storage, randomBytes: (n) => new Uint8Array(randomBytes(n)), kdfParams: KDF });
  const deps = (vault = newVault()) => ({
    vault,
    deleteAllAttachments: async () => {
      op();
      files.clear(); // idempotent, like FileSystem.deleteAsync(..., { idempotent: true })
    },
    deleteSecure: async (k: string) => {
      op();
      secure.delete(k); // deleting a missing key is not an error, as in expo-secure-store
    },
    resetLayout: async () => {
      op();
      Object.assign(flags, DEFAULT_RTL_FLAGS);
    },
  });
  return {
    blobs,
    secure,
    files,
    flags,
    newVault,
    deps,
    crashAt: (n: number) => {
      ops = 0;
      crashAfter = n;
    },
    noCrash: () => {
      crashAfter = Infinity;
    },
    opsCount: () => ops,
  };
}

async function installedPhone() {
  const p = phone();
  const vault = p.newVault();
  await vault.createVaults(REAL_PIN, COVER_PIN);
  await vault.put("reports", [{ id: "r1", title: "t", body: "b" }]);
  await vault.put("profile", { reporterName: "N" });
  vault.lock();
  for (const k of KEYS) p.secure.set(k, "x");
  p.files.add("a.jpg").add("b.pdf");
  p.flags.allowRTL = true;
  p.flags.forceRTL = true;
  return p;
}

/** "First launch": no vault, nothing outside it, default layout, and setup works again. */
async function assertFirstLaunch(p: ReturnType<typeof phone>) {
  const vault = p.newVault(); // a fresh JS runtime after the reload
  assert.equal(await vault.isInitialized(), false);
  assert.deepEqual([...p.blobs.keys()].filter((k) => k.startsWith("vault_")), []);
  assert.equal(p.secure.size, 0, `left in SecureStore: ${[...p.secure.keys()]}`);
  assert.equal(p.files.size, 0);
  assert.deepEqual(p.flags, DEFAULT_RTL_FLAGS);
  await vault.createVaults("1111", "2222");
  assert.deepEqual((vault.lock(), await vault.unlock("1111")), { kind: "real" });
  assert.equal(await vault.get("reports"), null, "nothing from before");
}

/**
 * What the app shows after an interrupted erase, with the old codes. Must never be a dead end:
 * either the vault still opens (the reporter can erase again from Settings), or setup works,
 * or the error offers the recovery erase.
 */
async function assertNotStuck(p: ReturnType<typeof phone>) {
  const vault = p.newVault();
  if (await vault.isInitialized()) {
    try {
      const r = await vault.unlock(REAL_PIN);
      assert.ok(r === null || r.kind === "real", "unlock gave an unexpected result");
      if (r === null) assert.fail("real code no longer opens, but no recovery offered");
    } catch (e) {
      assert.ok(offersRecoveryErase(e), `PIN screen stuck on ${(e as VaultError).code}`);
    }
    return;
  }
  try {
    await vault.createVaults("1111", "2222");
  } catch (e) {
    assert.ok(offersRecoveryErase(e), `setup stuck on ${(e as VaultError).code}`);
  }
}

describe("erase everything: interrupted, then repeated", () => {
  it("an uninterrupted erase ends at first launch, and a second erase is harmless", async () => {
    const p = await installedPhone();
    assert.deepEqual(await runErase(p.deps(), KEYS), { complete: true, failedSteps: [] });
    assert.deepEqual(await runErase(p.deps(), KEYS), { complete: true, failedSteps: [] }, "repeat on empty");
    await assertFirstLaunch(p);
  });

  it("interrupted at every single storage step: never stuck, and the repeat ends at first launch", async () => {
    // Count the operations of a full erase once, then crash before each of them in turn.
    const probe = await installedPhone();
    probe.crashAt(Infinity);
    await runErase(probe.deps(), KEYS);
    const total = probe.opsCount();
    assert.ok(total >= 18, `expected every step to be counted, got ${total}`);

    for (let n = 0; n <= total; n++) {
      const p = await installedPhone();
      p.crashAt(n);
      await runErase(p.deps(), KEYS); // the app dies at operation n
      p.noCrash();
      await assertNotStuck(p);
      const p2 = p; // after the reload the erase is run again (Settings or the recovery button)
      const again = await runErase(p2.deps(), KEYS);
      assert.equal(again.complete, true, `repeat after crash at ${n}: ${again.failedSteps}`);
      await assertFirstLaunch(p2);
    }
  });

  it("a failing step does not stop the others, and the run reports which one failed", async () => {
    const p = await installedPhone();
    const deps = p.deps();
    const r = await runErase({ ...deps, deleteAllAttachments: () => Promise.reject(new Error("io")) }, KEYS);
    assert.deepEqual(r, { complete: false, failedSteps: ["attachments"] });
    assert.equal(p.secure.size, 0, "keys still removed");
    assert.equal(await p.newVault().isInitialized(), false, "vault still removed");
    await runErase(p.deps(), KEYS);
    await assertFirstLaunch(p);
  });
});

describe("recovery erase is offered only when the data can never be opened", () => {
  it("offered for a missing device secret and a half-erased vault", () => {
    for (const code of ["DEVICE_SECRET_MISSING", "NOT_INITIALIZED", "ALREADY_INITIALIZED"] as const) {
      assert.equal(offersRecoveryErase(new VaultError(code, "")), true, code);
    }
  });

  it("not offered for a wrong code, a newer format, a locked lockout or unknown errors", () => {
    for (const code of ["INVALID_PIN", "UNSUPPORTED_FORMAT", "KDF_UNAVAILABLE", "CORRUPT", "LOCKED"] as const) {
      assert.equal(offersRecoveryErase(new VaultError(code, "")), false, code);
    }
    assert.equal(offersRecoveryErase(new Error("x")), false);
    assert.equal(offersRecoveryErase(null), false);
  });

  it("a wrong code on an intact vault is just wrong (null), never a recovery state", async () => {
    const p = await installedPhone();
    assert.equal(await p.newVault().unlock("0000"), null);
  });
});
