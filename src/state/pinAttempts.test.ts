import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { describe, it } from "node:test";

import { makeVault, type VaultStorage } from "../lib/vault/vault.ts";
import { afterFailedAttempt, HARD_COOLDOWN_MS, SOFT_DELAY_MS } from "./lockoutPolicy.ts";
import { guardedPinAttempt, type LockoutCounters } from "./pinAttempts.ts";

const REAL_PIN = "482916";
const COVER_PIN = "7351";

function memoryStorage(): VaultStorage {
  const blobs = new Map<string, string>();
  const secure = new Map<string, string>();
  return {
    get: async (k) => blobs.get(k) ?? null,
    set: async (k, v) => void blobs.set(k, v),
    delete: async (k) => void blobs.delete(k),
    secureGet: async (k) => secure.get(k) ?? null,
    secureSet: async (k, v) => void secure.set(k, v),
    secureDelete: async (k) => void secure.delete(k),
  };
}

/** The PIN screen's counters (device.ts), in memory: same policy function, same reset rule. */
function counters(clock: { now: number }) {
  const state = { failed: 0, lockoutUntil: null as number | null, recorded: 0, resets: 0 };
  const c: LockoutCounters = {
    getLockoutUntil: async () => (state.lockoutUntil !== null && clock.now < state.lockoutUntil ? state.lockoutUntil : null),
    recordFailedAttempt: async () => {
      state.recorded++;
      const r = afterFailedAttempt(state.failed, clock.now);
      state.failed = r.failedAttempts;
      if (r.lockoutUntil !== null) state.lockoutUntil = r.lockoutUntil;
      return r;
    },
    resetFailedAttempts: async () => {
      state.resets++;
      state.failed = 0;
      state.lockoutUntil = null;
    },
  };
  return { c, state };
}

async function openVault() {
  let scrypts = 0;
  const vault = makeVault({
    storage: memoryStorage(),
    randomBytes: (n) => new Uint8Array(randomBytes(n)),
    kdfParams: { logN: 10, r: 8, p: 1 },
    scrypt: async (pw, salt, o) => {
      scrypts++;
      const { scryptAsync } = await import("@noble/hashes/scrypt.js");
      return scryptAsync(pw, salt, o);
    },
  });
  await vault.createVaults(REAL_PIN, COVER_PIN);
  return { vault, scrypts: () => scrypts };
}

describe("in-session PIN checks and the lockout", () => {
  it("each wrong check counts toward the existing lockout; the 3rd starts the delay", async () => {
    const { vault } = await openVault();
    const clock = { now: 1_000_000 };
    const { c, state } = counters(clock);
    const check = (pin: string) => guardedPinAttempt(c, () => vault.checkPin("cover", pin));

    assert.deepEqual(await check("1111"), { ok: false, reason: "wrong" });
    assert.deepEqual(await check(REAL_PIN), { ok: false, reason: "wrong" }, "the real PIN is wrong for cover");
    assert.equal(state.failed, 2);
    assert.deepEqual(await check("2222"), { ok: false, reason: "locked", lockoutUntil: clock.now + SOFT_DELAY_MS });
    assert.equal(state.recorded, 3);
    assert.equal(vault.currentKind(), "real", "session untouched");
  });

  it("while locked out, nothing is checked (no key derivation) and nothing is counted", async () => {
    const { vault, scrypts } = await openVault();
    const clock = { now: 5_000 };
    const { c, state } = counters(clock);
    state.lockoutUntil = clock.now + 10_000;
    const before = scrypts();
    const r = await guardedPinAttempt(c, () => vault.checkPin("real", REAL_PIN));
    assert.deepEqual(r, { ok: false, reason: "locked", lockoutUntil: 15_000 });
    assert.equal(scrypts(), before);
    assert.equal(state.recorded, 0);
  });

  it("after 5 wrong attempts the long cooldown applies, as at unlock", async () => {
    const { vault } = await openVault();
    const clock = { now: 0 };
    const { c } = counters(clock);
    let last;
    for (let i = 0; i < 5; i++) {
      last = await guardedPinAttempt(c, () => vault.checkPin("real", "9999"));
      clock.now += SOFT_DELAY_MS + 1; // wait out each short delay
    }
    assert.deepEqual(last, { ok: false, reason: "locked", lockoutUntil: 4 * (SOFT_DELAY_MS + 1) + HARD_COOLDOWN_MS });
  });

  it("a correct PIN resets the counter; a malformed PIN is an error, not a wrong try", async () => {
    const { vault } = await openVault();
    const { c, state } = counters({ now: 0 });
    await guardedPinAttempt(c, () => vault.checkPin("real", "9999"));
    assert.deepEqual(await guardedPinAttempt(c, () => vault.checkPin("real", REAL_PIN)), { ok: true });
    assert.equal(state.failed, 0);
    assert.equal(state.resets, 1);
    await assert.rejects(guardedPinAttempt(c, () => vault.checkPin("real", "1")));
    assert.equal(state.recorded, 1);
  });
});

describe("lockout policy (unchanged from the PIN screen)", () => {
  it("1-2 wrong: no lock; 3-4: short delay; 5: long cooldown and reset", () => {
    assert.deepEqual(afterFailedAttempt(0, 0), { failedAttempts: 1, locked: false, lockoutUntil: null });
    assert.deepEqual(afterFailedAttempt(1, 0), { failedAttempts: 2, locked: false, lockoutUntil: null });
    assert.deepEqual(afterFailedAttempt(2, 0), { failedAttempts: 3, locked: true, lockoutUntil: SOFT_DELAY_MS });
    assert.deepEqual(afterFailedAttempt(3, 0), { failedAttempts: 4, locked: true, lockoutUntil: SOFT_DELAY_MS });
    assert.deepEqual(afterFailedAttempt(4, 0), { failedAttempts: 0, locked: true, lockoutUntil: HARD_COOLDOWN_MS });
  });
});
