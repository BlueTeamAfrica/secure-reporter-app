/**
 * Choosing the scrypt implementation for the vault: native (OpenSSL via react-native-quick-crypto)
 * when it is present AND reproduces known answers, noble (pure JS) otherwise.
 *
 * Pure TypeScript, no React Native imports. The vault's headers do not record which
 * implementation was used: both produce byte-identical output, so switching never locks
 * anyone out. The self-test is what guarantees that on each device.
 *
 * On device there is NO JS fallback (fallback: null): pure-JS scrypt on Hermes is far too slow
 * at the vault's cost, so the vault fails with KDF_UNAVAILABLE instead. Tests pass noble.
 */
import { bytesToHex, utf8ToBytes } from "@noble/ciphers/utils.js";

import { VaultError, type ScryptFn } from "./vault.ts";

/** "unavailable": no native scrypt that passed the self-test, and no fallback configured. */
export type ScryptChoice = "native" | "noble" | "unavailable";

export type ScryptVector = {
  name: string;
  password: Uint8Array;
  salt: Uint8Array;
  N: number;
  r: number;
  p: number;
  dkLen: number;
  expectedHex: string;
};

/**
 * Fixed known answers. #1 is RFC 7914 §12 vector 1. #2 and #3 are vault-shaped (6 ASCII digits,
 * 16-byte salt, r=8, dkLen=32) and were computed with OpenSSL (Node's crypto.scryptSync, the same
 * EVP_PBE_scrypt the native module calls) and cross-checked against noble. Costs are kept low so
 * the pure-JS side of the Diagnostics comparison finishes in seconds on a phone.
 */
export const SCRYPT_VECTORS: readonly ScryptVector[] = [
  {
    name: "RFC 7914 #1",
    password: new Uint8Array(0),
    salt: new Uint8Array(0),
    N: 16,
    r: 1,
    p: 1,
    dkLen: 64,
    expectedHex:
      "77d6576238657b203b19ca42c18a0497f16b4844e3074ae8dfdffa3fede21442" +
      "fcd0069ded0948f8326a753a0fc81f17e8d3e0fb2e0d3628cf35e20c38d18906",
  },
  {
    name: "PIN-shaped, text salt",
    password: utf8ToBytes("246810"),
    salt: utf8ToBytes("test-vector-salt"),
    N: 1024,
    r: 8,
    p: 1,
    dkLen: 32,
    expectedHex: "929ef41712db4c8a6605c0db0c4455e58d48c7a9a80b7c923f7d5df27ccafd8d",
  },
  {
    name: "PIN-shaped, binary salt",
    password: utf8ToBytes("135790"),
    salt: Uint8Array.from({ length: 16 }, (_, i) => i),
    N: 512,
    r: 8,
    p: 1,
    dkLen: 32,
    expectedHex: "fb59f4d9797f5577b0a3da66c626c249e5cd90f49612cf122418e8665ec50f80",
  },
];

/** Runs one vector; false on mismatch OR on any error (errors are swallowed, never logged). */
async function runVector(fn: ScryptFn, v: ScryptVector): Promise<boolean> {
  try {
    const out = await fn(v.password.slice(), v.salt.slice(), { N: v.N, r: v.r, p: v.p, dkLen: v.dkLen });
    return out instanceof Uint8Array && bytesToHex(out) === v.expectedHex;
  } catch {
    return false;
  }
}

/** True iff the implementation reproduces every known answer. */
export async function scryptPassesSelfTest(fn: ScryptFn): Promise<boolean> {
  for (const v of SCRYPT_VECTORS) {
    if (!(await runVector(fn, v))) return false;
  }
  return true;
}

export type VectorComparison = { name: string; nobleOk: boolean; nativeOk: boolean };

/** Diagnostics: run every vector through both implementations, each checked against the known answer. */
export async function compareImplementations(
  noble: ScryptFn,
  native: ScryptFn | null,
): Promise<{ allMatch: boolean; vectors: VectorComparison[] }> {
  const vectors: VectorComparison[] = [];
  for (const v of SCRYPT_VECTORS) {
    vectors.push({ name: v.name, nobleOk: await runVector(noble, v), nativeOk: native ? await runVector(native, v) : false });
  }
  return { allMatch: vectors.every((v) => v.nobleOk && v.nativeOk), vectors };
}

export type ScryptSelector = {
  /** The ScryptFn to give the vault. Decides on first use, once per process. */
  scrypt: ScryptFn;
  /** Which implementation the vault is using (runs the decision if not yet made). */
  choice(): Promise<ScryptChoice>;
};

const unavailable = (): never => {
  throw new VaultError("KDF_UNAVAILABLE", "Key derivation is not available on this device.");
};

export function createScryptSelector(opts: {
  loadNative: () => ScryptFn | null;
  /** null on device: no JS fallback. */
  fallback: ScryptFn | null;
}): ScryptSelector {
  let decision: Promise<{ which: ScryptChoice; fn: ScryptFn | null }> | null = null;

  const decide = () =>
    (decision ??= (async () => {
      let native: ScryptFn | null = null;
      try {
        native = opts.loadNative();
      } catch {
        native = null;
      }
      if (native && (await scryptPassesSelfTest(native))) return { which: "native" as const, fn: native };
      if (opts.fallback) return { which: "noble" as const, fn: opts.fallback };
      return { which: "unavailable" as const, fn: null };
    })());

  const scrypt: ScryptFn = async (pw, salt, o) => {
    const d = await decide();
    if (d.which === "native" && d.fn) {
      try {
        return await d.fn(pw, salt, o);
      } catch {
        // Self-test proved identical output, so a fallback (tests only) yields the same key.
        if (!opts.fallback) unavailable();
      }
    }
    if (!opts.fallback) return unavailable();
    return opts.fallback(pw, salt, o);
  };

  return { scrypt, choice: async () => (await decide()).which };
}
