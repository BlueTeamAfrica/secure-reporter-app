/**
 * Native scrypt adapter: OpenSSL EVP_PBE_scrypt via react-native-quick-crypto (Nitro module),
 * running on a background thread. Device-only (React Native); not imported by vault.ts.
 *
 * The module is required lazily inside try/catch so that a build without the native code
 * (Expo Go, an older APK) still starts, and the vault falls back to noble.
 * Errors are replaced with generic ones: nothing here logs or surfaces inputs or outputs.
 * NOTE: react-native-quick-crypto copies the password and salt into native buffers that it
 * does not zero. The output buffer is copied and zeroed here.
 */
import type { ScryptFn } from "./vault";

type QuickCryptoScrypt = (
  password: Uint8Array,
  salt: Uint8Array,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
  callback: (err: Error | null, derivedKey?: Uint8Array) => void,
) => void;

let cached: QuickCryptoScrypt | null | undefined;

function loadModule(): QuickCryptoScrypt | null {
  if (cached !== undefined) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("react-native-quick-crypto") as { scrypt?: unknown };
    cached = typeof mod?.scrypt === "function" ? (mod.scrypt as QuickCryptoScrypt) : null;
  } catch {
    cached = null;
  }
  return cached;
}

/**
 * Memory limit to pass to OpenSSL: it needs 128*r*(N+p+2) bytes (V plus B), while quick-crypto's
 * own JS check only uses 128*r*N. Add 1 MiB headroom. Verified against Node's OpenSSL in tests.
 */
export function scryptMaxmem(N: number, r: number, p: number): number {
  return 128 * r * (N + p + 2) + (1 << 20);
}

/** True when the native module's JS loaded. The self-test decides whether it is actually used. */
export function isNativeScryptAvailable(): boolean {
  return loadModule() !== null;
}

/** scrypt(password, salt, N, r, p, dkLen) → derived key, byte-identical to noble's output. */
export function nativeScrypt(
  password: Uint8Array,
  salt: Uint8Array,
  N: number,
  r: number,
  p: number,
  dkLen: number,
): Promise<Uint8Array> {
  const scrypt = loadModule();
  if (!scrypt) return Promise.reject(new Error("Native scrypt unavailable."));
  const maxmem = scryptMaxmem(N, r, p);
  return new Promise((resolve, reject) => {
    try {
      scrypt(password, salt, dkLen, { N, r, p, maxmem }, (err, key) => {
        if (err || !key || key.length !== dkLen) {
          key?.fill(0);
          reject(new Error("Native scrypt failed."));
          return;
        }
        const out = new Uint8Array(dkLen);
        out.set(key);
        key.fill(0);
        resolve(out);
      });
    } catch {
      reject(new Error("Native scrypt failed."));
    }
  });
}

/** Same function in the vault's ScryptFn shape. */
export const nativeVaultScrypt: ScryptFn = (pw, salt, o) => nativeScrypt(pw, salt, o.N, o.r, o.p, o.dkLen);

/** For createScryptSelector: the native ScryptFn, or null when the module is not in this build. */
export function loadNativeScrypt(): ScryptFn | null {
  return isNativeScryptAvailable() ? nativeVaultScrypt : null;
}
