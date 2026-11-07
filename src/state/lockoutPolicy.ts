/**
 * Wrong-PIN lockout rule, shared by the PIN screen and in-session checks. Pure, so it is
 * unit-tested; device.ts stores the result in SecureStore.
 * - After 3 wrong attempts: 10 s delay.
 * - After 5 wrong attempts: 60 s cooldown, and the counter resets.
 */
export const SOFT_DELAY_AFTER_ATTEMPTS = 3;
export const SOFT_DELAY_MS = 10 * 1000;
export const HARD_COOLDOWN_AFTER_ATTEMPTS = 5;
export const HARD_COOLDOWN_MS = 60 * 1000;

export type AfterFailure = { failedAttempts: number; locked: boolean; lockoutUntil: number | null };

export function afterFailedAttempt(currentFailedAttempts: number, now: number): AfterFailure {
  const next = currentFailedAttempts + 1;
  if (next >= HARD_COOLDOWN_AFTER_ATTEMPTS) {
    return { failedAttempts: 0, locked: true, lockoutUntil: now + HARD_COOLDOWN_MS };
  }
  if (next >= SOFT_DELAY_AFTER_ATTEMPTS) {
    return { failedAttempts: next, locked: true, lockoutUntil: now + SOFT_DELAY_MS };
  }
  return { failedAttempts: next, locked: false, lockoutUntil: null };
}
