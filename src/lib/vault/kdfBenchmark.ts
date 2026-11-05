/**
 * TEST-PHASE DIAGNOSTIC: on-device scrypt timing, to choose the vault's KDF parameters.
 *
 * Pure TypeScript, no React Native imports. Uses a random dummy PIN and salt for every run,
 * reads and writes NO storage, never touches the vault, its device secret or any session,
 * and logs nothing. All buffers are zeroed after each run.
 */
import { defaultScrypt, type RandomBytes, type ScryptFn } from "./vault.ts";

export const BENCHMARK_LOG_N = [12, 13, 14, 15] as const;
export const BENCHMARK_R = 8;
export const BENCHMARK_P = 1;

export type BenchmarkResult = { logN: number; memoryMiB: number; seconds: number };

export type BenchmarkOptions = {
  randomBytes: RandomBytes;
  levels?: readonly number[];
  /** Called after each level completes, so the UI can show results as they arrive. */
  onResult?: (result: BenchmarkResult) => void;
  /** Checked between levels; a derivation already running finishes, then the loop stops. */
  isCancelled?: () => boolean;
  /** Injection points for tests. Defaults: the vault's own scrypt and performance.now(). */
  scrypt?: ScryptFn;
  now?: () => number;
};

const defaultNow = () =>
  typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();

/** Times ONE derivation per level, in sequence (never in parallel, so runs don't compete). */
export async function runKdfBenchmark(opts: BenchmarkOptions): Promise<BenchmarkResult[]> {
  const scrypt = opts.scrypt ?? defaultScrypt;
  const now = opts.now ?? defaultNow;
  const results: BenchmarkResult[] = [];
  for (const logN of opts.levels ?? BENCHMARK_LOG_N) {
    if (opts.isCancelled?.()) break;
    // Dummy 6-digit PIN (ASCII digits, as the vault normalises) and dummy salt, fresh per run.
    const pin = opts.randomBytes(6).map((b) => 0x30 + (b % 10));
    const salt = opts.randomBytes(16);
    let out: Uint8Array | null = null;
    try {
      const t0 = now();
      out = await scrypt(pin, salt, { N: 2 ** logN, r: BENCHMARK_R, p: BENCHMARK_P, dkLen: 32 });
      const seconds = (now() - t0) / 1000;
      const result = { logN, memoryMiB: (128 * BENCHMARK_R * 2 ** logN) / 2 ** 20, seconds };
      results.push(result);
      opts.onResult?.(result);
    } finally {
      pin.fill(0);
      salt.fill(0);
      out?.fill(0);
    }
  }
  return results;
}

/** Name of the JS engine running this code, e.g. "Hermes 0.81.0" — no device identifiers. */
export function describeJsEngine(): string {
  const hermes = (globalThis as { HermesInternal?: { getRuntimeProperties?: () => Record<string, unknown> } })
    .HermesInternal;
  if (hermes) {
    let version: unknown;
    try {
      version = hermes.getRuntimeProperties?.()["OSS Release Version"];
    } catch {
      version = undefined;
    }
    return typeof version === "string" && version ? `Hermes ${version}` : "Hermes";
  }
  if (typeof process !== "undefined" && typeof process.versions?.node === "string") {
    return `Node ${process.versions.node} (V8)`;
  }
  return "Not Hermes (JavaScriptCore or V8)";
}
