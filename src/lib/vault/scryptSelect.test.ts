import assert from "node:assert/strict";
import { scrypt as nodeScryptCb, scryptSync } from "node:crypto";
import { describe, it } from "node:test";

import { scryptMaxmem } from "./nativeScrypt.ts";
import { compareImplementations, createScryptSelector, SCRYPT_VECTORS, scryptPassesSelfTest } from "./scryptSelect.ts";
import { defaultScrypt, type ScryptFn } from "./vault.ts";

/**
 * Stand-in for the native module: Node's crypto.scrypt is OpenSSL EVP_PBE_scrypt, the same call
 * react-native-quick-crypto makes, with the same maxmem the adapter passes.
 */
const opensslScrypt: ScryptFn = (pw, salt, o) =>
  new Promise((resolve, reject) =>
    nodeScryptCb(pw, salt, o.dkLen, { N: o.N, r: o.r, p: o.p, maxmem: scryptMaxmem(o.N, o.r, o.p) }, (err, key) =>
      err ? reject(err) : resolve(new Uint8Array(key)),
    ),
  );

const broken: ScryptFn = async (pw, salt, o) => {
  const out = await defaultScrypt(pw, salt, o);
  out[0] ^= 1;
  return out;
};
const throwing: ScryptFn = async () => {
  throw new Error("native missing");
};

describe("scrypt implementation selection", () => {
  it("noble and OpenSSL both reproduce every known answer", async () => {
    assert.equal(SCRYPT_VECTORS.length, 3);
    assert.equal(await scryptPassesSelfTest(defaultScrypt), true);
    assert.equal(await scryptPassesSelfTest(opensslScrypt), true);
    const cmp = await compareImplementations(defaultScrypt, opensslScrypt);
    assert.equal(cmp.allMatch, true);
    assert.ok(cmp.vectors.every((v) => v.nobleOk && v.nativeOk));
  });

  it("noble and OpenSSL agree at the vault's real parameters (N=2^14..2^15, 16-byte salt)", async () => {
    for (const logN of [14, 15]) {
      const pin = new TextEncoder().encode("482916");
      const salt = Uint8Array.from({ length: 16 }, (_, i) => i * 7);
      const o = { N: 2 ** logN, r: 8, p: 1, dkLen: 32 };
      assert.deepEqual(await opensslScrypt(pin, salt, o), await defaultScrypt(pin, salt, o));
    }
  });

  it("a wrong or failing implementation fails the self-test and the comparison", async () => {
    assert.equal(await scryptPassesSelfTest(broken), false);
    assert.equal(await scryptPassesSelfTest(throwing), false);
    assert.equal((await compareImplementations(defaultScrypt, broken)).allMatch, false);
    assert.equal((await compareImplementations(defaultScrypt, null)).allMatch, false);
  });

  it("selector: native when present and correct, noble otherwise; decides once", async () => {
    let loads = 0;
    const withNative = createScryptSelector({ loadNative: () => (loads++, opensslScrypt), fallback: defaultScrypt });
    assert.equal(await withNative.choice(), "native");
    await withNative.scrypt(new Uint8Array(4), new Uint8Array(16), { N: 1024, r: 8, p: 1, dkLen: 32 });
    assert.equal(await withNative.choice(), "native");
    assert.equal(loads, 1, "decision is cached");

    assert.equal(await createScryptSelector({ loadNative: () => null, fallback: defaultScrypt }).choice(), "noble");
    assert.equal(await createScryptSelector({ loadNative: () => broken, fallback: defaultScrypt }).choice(), "noble");
    assert.equal(await createScryptSelector({ loadNative: () => throwing, fallback: defaultScrypt }).choice(), "noble");
    const loaderThrows = createScryptSelector({
      loadNative: () => {
        throw new Error("no JSI");
      },
      fallback: defaultScrypt,
    });
    assert.equal(await loaderThrows.choice(), "noble");
  });

  it("selector: a native error after a passed self-test falls back to noble with the same output", async () => {
    let calls = 0;
    const flaky: ScryptFn = (pw, salt, o) => (++calls > SCRYPT_VECTORS.length ? throwing(pw, salt, o) : opensslScrypt(pw, salt, o));
    const sel = createScryptSelector({ loadNative: () => flaky, fallback: defaultScrypt });
    assert.equal(await sel.choice(), "native");
    const pw = new TextEncoder().encode("1234");
    const salt = new Uint8Array(16).fill(9);
    const o = { N: 1024, r: 8, p: 1, dkLen: 32 };
    assert.deepEqual(await sel.scrypt(pw, salt, o), await defaultScrypt(pw, salt, o));
  });

  it("the adapter's maxmem is enough for OpenSSL at every level we test, and 128*r*N alone is not", () => {
    for (const logN of [12, 13, 14, 15, 16, 17]) {
      const N = 2 ** logN;
      assert.doesNotThrow(() => scryptSync("x", "y", 32, { N, r: 8, p: 1, maxmem: scryptMaxmem(N, 8, 1) }));
    }
    assert.throws(() => scryptSync("x", "y", 32, { N: 2 ** 14, r: 8, p: 1, maxmem: 128 * 8 * 2 ** 14 }));
  });
});
