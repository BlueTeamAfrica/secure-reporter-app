import { getVault } from "../lib/vault/expoStorage";
import { isRealSession } from "./session";
import { getStoredReportIds, getTombstonedIds } from "./drafts";
import type { DraftAttachment } from "../lib/attachments/types";
import { isEmptyWorkingDraft } from "./workingDraftPlan";

export type WorkingReport = {
  reportId?: string;
  title: string;
  body: string;
  attachments: DraftAttachment[];
  updatedAt: string;
};

/** Stored in the real vault's "working" record (encrypted as a whole by the vault). */
type StoredWorkingReport = {
  reportId?: string;
  title: string;
  body: string;
  attachments: DraftAttachment[];
  updatedAt: string;
};

// Runtime-only snapshot of the current editor contents.
// Used to flush a final autosave right before a lock closes the vault.
let runtimeWorkingReport: Omit<WorkingReport, "updatedAt"> | null = null;

export function setRuntimeWorkingReportSnapshot(input: {
  reportId?: string;
  title: string;
  body: string;
  attachments: DraftAttachment[];
}) {
  runtimeWorkingReport = {
    reportId: input.reportId,
    title: input.title,
    body: input.body,
    attachments: input.attachments,
  };
}

export function clearRuntimeWorkingReportSnapshot() {
  runtimeWorkingReport = null;
}

export async function flushRuntimeWorkingReportSnapshotToStorage() {
  if (!runtimeWorkingReport) return;
  // Best-effort: if the vault is already locked or a cover session, saveWorkingReport throws.
  try {
    await saveWorkingReport({
      reportId: runtimeWorkingReport.reportId,
      title: runtimeWorkingReport.title,
      body: runtimeWorkingReport.body,
      attachments: runtimeWorkingReport.attachments,
    });
  } catch {
    // ignore
  }
}

/**
 * Leaving the editor (D4): keep what was typed instead of discarding the last seconds the
 * autosave timer had not written yet. An empty editor creates nothing. Best-effort, like lock.
 */
export async function saveRuntimeSnapshotOnExit() {
  const snapshot = runtimeWorkingReport;
  runtimeWorkingReport = null;
  if (!snapshot || isEmptyWorkingDraft(snapshot)) return;
  try {
    await saveWorkingReport(snapshot);
  } catch {
    // Locked or a cover session: nothing to save into.
  }
}

async function isActionableReportId(reportId: string) {
  try {
    if ((await getTombstonedIds()).has(reportId)) return false;
  } catch {
    // ignore
  }
  try {
    return (await getStoredReportIds()).has(reportId);
  } catch {
    return false;
  }
}

function parseStored(value: unknown): StoredWorkingReport | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Partial<StoredWorkingReport>;
  return {
    reportId: typeof v.reportId === "string" ? v.reportId : undefined,
    title: typeof v.title === "string" ? v.title : "",
    body: typeof v.body === "string" ? v.body : "",
    attachments: Array.isArray(v.attachments) ? v.attachments : [],
    updatedAt: typeof v.updatedAt === "string" ? v.updatedAt : new Date(0).toISOString(),
  };
}

export async function saveWorkingReport(input: {
  reportId?: string;
  title: string;
  body: string;
  attachments?: DraftAttachment[];
}) {
  if (!isRealSession()) {
    throw new Error("Vault locked");
  }

  const attachments = input.attachments ?? [];
  // Defensive: after confirmed delivery we intentionally purge the report locally.
  // Prevent autosave from re-materializing a purged/submitted report under the same reportId.
  const reportId =
    input.reportId && (await isActionableReportId(input.reportId)) ? input.reportId : undefined;

  const next: StoredWorkingReport = {
    reportId,
    title: input.title,
    body: input.body,
    attachments,
    updatedAt: new Date().toISOString(),
  };

  await getVault().put("working", next);
}

export async function getWorkingReport(): Promise<WorkingReport | null> {
  if (!isRealSession()) return null;
  try {
    const parsed = parseStored(await getVault().get("working"));
    if (!parsed) return null;
    if (parsed.title === "" && parsed.body === "" && parsed.attachments.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * True when a working-draft record exists, whether or not it is readable. Fails closed:
 * if the record can't be read, assume it exists (attachment cleanup then deletes nothing).
 */
export async function hasStoredWorkingReport(): Promise<boolean> {
  if (!isRealSession()) return true;
  try {
    return (await getVault().get("working")) !== null;
  } catch {
    return true;
  }
}

export async function clearWorkingReport() {
  if (!isRealSession()) return;
  await getVault().remove("working");
}

/** Purge step: clears the working draft only if it belongs to the given report. */
export async function clearWorkingReportIfFor(reportId: string) {
  if (!isRealSession()) throw new Error("Vault locked");
  const current = parseStored(await getVault().get("working"));
  if (current?.reportId === reportId) {
    await getVault().remove("working");
  }
}
