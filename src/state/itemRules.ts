/**
 * Which items show and which can be sent. Pure, so the rules are tested (itemRules.test.ts);
 * drafts.ts (list, send queue, orphan cleanup) and the editor use these, never their own copies.
 *
 * - Every well-formed stored item is shown: a draft with only a title, only text or only files
 *   is never hidden from Home, the send queue or the orphan-file cleanup. Only a record that
 *   is not an item at all (no string id) is skipped.
 * - An item can be sent when it has body text or at least one file. The title is optional.
 *   A title with nothing else is not sent.
 */
export type ItemStatus = "draft" | "ready" | "queued";
export type ItemSubmissionStatus = "not_submitted" | "queued" | "syncing" | "confirmed" | "purged" | "failed";

export type ItemContent = { title: string; body: string; attachments: readonly unknown[] };

export function canSend(item: ItemContent): boolean {
  return item.body.trim().length > 0 || item.attachments.length > 0;
}

export type VisibleItem<A> = {
  id: string;
  title: string;
  body: string;
  status: ItemStatus;
  submissionStatus: ItemSubmissionStatus;
  createdAt: string;
  updatedAt: string;
  lastSubmissionAttemptAt: string | null;
  attachments: A[];
  lastSubmissionError: string | null;
};

type Raw = Partial<{
  id: unknown;
  title: unknown;
  body: unknown;
  status: unknown;
  submissionStatus: unknown;
  createdAt: unknown;
  updatedAt: unknown;
  lastSubmissionAttemptAt: unknown;
  attachments: unknown;
  lastSubmissionError: unknown;
}>;

const STATUSES: readonly string[] = ["draft", "ready", "queued"];
const SUBMISSION_STATUSES: readonly string[] = ["not_submitted", "queued", "syncing", "confirmed", "purged", "failed"];
const str = (v: unknown) => (typeof v === "string" ? v : "");

/** Normalises a stored record for the list and the queue; null only when it is not an item. */
export function toVisibleItem<A>(raw: unknown): VisibleItem<A> | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Raw;
  if (typeof r.id !== "string" || !r.id) return null;
  const status = (STATUSES.includes(str(r.status)) ? r.status : "draft") as ItemStatus;
  const rawSubmission = (
    SUBMISSION_STATUSES.includes(str(r.submissionStatus)) ? r.submissionStatus : "not_submitted"
  ) as ItemSubmissionStatus;
  const createdAt = str(r.createdAt);
  return {
    id: r.id,
    title: str(r.title),
    body: str(r.body),
    status,
    submissionStatus: status === "queued" && rawSubmission === "not_submitted" ? "queued" : rawSubmission,
    createdAt,
    updatedAt: str(r.updatedAt) || createdAt,
    lastSubmissionAttemptAt: typeof r.lastSubmissionAttemptAt === "string" ? r.lastSubmissionAttemptAt : null,
    attachments: Array.isArray(r.attachments) ? (r.attachments as A[]) : [],
    lastSubmissionError: typeof r.lastSubmissionError === "string" ? r.lastSubmissionError : null,
  };
}

/** Items the send queue picks up (syncPendingItems). */
export function isSendTarget(
  item: Pick<VisibleItem<unknown>, "id" | "status" | "submissionStatus">,
  pendingReceiptIds: ReadonlySet<string>,
): boolean {
  return (
    item.status === "queued" &&
    (item.submissionStatus === "queued" || item.submissionStatus === "failed") &&
    !pendingReceiptIds.has(item.id)
  );
}
