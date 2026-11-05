/**
 * Vault tests: plain Node (node:test), run with `npm run test:vault`.
 * Node >= 22.18 strips the TypeScript types natively; no test framework or transpiler.
 */
import assert from "node:assert/strict";
import { createHash, randomBytes as nodeRandomBytes } from "node:crypto";
import { describe, it } from "node:test";

import { scryptAsync } from "@noble/hashes/scrypt.js";

import {
  __internals,
  DEFAULT_KDF_PARAMS,
  makeVault,
  VaultError,
  type KdfParams,
  type ScryptFn,
  type SlotId,
  type VaultErrorCode,
  type VaultStorage,
} from "./vault.ts";

const { headerStorageKey, recordStorageKey, openRecord, normalizePin, DEVICE_SECRET_KEY } = __internals;

// Low cost so the suite stays fast. Defaults are exercised in a dedicated test.
const FAST_KDF: KdfParams = { logN: 10, r: 8, p: 1 };
const REAL_PIN = "482916";
const COVER_PIN = "7351";

// ── Test doubles ─────────────────────────────────────────────────────────────

class MemoryStorage implements VaultStorage {
  blobs = new Map<string, string>();
  secure = new Map<string, string>();
  /** Max random delay (ms) on writes, to shuffle completion order of concurrent operations. */
  jitterMs = 0;

  private async delay() {
    if (this.jitterMs > 0) await new Promise((r) => setTimeout(r, Math.random() * this.jitterMs));
  }
  async get(key: string) {
    await this.delay();
    return this.blobs.get(key) ?? null;
  }
  async set(key: string, value: string) {
    await this.delay();
    this.blobs.set(key, value);
  }
  async delete(key: string) {
    await this.delay();
    this.blobs.delete(key);
  }
  async secureGet(key: string) {
    return this.secure.get(key) ?? null;
  }
  async secureSet(key: string, value: string) {
    this.secure.set(key, value);
  }
  async secureDelete(key: string) {
    this.secure.delete(key);
  }
}

type Setup = {
  storage: MemoryStorage;
  vault: ReturnType<typeof makeVault>;
  /** Copies of every 32-byte random output (device secret + both data keys). */
  random32: Uint8Array[];
  /** Live references to the same buffers, to check that lock() zeroes them. */
  random32Live: Uint8Array[];
  scryptSalts: string[];
};

function setup(opts: { slotBit?: number; kdf?: KdfParams } = {}): Setup {
  const storage = new MemoryStorage();
  const random32: Uint8Array[] = [];
  const random32Live: Uint8Array[] = [];
  const scryptSalts: string[] = [];
  const randomBytes = (n: number) => {
    const out = new Uint8Array(nodeRandomBytes(n));
    if (n === 1 && opts.slotBit !== undefined) out[0] = opts.slotBit;
    if (n === 32) {
      random32.push(out.slice());
      random32Live.push(out);
    }
    return out;
  };
  const scrypt: ScryptFn = (pw, salt, o) => {
    scryptSalts.push(Buffer.from(salt).toString("hex"));
    return scryptAsync(pw, salt, o);
  };
  const vault = makeVault({ storage, randomBytes, scrypt, kdfParams: opts.kdf ?? FAST_KDF });
  return { storage, vault, random32, random32Live, scryptSalts };
}

async function created(opts: { slotBit?: number } = {}) {
  const s = setup(opts);
  await s.vault.createVaults(REAL_PIN, COVER_PIN);
  s.vault.lock();
  return s;
}

/** Which slot is real, determined via the public API only (unlock + record readability). */
async function realSlotOf(s: Setup): Promise<SlotId> {
  // The real data key is random32[1] (device secret, real key, cover key: creation order).
  for (const slot of ["a", "b"] as const) {
    try {
      openRecord(s.random32[1], slot, "reports", s.storage.blobs.get(recordStorageKey(slot, 0))!);
      return slot;
    } catch {
      /* not this slot */
    }
  }
  throw new Error("real slot not found");
}

async function rejectsWith(p: Promise<unknown>, code: VaultErrorCode) {
  await assert.rejects(p, (e: unknown) => e instanceof VaultError && e.code === code);
}

function flipByte(b64: string, index: number): string {
  const b = Buffer.from(b64, "base64");
  b[index] ^= 0x01;
  return b.toString("base64");
}

const toArabicIndic = (pin: string) => pin.replace(/\d/g, (d) => String.fromCharCode(0x0660 + Number(d)));
const toEasternArabicIndic = (pin: string) => pin.replace(/\d/g, (d) => String.fromCharCode(0x06f0 + Number(d)));

// ── Tests ────────────────────────────────────────────────────────────────────

describe("vault", () => {
  it("round-trips records in both vaults, for both slot assignments", async () => {
    for (const slotBit of [0, 1]) {
      const { vault } = await created({ slotBit });
      assert.deepEqual(await vault.unlock(REAL_PIN), { kind: "real" });
      await vault.put("reports", [{ id: "r1", body: "مرحبا" }]);
      await vault.put("profile", { name: "x" });
      assert.deepEqual(await vault.get("reports"), [{ id: "r1", body: "مرحبا" }]);
      assert.deepEqual(await vault.get("profile"), { name: "x" });
      assert.equal(await vault.get("working"), null);
      vault.lock();

      assert.deepEqual(await vault.unlock(COVER_PIN), { kind: "cover" });
      assert.equal(await vault.get("notes"), null);
      await vault.put("notes", "shopping list");
      assert.equal(await vault.get("notes"), "shopping list");
      await rejectsWith(vault.get("reports"), "UNKNOWN_RECORD");
      vault.lock();

      await vault.unlock(REAL_PIN);
      assert.deepEqual(await vault.get("reports"), [{ id: "r1", body: "مرحبا" }]);
      await rejectsWith(vault.get("notes"), "UNKNOWN_RECORD");
      await vault.remove("profile");
      assert.equal(await vault.get("profile"), null);
    }
  });

  it("createVaults leaves a real session open; isInitialized reflects state", async () => {
    const { vault } = setup();
    assert.equal(await vault.isInitialized(), false);
    await vault.createVaults(REAL_PIN, COVER_PIN);
    assert.equal(vault.currentKind(), "real");
    assert.equal(await vault.isInitialized(), true);
    await rejectsWith(vault.createVaults("1111", "2222"), "ALREADY_INITIALIZED");
  });

  it("coverKey is internal and not reachable through the record API", async () => {
    const { vault } = await created();
    await vault.unlock(REAL_PIN);
    await rejectsWith(vault.get("coverKey" as never), "UNKNOWN_RECORD");
    await rejectsWith(vault.put("coverKey" as never, "x"), "UNKNOWN_RECORD");
  });

  it("returns null for a wrong PIN and rejects malformed PINs", async () => {
    const { vault } = await created();
    assert.equal(await vault.unlock("000000"), null);
    assert.equal(await vault.unlock("4829"), null);
    assert.equal(vault.currentKind(), null);
    for (const bad of ["123", "1234567", "", "12a4", "12 34", "١٢٣", "1234\n"]) {
      await rejectsWith(vault.unlock(bad), "INVALID_PIN");
    }
    await rejectsWith(vault.unlock(1234 as never), "INVALID_PIN");
    await rejectsWith(setup().vault.createVaults("12", COVER_PIN), "INVALID_PIN");
  });

  it("requires distinct PINs at creation (including across digit scripts)", async () => {
    await rejectsWith(setup().vault.createVaults("1234", "1234"), "PINS_NOT_DISTINCT");
    await rejectsWith(setup().vault.createVaults("1234", toArabicIndic("1234")), "PINS_NOT_DISTINCT");
  });

  it("changePin(real) keeps data, kills the old PIN, re-wraps only (no record re-encryption)", async () => {
    const s = await created();
    const { vault, storage } = s;
    await vault.unlock(REAL_PIN);
    await vault.put("reports", ["keep me"]);
    const slot = await realSlotOf(s);
    const recordsBefore = [0, 1, 2, 3, 4].map((i) => storage.blobs.get(recordStorageKey(slot, i)));
    const headerBefore = storage.blobs.get(headerStorageKey(slot))!;

    await rejectsWith(vault.changePin("real", "999999", "1357"), "WRONG_PIN");
    await rejectsWith(vault.changePin("real", REAL_PIN, "12"), "INVALID_PIN");
    await vault.changePin("real", REAL_PIN, "1357");

    const recordsAfter = [0, 1, 2, 3, 4].map((i) => storage.blobs.get(recordStorageKey(slot, i)));
    assert.deepEqual(recordsAfter, recordsBefore, "records must not be rewritten");
    const headerAfter = storage.blobs.get(headerStorageKey(slot))!;
    const salt = (h: string) => Buffer.from(h, "base64").subarray(5, 21).toString("hex");
    assert.notEqual(salt(headerAfter), salt(headerBefore), "new salt expected");

    vault.lock();
    assert.equal(await vault.unlock(REAL_PIN), null);
    assert.deepEqual(await vault.unlock("1357"), { kind: "real" });
    assert.deepEqual(await vault.get("reports"), ["keep me"]);
    vault.lock();
    assert.deepEqual(await vault.unlock(COVER_PIN), { kind: "cover" }, "cover untouched");
  });

  it("changePin(cover) from a real session works without the old cover PIN", async () => {
    const { vault } = await created();
    await vault.unlock(COVER_PIN);
    await vault.put("notes", "cover data");
    await rejectsWith(vault.changePin("cover", null, "2468"), "WRONG_SESSION");
    await rejectsWith(vault.changePin("real", COVER_PIN, "2468"), "WRONG_SESSION");
    vault.lock();

    await vault.unlock(REAL_PIN);
    await rejectsWith(vault.changePin("cover", COVER_PIN as never, "2468"), "INVALID_ARGUMENT");
    await vault.changePin("cover", null, "2468");
    vault.lock();

    assert.equal(await vault.unlock(COVER_PIN), null);
    assert.deepEqual(await vault.unlock("2468"), { kind: "cover" });
    assert.equal(await vault.get("notes"), "cover data");
    vault.lock();
    assert.deepEqual(await vault.unlock(REAL_PIN), { kind: "real" }, "real untouched");
  });

  it("rejects a new cover PIN equal to the real PIN (and vice versa)", async () => {
    const { vault } = await created();
    await vault.unlock(REAL_PIN);
    await rejectsWith(vault.changePin("cover", null, REAL_PIN), "PINS_NOT_DISTINCT");
    await rejectsWith(vault.changePin("cover", null, toEasternArabicIndic(REAL_PIN)), "PINS_NOT_DISTINCT");
    await rejectsWith(vault.changePin("real", REAL_PIN, COVER_PIN), "PINS_NOT_DISTINCT");
    vault.lock();
    assert.deepEqual(await vault.unlock(REAL_PIN), { kind: "real" });
    vault.lock();
    assert.deepEqual(await vault.unlock(COVER_PIN), { kind: "cover" });
  });

  it("each vault's data key cannot open the other vault's records", async () => {
    const s = await created();
    const realSlot = await realSlotOf(s);
    const coverSlot: SlotId = realSlot === "a" ? "b" : "a";
    const [, realKey, coverKey] = s.random32;
    const realBlob = s.storage.blobs.get(recordStorageKey(realSlot, 0))!;
    const coverBlob = s.storage.blobs.get(recordStorageKey(coverSlot, 0))!;
    // Same slot and name (identical AAD): only the key differs.
    assert.equal(openRecord(realKey, realSlot, "reports", realBlob), null);
    assert.equal(openRecord(coverKey, coverSlot, "notes", coverBlob), null);
    assert.throws(() => openRecord(coverKey, realSlot, "reports", realBlob), /verification/);
    assert.throws(() => openRecord(realKey, coverSlot, "notes", coverBlob), /verification/);
  });

  it("rejects tampered ciphertext, swapped record names and swapped slots", async () => {
    const s = await created();
    const { vault, storage } = s;
    const realSlot = await realSlotOf(s);
    const coverSlot: SlotId = realSlot === "a" ? "b" : "a";
    await vault.unlock(REAL_PIN);
    await vault.put("reports", ["x"]);
    await vault.put("profile", { p: 1 });
    const k = (i: number) => recordStorageKey(realSlot, i);
    const original = new Map(storage.blobs);

    // Tampered ciphertext (last byte = tag) and tampered nonce.
    storage.blobs.set(k(0), flipByte(original.get(k(0))!, 40));
    await rejectsWith(vault.get("reports"), "CORRUPT");
    storage.blobs.set(k(0), flipByte(original.get(k(0))!, 5));
    await rejectsWith(vault.get("reports"), "CORRUPT");
    storage.blobs.set(k(0), "%%%not base64%%%");
    await rejectsWith(vault.get("reports"), "CORRUPT");
    storage.blobs.set(k(0), original.get(k(0))!);

    // Swapped record names: "reports" blob moved into the "profile" position.
    storage.blobs.set(k(3), original.get(k(0))!);
    await rejectsWith(vault.get("profile"), "CORRUPT");
    storage.blobs.set(k(3), original.get(k(3))!);

    // Swapped slots: cover record at the same position copied into the real slot.
    storage.blobs.set(k(0), original.get(recordStorageKey(coverSlot, 0))!);
    await rejectsWith(vault.get("reports"), "CORRUPT");
    storage.blobs.set(k(0), original.get(k(0))!);
    assert.deepEqual(await vault.get("reports"), ["x"]);
    vault.lock();

    // Swapped headers: neither PIN opens anything.
    storage.blobs.set(headerStorageKey("a"), original.get(headerStorageKey("b"))!);
    storage.blobs.set(headerStorageKey("b"), original.get(headerStorageKey("a"))!);
    assert.equal(await vault.unlock(REAL_PIN), null);
    assert.equal(await vault.unlock(COVER_PIN), null);

    // Tampered header KDF params (bound in AAD and in the derivation): no unlock.
    storage.blobs.set(headerStorageKey("a"), original.get(headerStorageKey("a"))!);
    storage.blobs.set(headerStorageKey("b"), original.get(headerStorageKey("b"))!);
    const h = Buffer.from(original.get(headerStorageKey(realSlot))!, "base64");
    h[3] = 7; // r = 7
    storage.blobs.set(headerStorageKey(realSlot), h.toString("base64"));
    assert.equal(await vault.unlock(REAL_PIN), null);
  });

  it("Arabic-Indic, Eastern Arabic-Indic and ASCII digits are equivalent", async () => {
    assert.deepEqual(normalizePin("٤٨٢٩١٦"), normalizePin("482916"));
    assert.deepEqual(normalizePin("۴۸۲۹۱۶"), normalizePin("482916"));
    assert.deepEqual(normalizePin("4٨۲9١6"), normalizePin("482916"), "mixed scripts");

    const { vault } = setup();
    await vault.createVaults(toArabicIndic(REAL_PIN), toEasternArabicIndic(COVER_PIN));
    vault.lock();
    assert.deepEqual(await vault.unlock(REAL_PIN), { kind: "real" });
    vault.lock();
    assert.deepEqual(await vault.unlock(toEasternArabicIndic(REAL_PIN)), { kind: "real" });
    vault.lock();
    assert.deepEqual(await vault.unlock(COVER_PIN), { kind: "cover" });
    vault.lock();
    assert.deepEqual(await vault.unlock(toArabicIndic(COVER_PIN)), { kind: "cover" });
  });

  it("serialises writes: concurrent puts and updates never lose data", async () => {
    const { vault, storage } = await created();
    await vault.unlock(REAL_PIN);
    storage.jitterMs = 5; // random completion order underneath

    // 50 concurrent read-modify-write appends: all 50 must survive.
    await Promise.all(
      Array.from({ length: 50 }, (_, i) => vault.update<number[]>("reports", (cur) => [...(cur ?? []), i])),
    );
    assert.deepEqual(await vault.get("reports"), Array.from({ length: 50 }, (_, i) => i));

    // 50 concurrent puts to one name: the last call wins, never an earlier one.
    await Promise.all(Array.from({ length: 50 }, (_, i) => vault.put("working", { v: i })));
    assert.deepEqual(await vault.get("working"), { v: 49 });

    // Concurrent puts to different names all land; a get queued behind a put sees it.
    const p = Promise.all([vault.put("profile", "P"), vault.put("tombstones", ["T"])]);
    assert.deepEqual(await vault.get("profile"), "P");
    await p;
    assert.deepEqual(await vault.get("tombstones"), ["T"]);

    // A failing update does not break the queue.
    await assert.rejects(
      vault.update("reports", () => {
        throw new Error("boom");
      }),
    );
    assert.equal((await vault.get<number[]>("reports"))!.length, 50);
  });

  it("unlock always attempts both slots, for real, cover and wrong PINs", async () => {
    const s = await created();
    const saltOf = (slot: SlotId) =>
      Buffer.from(s.storage.blobs.get(headerStorageKey(slot))!, "base64").subarray(5, 21).toString("hex");
    for (const pin of [REAL_PIN, COVER_PIN, "000000"]) {
      s.scryptSalts.length = 0;
      await s.vault.unlock(pin);
      assert.deepEqual(s.scryptSalts, [saltOf("a"), saltOf("b")], `both derivations for each unlock`);
    }
  });

  it("lock() overwrites the in-memory key buffers and blocks access", async () => {
    const s = setup();
    await s.vault.createVaults(REAL_PIN, COVER_PIN);
    const liveRealKey = s.random32Live[1]; // the session holds this exact buffer after create
    assert.ok(liveRealKey.some((b) => b !== 0));
    s.vault.lock();
    assert.ok(liveRealKey.every((b) => b === 0), "key buffer zeroed");
    assert.ok(s.random32Live[2].every((b) => b === 0), "cover key zeroed after create");
    assert.ok(s.random32Live[0].every((b) => b === 0), "device secret zeroed after create");
    await rejectsWith(s.vault.get("reports"), "LOCKED");

    // A put queued before lock() must not run with a zeroed key.
    await s.vault.unlock(REAL_PIN);
    s.storage.jitterMs = 5;
    const pending = s.vault.put("reports", ["late"]);
    const queued = s.vault.put("profile", "late");
    s.vault.lock();
    await Promise.allSettled([pending, queued]);
    await rejectsWith(queued, "LOCKED");
  });

  it("wipeAll leaves nothing readable", async () => {
    const s = await created();
    await s.vault.unlock(REAL_PIN);
    await s.vault.put("reports", ["gone"]);
    await s.vault.wipeAll();
    assert.equal(s.storage.blobs.size, 0, "no blobs remain");
    assert.equal(s.storage.secure.size, 0, "device secret shredded");
    assert.equal(s.vault.currentKind(), null);
    assert.equal(await s.vault.isInitialized(), false);
    await rejectsWith(s.vault.unlock(REAL_PIN), "NOT_INITIALIZED");
    await rejectsWith(s.vault.get("reports"), "LOCKED");
    // And setup can start over.
    await s.vault.createVaults("1111", "2222");
    assert.equal(s.vault.currentKind(), "real");
  });

  it("blobs left behind without the device secret are useless (crypto-shredding)", async () => {
    const s = await created();
    s.storage.secure.delete(DEVICE_SECRET_KEY);
    await rejectsWith(s.vault.unlock(REAL_PIN), "DEVICE_SECRET_MISSING");
    s.storage.secure.set(DEVICE_SECRET_KEY, "00".repeat(32)); // a different secret
    assert.equal(await s.vault.unlock(REAL_PIN), null);
  });

  it("fails cleanly on an unknown format version", async () => {
    const s = await created();
    const realSlot = await realSlotOf(s);
    const header = Buffer.from(s.storage.blobs.get(headerStorageKey("a"))!, "base64");
    header[0] = 2;
    s.storage.blobs.set(headerStorageKey("a"), header.toString("base64"));
    await rejectsWith(s.vault.unlock(REAL_PIN), "UNSUPPORTED_FORMAT");
    header[0] = 1;
    header[1] = 9; // unknown KDF id
    s.storage.blobs.set(headerStorageKey("a"), header.toString("base64"));
    await rejectsWith(s.vault.unlock(REAL_PIN), "UNSUPPORTED_FORMAT");
    header[1] = 1;
    header[2] = 30; // absurd N must not be attempted
    s.storage.blobs.set(headerStorageKey("a"), header.toString("base64"));
    await rejectsWith(s.vault.unlock(REAL_PIN), "CORRUPT");
    header[2] = FAST_KDF.logN;
    s.storage.blobs.set(headerStorageKey("a"), header.toString("base64"));

    await s.vault.unlock(REAL_PIN);
    const rec = Buffer.from(s.storage.blobs.get(recordStorageKey(realSlot, 0))!, "base64");
    rec[0] = 2;
    s.storage.blobs.set(recordStorageKey(realSlot, 0), rec.toString("base64"));
    await rejectsWith(s.vault.get("reports"), "UNSUPPORTED_FORMAT");
  });

  it("stores no PIN, PIN hash, key or plaintext in any blob", async () => {
    const s = await created();
    await s.vault.unlock(REAL_PIN);
    const MARKER = "MARKER-plaintext-7f3a";
    await s.vault.put("reports", [{ body: MARKER }]);
    await s.vault.changePin("cover", null, "9182");
    await s.vault.changePin("real", REAL_PIN, "264813");
    s.vault.lock();
    await s.vault.unlock("9182");
    await s.vault.put("notes", MARKER);
    s.vault.lock();

    const [deviceSecret, realKey, coverKey] = s.random32;
    const needles: [string, Buffer][] = [];
    for (const pin of [REAL_PIN, COVER_PIN, "9182", "264813"]) {
      needles.push([`pin`, Buffer.from(pin)]);
      needles.push([`sha256(pin)`, createHash("sha256").update(pin).digest()]);
      needles.push([`sha256(pin) hex`, Buffer.from(createHash("sha256").update(pin).digest("hex"))]);
      needles.push([`md5(iv:pin)`, createHash("md5").update("iv:" + pin).digest()]);
    }
    for (const [label, key] of [["real key", realKey], ["cover key", coverKey]] as const) {
      needles.push([label, Buffer.from(key)]);
      needles.push([`${label} hex`, Buffer.from(Buffer.from(key).toString("hex"))]);
    }
    needles.push(["plaintext", Buffer.from(MARKER)]);

    const blobHaystacks = [...s.storage.blobs.values()].flatMap((v) => [Buffer.from(v), Buffer.from(v, "base64")]);
    // The device secret may only live in secure storage, never in blobs.
    const blobNeedles = [
      ...needles,
      ["device secret", Buffer.from(deviceSecret)] as [string, Buffer],
      ["device secret hex", Buffer.from(Buffer.from(deviceSecret).toString("hex"))] as [string, Buffer],
    ];
    for (const hay of blobHaystacks) {
      for (const [label, needle] of blobNeedles) assert.equal(hay.indexOf(needle), -1, `${label} found in a blob`);
    }
    for (const v of s.storage.secure.values()) {
      for (const [label, needle] of needles) assert.equal(Buffer.from(v).indexOf(needle), -1, `${label} in secure`);
    }
    assert.deepEqual([...s.storage.secure.keys()], [DEVICE_SECRET_KEY]);
  });

  it("both slots have identical shape: same keys and blob sizes at creation", async () => {
    const s = await created();
    const keys = [...s.storage.blobs.keys()].sort();
    assert.deepEqual(keys, [
      "vault_a", "vault_a_0", "vault_a_1", "vault_a_2", "vault_a_3", "vault_a_4",
      "vault_b", "vault_b_0", "vault_b_1", "vault_b_2", "vault_b_3", "vault_b_4",
    ]);
    const sizes = new Set([0, 1, 2, 3, 4].flatMap((i) => ["a", "b"].map((slot) =>
      s.storage.blobs.get(`vault_${slot}_${i}`)!.length)));
    assert.equal(sizes.size, 1, "all record blobs the same size");
    assert.equal(s.storage.blobs.get("vault_a")!.length, s.storage.blobs.get("vault_b")!.length);
    // remove() never deletes keys.
    await s.vault.unlock(REAL_PIN);
    await s.vault.remove("reports");
    assert.equal(s.storage.blobs.size, 12);
  });

  it("default KDF parameters: timing baseline (Node, not Hermes)", async () => {
    const s = setup({ kdf: DEFAULT_KDF_PARAMS });
    await s.vault.createVaults(REAL_PIN, COVER_PIN);
    s.vault.lock();
    const t0 = performance.now();
    assert.deepEqual(await s.vault.unlock(REAL_PIN), { kind: "real" });
    const t1 = performance.now();
    assert.equal(await s.vault.unlock("000000"), null);
    const t2 = performance.now();
    console.log(
      `    [timing] N=2^${DEFAULT_KDF_PARAMS.logN} r=${DEFAULT_KDF_PARAMS.r} p=${DEFAULT_KDF_PARAMS.p}: ` +
        `unlock(correct) ${(t1 - t0).toFixed(0)} ms, unlock(wrong) ${(t2 - t1).toFixed(0)} ms`,
    );
  });
});
