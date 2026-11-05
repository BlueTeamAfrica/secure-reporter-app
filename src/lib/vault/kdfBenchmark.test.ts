import assert from "node:assert/strict";
import { randomBytes as nodeRandomBytes } from "node:crypto";
import { describe, it } from "node:test";

import { BENCHMARK_LOG_N, describeJsEngine, runKdfBenchmark } from "./kdfBenchmark.ts";
import type { ScryptFn } from "./vault.ts";

describe("kdf speed test", () => {
  it("times one derivation per level, in order, with fresh dummy inputs that are zeroed after", async () => {
    const seen: { N: number; r: number; p: number; pin: Uint8Array; salt: Uint8Array; out: Uint8Array }[] = [];
    const saltCopies: string[] = [];
    const scrypt: ScryptFn = async (pin, salt, o) => {
      saltCopies.push(Buffer.from(salt).toString("hex"));
      const out = new Uint8Array(32).fill(0xaa);
      seen.push({ N: o.N, r: o.r, p: o.p, pin, salt, out });
      return out;
    };
    let t = 0;
    const streamed: number[] = [];
    const results = await runKdfBenchmark({
      randomBytes: (n) => new Uint8Array(nodeRandomBytes(n)),
      scrypt,
      now: () => (t += 250),
      onResult: (r) => streamed.push(r.logN),
    });
    assert.deepEqual(BENCHMARK_LOG_N, [12, 13, 14, 15]);
    assert.deepEqual(results.map((r) => r.logN), [12, 13, 14, 15]);
    assert.deepEqual(streamed, [12, 13, 14, 15]);
    assert.deepEqual(seen.map((s) => [s.N, s.r, s.p]), [[4096, 8, 1], [8192, 8, 1], [16384, 8, 1], [32768, 8, 1]]);
    assert.deepEqual(results.map((r) => r.memoryMiB), [4, 8, 16, 32]);
    assert.ok(results.every((r) => r.seconds === 0.25));
    for (const s of seen) {
      assert.equal(s.pin.length, 6);
      assert.ok([s.pin, s.salt, s.out].every((b) => b.every((x) => x === 0)), "buffers zeroed");
    }
    assert.equal(new Set(saltCopies).size, 4, "a fresh random salt for every run");
  });

  it("stops between levels when cancelled", async () => {
    let calls = 0;
    const results = await runKdfBenchmark({
      randomBytes: (n) => new Uint8Array(n),
      scrypt: async () => (calls++, new Uint8Array(32)),
      isCancelled: () => calls >= 2,
    });
    assert.equal(results.length, 2);
  });

  it("runs the real scrypt at a low level and names the engine", async () => {
    const results = await runKdfBenchmark({ randomBytes: (n) => new Uint8Array(nodeRandomBytes(n)), levels: [10] });
    assert.equal(results.length, 1);
    assert.ok(results[0].seconds > 0);
    assert.match(describeJsEngine(), /^Node \d+/);
  });
});
