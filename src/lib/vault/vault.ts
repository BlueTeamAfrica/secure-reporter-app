/**
 * Vault: two PIN-wrapped, slot-neutral encrypted record stores ("real" and "cover").
 *
 * Pure TypeScript. NO React Native imports: storage and randomness are injected so
 * this file runs unchanged in plain Node tests. See expoStorage.ts for the device adapter.
 *
 * NEVER log PINs, keys, salts, device secret, or plaintext from this module.
 *
 * ── On-disk format, version 1 ──────────────────────────────────────────────
 * Blob storage (AsyncStorage), all values base64:
 *   vault_a, vault_b           slot headers (which one is "real" is random, stored nowhere)
 *   vault_a_0 … vault_a_4      records of slot a (positional, neutral keys)
 *   vault_b_0 … vault_b_4      records of slot b
 * Secure storage (Keystore / Keychain):
 *   vault_s                    32-byte device secret, hex
 *
 * Header (94 bytes):
 *   [0] version=1 [1] kdf=1 (scrypt) [2] log2(N) [3] r [4] p [5..21) salt
 *   [21..45) nonce [45..94) XChaCha20-Poly1305( kind(1) || dataKey(32) )
 *   header[0..21) (version, KDF params, salt) is IDENTICAL in both slots: one install-wide salt.
 *   S    = scrypt(PIN, salt, N, r, p)                       — computed ONCE per unlock
 *   KEK  = HKDF-SHA256(ikm = S, salt = deviceSecret, info = "srv1/kek/" + slot)
 *   AAD  = "srv|wrap|" + slot + "|" + header[0..21)
 *   The salt and parameters are fixed for the life of the install (until wipeAll + setup):
 *   re-wrapping one slot with a new salt would need the other slot's PIN, which is not held.
 *
 * Record:
 *   [0] version=1 [1..25) nonce [25..) XChaCha20-Poly1305 under the vault's data key
 *   AAD  = [version] + "|rec|" + slot + "|" + recordName
 *   plaintext = present(1) || len(u32 BE) || bytes || zero padding to a multiple of 256
 *
 * Both slots always hold the same number of records with the same padded sizes at creation,
 * so the storage layout alone does not reveal which slot is the real one.
 */
import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import {
  bytesToHex,
  bytesToUtf8,
  concatBytes,
  equalBytes,
  hexToBytes,
  utf8ToBytes,
} from "@noble/ciphers/utils.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { scryptAsync } from "@noble/hashes/scrypt.js";
import { sha256 } from "@noble/hashes/sha2.js";

// ── Public types ──────────────────────────────────────────────────────────────

export type VaultKind = "real" | "cover";
export type SlotId = "a" | "b";

/** Injected persistence. Blob values are opaque base64 strings. */
export interface VaultStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  secureGet(key: string): Promise<string | null>;
  secureSet(key: string, value: string): Promise<void>;
  secureDelete(key: string): Promise<void>;
}

/** Cryptographically secure random bytes (expo-crypto getRandomBytes on device). */
export type RandomBytes = (length: number) => Uint8Array;

export type KdfParams = { logN: number; r: number; p: number };

export type ScryptFn = (
  password: Uint8Array,
  salt: Uint8Array,
  opts: { N: number; r: number; p: number; dkLen: number },
) => Promise<Uint8Array>;

export interface VaultDeps {
  storage: VaultStorage;
  randomBytes: RandomBytes;
  /** Parameters for createVaults. Every later operation uses the parameters stored in the headers. */
  kdfParams?: KdfParams;
  /** Override the scrypt implementation (tests count calls; a native scrypt gives identical output). */
  scrypt?: ScryptFn;
  /** Tests only: called once per slot unwrap attempt. Receives the slot id, nothing secret. */
  onUnwrapAttempt?: (slot: SlotId) => void;
}

export const REAL_RECORDS = ["reports", "working", "tombstones", "profile"] as const;
export const COVER_RECORDS = ["notes"] as const;
export type RealRecordName = (typeof REAL_RECORDS)[number];
export type CoverRecordName = (typeof COVER_RECORDS)[number];
export type RecordName = RealRecordName | CoverRecordName;

export type VaultErrorCode =
  | "INVALID_PIN" // not 4-6 digits after normalisation
  | "PINS_NOT_DISTINCT" // real and cover PIN would be equal
  | "WRONG_PIN" // old PIN given to changePin does not open the real vault
  | "NOT_INITIALIZED"
  | "ALREADY_INITIALIZED"
  | "LOCKED"
  | "WRONG_SESSION" // operation not allowed in the current session kind
  | "UNKNOWN_RECORD" // name not allowed for this vault kind
  | "INVALID_ARGUMENT"
  | "UNSUPPORTED_FORMAT" // unknown format version or KDF id
  | "CORRUPT" // malformed, tampered, swapped, or unreadable data
  | "DEVICE_SECRET_MISSING"
  | "WIPE_INCOMPLETE";

export class VaultError extends Error {
  readonly code: VaultErrorCode;
  constructor(code: VaultErrorCode, message: string) {
    super(message);
    this.name = "VaultError";
    this.code = code;
  }
}

export interface Vault {
  isInitialized(): Promise<boolean>;
  /** Creates both vaults and leaves a REAL session unlocked. */
  createVaults(realPin: string, coverPin: string): Promise<void>;
  /** Always attempts both slots. Returns the kind that opened, or null for a wrong PIN. */
  unlock(pin: string): Promise<{ kind: VaultKind } | null>;
  /** Synchronously overwrites the in-memory data key and ends the session. */
  lock(): void;
  currentKind(): VaultKind | null;
  get<T = unknown>(name: RecordName): Promise<T | null>;
  put(name: RecordName, value: unknown): Promise<void>;
  /** Read-modify-write inside the write queue, so concurrent updates never lose data. */
  update<T>(name: RecordName, fn: (current: T | null) => T): Promise<T>;
  remove(name: RecordName): Promise<void>;
  /** Real session only. "real" needs the old real PIN; "cover" takes null (uses the stored cover key). */
  changePin(kind: "real", oldPin: string, newPin: string): Promise<void>;
  changePin(kind: "cover", oldPin: null, newPin: string): Promise<void>;
  /** Locks, crypto-shreds the device secret, deletes every vault blob. */
  wipeAll(): Promise<void>;
}

// ── Format constants ──────────────────────────────────────────────────────────

export const FORMAT_VERSION = 1;
const KDF_SCRYPT = 1;
const KIND_REAL = 0x52;
const KIND_COVER = 0x43;

const SALT_LEN = 16;
const NONCE_LEN = 24;
const KEY_LEN = 32;
const TAG_LEN = 16;
const HEADER_PREFIX_LEN = 5 + SALT_LEN; // version, kdf, logN, r, p, salt
const WRAPPED_LEN = 1 + KEY_LEN + TAG_LEN;
const HEADER_LEN = HEADER_PREFIX_LEN + NONCE_LEN + WRAPPED_LEN;
const RECORD_MIN_LEN = 1 + NONCE_LEN + TAG_LEN;
const PAD_BLOCK = 256;

/**
 * Default scrypt cost for new installs: N=2^15, r=8, p=1 (32 MiB).
 * Unlock runs ONE derivation (shared salt), so this costs the same wall time as the earlier
 * two derivations at 2^14, with double the memory hardness. Retune from the on-device
 * speed test. Existing installs keep the parameters in their headers; a change applies to
 * installs set up after it (no migration).
 */
export const DEFAULT_KDF_PARAMS: KdfParams = { logN: 15, r: 8, p: 1 };
const KDF_BOUNDS = { logN: [10, 18], r: [1, 16], p: [1, 4] } as const;

/**
 * The scrypt the vault uses on device: noble's async variant, yielding to the event loop
 * every ~10 ms so the UI stays responsive. Exported so the speed test measures exactly this.
 */
export const defaultScrypt: ScryptFn = (pw, salt, o) => scryptAsync(pw, salt, { ...o, asyncTick: 10 });

const SLOTS: readonly SlotId[] = ["a", "b"];
const RECORD_COUNT = 5;
const REAL_LAYOUT = ["reports", "working", "tombstones", "profile", "coverKey"] as const;
const COVER_LAYOUT = ["notes", "pad1", "pad2", "pad3", "pad4"] as const;
const COVER_KEY_INDEX = 4;

const DEVICE_SECRET_KEY = "vault_s";
const headerStorageKey = (slot: SlotId) => `vault_${slot}`;
const recordStorageKey = (slot: SlotId, index: number) => `vault_${slot}_${index}`;
const otherSlot = (slot: SlotId): SlotId => (slot === "a" ? "b" : "a");

// ── Pure helpers ──────────────────────────────────────────────────────────────

/** Arabic-Indic (٠-٩) and Eastern Arabic-Indic (۰-۹) → ASCII; then exactly 4-6 digits. */
function normalizePin(pin: unknown): Uint8Array {
  const invalid = () => new VaultError("INVALID_PIN", "PIN must be 4 to 6 digits.");
  if (typeof pin !== "string") throw invalid();
  const out = new Uint8Array(pin.length);
  let n = 0;
  for (let i = 0; i < pin.length; i++) {
    const c = pin.charCodeAt(i);
    let d: number;
    if (c >= 0x30 && c <= 0x39) d = c - 0x30;
    else if (c >= 0x0660 && c <= 0x0669) d = c - 0x0660;
    else if (c >= 0x06f0 && c <= 0x06f9) d = c - 0x06f0;
    else {
      out.fill(0);
      throw invalid();
    }
    out[n++] = 0x30 + d;
  }
  if (n < 4 || n > 6) {
    out.fill(0);
    throw invalid();
  }
  const result = out.slice(0, n);
  out.fill(0);
  return result;
}

function validateKdfParams(params: KdfParams): KdfParams {
  const ok = (v: number, [lo, hi]: readonly [number, number]) => Number.isInteger(v) && v >= lo && v <= hi;
  if (!ok(params.logN, KDF_BOUNDS.logN) || !ok(params.r, KDF_BOUNDS.r) || !ok(params.p, KDF_BOUNDS.p)) {
    throw new VaultError("CORRUPT", "Key-derivation parameters out of range.");
  }
  return params;
}

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x2000) {
    s += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x2000)));
  }
  return btoa(s);
}

function fromBase64(value: string): Uint8Array {
  let s: string;
  try {
    s = atob(value);
  } catch {
    throw new VaultError("CORRUPT", "Stored data is malformed.");
  }
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

type Header = { params: KdfParams; salt: Uint8Array; prefix: Uint8Array; nonce: Uint8Array; wrapped: Uint8Array };

function parseHeader(value: string): Header {
  const b = fromBase64(value);
  if (b.length < 1 || b[0] !== FORMAT_VERSION) {
    throw new VaultError("UNSUPPORTED_FORMAT", "Unsupported storage format version.");
  }
  if (b.length < 2 || b[1] !== KDF_SCRYPT) {
    throw new VaultError("UNSUPPORTED_FORMAT", "Unsupported key-derivation function.");
  }
  if (b.length !== HEADER_LEN) throw new VaultError("CORRUPT", "Stored data is malformed.");
  return {
    params: validateKdfParams({ logN: b[2], r: b[3], p: b[4] }),
    salt: b.slice(5, HEADER_PREFIX_LEN),
    prefix: b.slice(0, HEADER_PREFIX_LEN),
    nonce: b.slice(HEADER_PREFIX_LEN, HEADER_PREFIX_LEN + NONCE_LEN),
    wrapped: b.slice(HEADER_PREFIX_LEN + NONCE_LEN),
  };
}

const wrapAad = (slot: SlotId, prefix: Uint8Array) => concatBytes(utf8ToBytes(`srv|wrap|${slot}|`), prefix);
const recordAad = (slot: SlotId, name: string) =>
  concatBytes(Uint8Array.of(FORMAT_VERSION), utf8ToBytes(`|rec|${slot}|${name}`));

function encodePlain(data: Uint8Array | null): Uint8Array {
  const len = data ? data.length : 0;
  const out = new Uint8Array(Math.ceil((5 + len) / PAD_BLOCK) * PAD_BLOCK);
  out[0] = data ? 1 : 0;
  new DataView(out.buffer).setUint32(1, len, false);
  if (data) out.set(data, 5);
  return out;
}

function decodePlain(pt: Uint8Array): Uint8Array | null {
  const corrupt = () => new VaultError("CORRUPT", "Stored data is malformed.");
  if (pt.length < PAD_BLOCK || pt.length % PAD_BLOCK !== 0) throw corrupt();
  const len = new DataView(pt.buffer, pt.byteOffset, pt.byteLength).getUint32(1, false);
  if (pt[0] === 0) {
    if (len !== 0) throw corrupt();
    return null;
  }
  if (pt[0] !== 1 || 5 + len > pt.length) throw corrupt();
  return pt.slice(5, 5 + len);
}

function sealRecord(key: Uint8Array, slot: SlotId, name: string, data: Uint8Array | null, nonce: Uint8Array): string {
  const pt = encodePlain(data);
  try {
    const ct = xchacha20poly1305(key, nonce, recordAad(slot, name)).encrypt(pt);
    return toBase64(concatBytes(Uint8Array.of(FORMAT_VERSION), nonce, ct));
  } finally {
    pt.fill(0);
  }
}

/** Throws UNSUPPORTED_FORMAT / CORRUPT. Returns null for an "absent" record. */
function openRecord(key: Uint8Array, slot: SlotId, name: string, value: string): Uint8Array | null {
  const b = fromBase64(value);
  if (b.length < 1 || b[0] !== FORMAT_VERSION) {
    throw new VaultError("UNSUPPORTED_FORMAT", "Unsupported storage format version.");
  }
  if (b.length < RECORD_MIN_LEN) throw new VaultError("CORRUPT", "Stored data is malformed.");
  let pt: Uint8Array;
  try {
    pt = xchacha20poly1305(key, b.subarray(1, 1 + NONCE_LEN), recordAad(slot, name)).decrypt(
      b.subarray(1 + NONCE_LEN),
    );
  } catch {
    throw new VaultError("CORRUPT", "Stored data failed verification.");
  }
  try {
    return decodePlain(pt);
  } finally {
    pt.fill(0);
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

type Session = { kind: VaultKind; slot: SlotId; key: Uint8Array };

export function makeVault(deps: VaultDeps): Vault {
  const { storage } = deps;
  const kdfParams = validateKdfParams(deps.kdfParams ?? DEFAULT_KDF_PARAMS);
  const scrypt: ScryptFn = deps.scrypt ?? defaultScrypt;

  const randomBytes = (n: number): Uint8Array => {
    const out = deps.randomBytes(n);
    if (!(out instanceof Uint8Array) || out.length !== n) {
      throw new VaultError("INVALID_ARGUMENT", "Random source returned the wrong length.");
    }
    return out;
  };

  let session: Session | null = null;

  // One serialised queue for every operation that touches storage.
  let tail: Promise<unknown> = Promise.resolve();
  function serial<T>(op: () => Promise<T>): Promise<T> {
    const run = tail.then(op, op);
    tail = run.catch(() => undefined);
    return run;
  }

  function lockInternal(): void {
    if (session) {
      session.key.fill(0);
      session = null;
    }
  }

  function requireSession(): Session {
    if (!session) throw new VaultError("LOCKED", "Locked.");
    return session;
  }

  /** Re-check after every await: lock() may have zeroed the key in the meantime. */
  function assertActive(s: Session): void {
    if (session !== s) throw new VaultError("LOCKED", "Locked.");
  }

  function recordIndex(kind: VaultKind, name: unknown): number {
    const allowed: readonly string[] = kind === "real" ? REAL_RECORDS : COVER_RECORDS;
    if (typeof name !== "string" || !allowed.includes(name)) {
      throw new VaultError("UNKNOWN_RECORD", "Record name not allowed here.");
    }
    return (kind === "real" ? (REAL_LAYOUT as readonly string[]) : COVER_LAYOUT).indexOf(name);
  }

  async function loadDeviceSecret(): Promise<Uint8Array> {
    const hex = await storage.secureGet(DEVICE_SECRET_KEY);
    if (hex === null) throw new VaultError("DEVICE_SECRET_MISSING", "Device key unavailable.");
    if (!/^[0-9a-f]{64}$/.test(hex)) throw new VaultError("CORRUPT", "Device key malformed.");
    return hexToBytes(hex);
  }

  /** Both headers, plus their shared prefix (version, KDF params, salt), which must be identical. */
  async function loadHeaders(): Promise<{ a: Header; b: Header; shared: Header }> {
    const [a, b] = await Promise.all([storage.get(headerStorageKey("a")), storage.get(headerStorageKey("b"))]);
    if (a === null || b === null) throw new VaultError("NOT_INITIALIZED", "Not set up.");
    const ha = parseHeader(a);
    const hb = parseHeader(b);
    if (!equalBytes(ha.prefix, hb.prefix)) throw new VaultError("CORRUPT", "Stored data is inconsistent.");
    return { a: ha, b: hb, shared: ha };
  }

  /** The one expensive step. The result is PIN-equivalent: zero it after use. */
  function stretch(pin: Uint8Array, salt: Uint8Array, params: KdfParams): Promise<Uint8Array> {
    return scrypt(pin, salt, { N: 2 ** params.logN, r: params.r, p: params.p, dkLen: KEY_LEN });
  }

  /** Cheap per-slot separation of the shared stretched PIN, bound to the device secret. */
  function kekFor(stretched: Uint8Array, slot: SlotId, deviceSecret: Uint8Array): Uint8Array {
    return hkdf(sha256, stretched, deviceSecret, utf8ToBytes(`srv1/kek/${slot}`), KEY_LEN);
  }

  /** One unwrap attempt for one slot (HKDF + AEAD). Null iff the tag does not verify. */
  function tryUnwrap(
    header: Header,
    slot: SlotId,
    stretched: Uint8Array,
    deviceSecret: Uint8Array,
  ): { kind: VaultKind; key: Uint8Array } | null {
    deps.onUnwrapAttempt?.(slot);
    const kek = kekFor(stretched, slot, deviceSecret);
    let pt: Uint8Array;
    try {
      pt = xchacha20poly1305(kek, header.nonce, wrapAad(slot, header.prefix)).decrypt(header.wrapped);
    } catch {
      return null;
    } finally {
      kek.fill(0);
    }
    try {
      if (pt.length !== 1 + KEY_LEN || (pt[0] !== KIND_REAL && pt[0] !== KIND_COVER)) {
        throw new VaultError("CORRUPT", "Stored data is malformed.");
      }
      return { kind: pt[0] === KIND_REAL ? "real" : "cover", key: pt.slice(1) };
    } finally {
      pt.fill(0);
    }
  }

  /** Wraps a data key for one slot under the shared prefix, with a fresh nonce. */
  function buildHeader(
    slot: SlotId,
    prefix: Uint8Array,
    stretched: Uint8Array,
    dataKey: Uint8Array,
    kind: VaultKind,
    deviceSecret: Uint8Array,
  ): string {
    const nonce = randomBytes(NONCE_LEN);
    const kek = kekFor(stretched, slot, deviceSecret);
    const pt = concatBytes(Uint8Array.of(kind === "real" ? KIND_REAL : KIND_COVER), dataKey);
    try {
      const wrapped = xchacha20poly1305(kek, nonce, wrapAad(slot, prefix)).encrypt(pt);
      return toBase64(concatBytes(prefix, nonce, wrapped));
    } finally {
      pt.fill(0);
      kek.fill(0);
    }
  }

  async function writeRecord(
    slot: SlotId,
    key: Uint8Array,
    index: number,
    name: string,
    data: Uint8Array | null,
  ): Promise<void> {
    await storage.set(recordStorageKey(slot, index), sealRecord(key, slot, name, data, randomBytes(NONCE_LEN)));
  }

  async function readSessionRecord(s: Session, index: number, name: string): Promise<Uint8Array | null> {
    const raw = await storage.get(recordStorageKey(s.slot, index));
    assertActive(s);
    if (raw === null) return null;
    return openRecord(s.key, s.slot, name, raw);
  }

  async function writeSessionRecord(s: Session, index: number, name: string, data: Uint8Array | null) {
    assertActive(s);
    await writeRecord(s.slot, s.key, index, name, data);
  }

  const encodeValue = (value: unknown): Uint8Array => {
    const json = JSON.stringify(value);
    if (json === undefined) throw new VaultError("INVALID_ARGUMENT", "Value is not serialisable.");
    return utf8ToBytes(json);
  };
  const decodeValue = <T>(data: Uint8Array | null): T | null => {
    if (data === null) return null;
    try {
      return JSON.parse(bytesToUtf8(data)) as T;
    } finally {
      data.fill(0);
    }
  };

  // ── API ─────────────────────────────────────────────────────────────────────

  const vault: Vault = {
    isInitialized: () =>
      serial(async () => {
        const [a, b] = await Promise.all([storage.get(headerStorageKey("a")), storage.get(headerStorageKey("b"))]);
        return a !== null && b !== null;
      }),

    createVaults: (realPin, coverPin) =>
      serial(async () => {
        const rp = normalizePin(realPin);
        const cp = normalizePin(coverPin);
        let deviceSecret: Uint8Array | null = null;
        let realKey: Uint8Array | null = null;
        let coverKey: Uint8Array | null = null;
        let sReal: Uint8Array | null = null;
        let sCover: Uint8Array | null = null;
        try {
          if (equalBytes(rp, cp)) throw new VaultError("PINS_NOT_DISTINCT", "The two PINs must be different.");
          const [a, b] = await Promise.all([
            storage.get(headerStorageKey("a")),
            storage.get(headerStorageKey("b")),
          ]);
          if (a !== null || b !== null) throw new VaultError("ALREADY_INITIALIZED", "Already set up.");
          lockInternal();

          deviceSecret = randomBytes(KEY_LEN);
          await storage.secureSet(DEVICE_SECRET_KEY, bytesToHex(deviceSecret));

          const realSlot: SlotId = (randomBytes(1)[0] & 1) === 0 ? "a" : "b";
          const coverSlot = otherSlot(realSlot);
          realKey = randomBytes(KEY_LEN);
          coverKey = randomBytes(KEY_LEN);

          // Records first; headers last, because headers are what mark the vault initialised.
          for (let i = 0; i < RECORD_COUNT; i++) {
            await writeRecord(realSlot, realKey, i, REAL_LAYOUT[i], i === COVER_KEY_INDEX ? coverKey : null);
            await writeRecord(coverSlot, coverKey, i, COVER_LAYOUT[i], null);
          }
          // One install-wide salt and parameter set, shared by both headers.
          const salt = randomBytes(SALT_LEN);
          const prefix = concatBytes(
            Uint8Array.of(FORMAT_VERSION, KDF_SCRYPT, kdfParams.logN, kdfParams.r, kdfParams.p),
            salt,
          );
          sReal = await stretch(rp, salt, kdfParams);
          sCover = await stretch(cp, salt, kdfParams);
          const realHeader = buildHeader(realSlot, prefix, sReal, realKey, "real", deviceSecret);
          const coverHeader = buildHeader(coverSlot, prefix, sCover, coverKey, "cover", deviceSecret);
          await storage.set(headerStorageKey(coverSlot), coverHeader);
          await storage.set(headerStorageKey(realSlot), realHeader);

          session = { kind: "real", slot: realSlot, key: realKey };
        } finally {
          rp.fill(0);
          cp.fill(0);
          if (realKey && session?.key !== realKey) realKey.fill(0); // failed mid-way
          sReal?.fill(0);
          sCover?.fill(0);
          deviceSecret?.fill(0);
          coverKey?.fill(0);
        }
      }),

    unlock: (pin) =>
      serial(async () => {
        const p = normalizePin(pin);
        try {
          lockInternal();
          const headers = await loadHeaders();
          const deviceSecret = await loadDeviceSecret();
          let stretched: Uint8Array | null = null;
          try {
            // One scrypt, then BOTH slots, always in the same order, regardless of the first result.
            stretched = await stretch(p, headers.shared.salt, headers.shared.params);
            const ra = tryUnwrap(headers.a, "a", stretched, deviceSecret);
            const rb = tryUnwrap(headers.b, "b", stretched, deviceSecret);
            if (ra && rb) {
              ra.key.fill(0);
              rb.key.fill(0);
              throw new VaultError("CORRUPT", "Stored data is inconsistent.");
            }
            const hit = ra ? { slot: "a" as const, ...ra } : rb ? { slot: "b" as const, ...rb } : null;
            if (!hit) return null;
            session = hit;
            return { kind: hit.kind };
          } finally {
            stretched?.fill(0);
            deviceSecret.fill(0);
          }
        } finally {
          p.fill(0);
        }
      }),

    lock: lockInternal,

    currentKind: () => session?.kind ?? null,

    get: <T>(name: RecordName) =>
      serial(async () => {
        const s = requireSession();
        const index = recordIndex(s.kind, name);
        return decodeValue<T>(await readSessionRecord(s, index, name));
      }),

    put: (name, value) =>
      serial(async () => {
        const s = requireSession();
        const index = recordIndex(s.kind, name);
        const data = encodeValue(value);
        try {
          await writeSessionRecord(s, index, name, data);
        } finally {
          data.fill(0);
        }
      }),

    update: <T>(name: RecordName, fn: (current: T | null) => T) =>
      serial(async () => {
        const s = requireSession();
        const index = recordIndex(s.kind, name);
        const next = fn(decodeValue<T>(await readSessionRecord(s, index, name)));
        const data = encodeValue(next);
        try {
          await writeSessionRecord(s, index, name, data);
        } finally {
          data.fill(0);
        }
        return next;
      }),

    remove: (name) =>
      serial(async () => {
        const s = requireSession();
        // Overwrite with an encrypted "absent" marker: the set of stored keys never changes.
        await writeSessionRecord(s, recordIndex(s.kind, name), name, null);
      }),

    changePin: (kind: VaultKind, oldPin: string | null, newPin: string) =>
      serial(async () => {
        const s = requireSession();
        if (s.kind !== "real") throw new VaultError("WRONG_SESSION", "Not available.");
        if (kind !== "real" && kind !== "cover") throw new VaultError("INVALID_ARGUMENT", "Unknown kind.");
        if (kind === "real" ? typeof oldPin !== "string" : oldPin !== null) {
          throw new VaultError("INVALID_ARGUMENT", "Old PIN required for real, must be null for cover.");
        }
        const np = normalizePin(newPin);
        const op = kind === "real" ? normalizePin(oldPin) : null;
        const realSlot = s.slot;
        const coverSlot = otherSlot(realSlot);
        try {
          const headers = await loadHeaders();
          const { salt, params, prefix } = headers.shared;
          const deviceSecret = await loadDeviceSecret();
          let coverKey: Uint8Array | null = null;
          let sOld: Uint8Array | null = null;
          let sNew: Uint8Array | null = null;
          try {
            if (kind === "real") {
              sOld = await stretch(op!, salt, params);
              const check = tryUnwrap(headers[realSlot], realSlot, sOld, deviceSecret);
              const matches = check !== null && check.kind === "real" && equalBytes(check.key, s.key);
              check?.key.fill(0);
              if (!matches) throw new VaultError("WRONG_PIN", "Current PIN is not correct.");
            }
            // The same stretched new PIN serves the clash check and the new wrap.
            sNew = await stretch(np, salt, params);
            const otherKindSlot = kind === "real" ? coverSlot : realSlot;
            const clash = tryUnwrap(headers[otherKindSlot], otherKindSlot, sNew, deviceSecret);
            if (clash) {
              clash.key.fill(0);
              throw new VaultError("PINS_NOT_DISTINCT", "The two PINs must be different.");
            }
            if (kind === "real") {
              assertActive(s);
              const header = buildHeader(realSlot, prefix, sNew, s.key, "real", deviceSecret);
              await storage.set(headerStorageKey(realSlot), header);
            } else {
              coverKey = await readSessionRecord(s, COVER_KEY_INDEX, REAL_LAYOUT[COVER_KEY_INDEX]);
              if (coverKey === null || coverKey.length !== KEY_LEN) {
                throw new VaultError("CORRUPT", "Stored data is inconsistent.");
              }
              const header = buildHeader(coverSlot, prefix, sNew, coverKey, "cover", deviceSecret);
              assertActive(s);
              await storage.set(headerStorageKey(coverSlot), header);
            }
          } finally {
            sOld?.fill(0);
            sNew?.fill(0);
            deviceSecret.fill(0);
            coverKey?.fill(0);
          }
        } finally {
          np.fill(0);
          op?.fill(0);
        }
      }),

    wipeAll: () => {
      // Lock and start shredding the device secret immediately, ahead of any queued work.
      lockInternal();
      const shred = storage.secureDelete(DEVICE_SECRET_KEY).then(
        () => null,
        (e: unknown) => e,
      );
      return serial(async () => {
        lockInternal();
        let failed = (await shred) !== null;
        const keys = SLOTS.flatMap((slot) => [
          headerStorageKey(slot),
          ...Array.from({ length: RECORD_COUNT }, (_, i) => recordStorageKey(slot, i)),
        ]);
        for (const key of keys) {
          try {
            await storage.delete(key);
          } catch {
            failed = true;
          }
        }
        if (failed) throw new VaultError("WIPE_INCOMPLETE", "Some data could not be removed.");
      });
    },
  };
  return vault;
}

/** Exposed for tests only. Not part of the app API. */
export const __internals = {
  normalizePin,
  openRecord,
  headerStorageKey,
  recordStorageKey,
  DEVICE_SECRET_KEY,
  RECORD_COUNT,
  HEADER_LEN,
};
