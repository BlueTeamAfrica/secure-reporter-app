/**
 * Send status for Home (Phase 2b item 7). Pure, so the rules are tested.
 *
 * "Last sent" is read from the purge tombstones the real vault already keeps (one per item the
 * server confirmed; ids and a time only, never a title or content). Nothing new is stored.
 */
export type SentSummary = { count: number; lastSentAt: string | null };

export function summarizeSent(tombstones: unknown): SentSummary {
  if (!Array.isArray(tombstones)) return { count: 0, lastSentAt: null };
  let last: string | null = null;
  let count = 0;
  for (const t of tombstones) {
    const at = t && typeof t === "object" ? (t as { confirmedAt?: unknown }).confirmedAt : undefined;
    if (typeof at !== "string" || Number.isNaN(Date.parse(at))) continue;
    count++;
    if (last === null || at > last) last = at;
  }
  return { count, lastSentAt: last };
}

export type SyncOutcome =
  | { kind: "offline" }
  | { kind: "nothing" }
  | { kind: "sent"; sent: number }
  | { kind: "failed"; failed: number }
  | { kind: "partial"; sent: number; failed: number };

/**
 * The result of one sync attempt, from what Home can see before and after it. Anything still
 * waiting afterwards counts as not sent, so the result can never claim success while an item
 * is still waiting.
 */
export function syncOutcome(input: {
  online: boolean;
  waitingBefore: number;
  waitingAfter: number;
  sentBefore: number;
  sentAfter: number;
}): SyncOutcome {
  if (!input.online) return { kind: "offline" };
  if (input.waitingBefore === 0) return { kind: "nothing" };
  const failed = Math.max(0, input.waitingAfter);
  const sent = Math.max(0, input.sentAfter - input.sentBefore, input.waitingBefore - input.waitingAfter);
  if (failed > 0 && sent > 0) return { kind: "partial", sent, failed };
  if (failed > 0) return { kind: "failed", failed };
  return { kind: "sent", sent };
}
