/**
 * PIN checks inside an open session (Settings: change a code, erase everything). Pure, so the
 * counting rules are unit-tested; device.ts supplies the SecureStore-backed counters, the same
 * ones the PIN screen uses.
 *
 * Rules:
 * - While a lockout is running, no check is attempted (no key derivation).
 * - A wrong PIN counts toward the existing lockout, exactly like a wrong PIN at unlock.
 * - A correct PIN resets the counter, as at unlock.
 * - Errors (such as a malformed PIN) propagate and are not counted.
 */
export type LockoutCounters = {
  getLockoutUntil(): Promise<number | null>;
  recordFailedAttempt(): Promise<{ locked: boolean; lockoutUntil: number | null }>;
  resetFailedAttempts(): Promise<void>;
};

export type PinAttemptResult =
  | { ok: true }
  | { ok: false; reason: "wrong" }
  | { ok: false; reason: "locked"; lockoutUntil: number };

export async function guardedPinAttempt(
  counters: LockoutCounters,
  attempt: () => Promise<boolean>,
): Promise<PinAttemptResult> {
  const until = await counters.getLockoutUntil();
  if (until) return { ok: false, reason: "locked", lockoutUntil: until };

  if (await attempt()) {
    await counters.resetFailedAttempts();
    return { ok: true };
  }

  const result = await counters.recordFailedAttempt();
  if (result.locked && result.lockoutUntil) {
    return { ok: false, reason: "locked", lockoutUntil: result.lockoutUntil };
  }
  return { ok: false, reason: "wrong" };
}
