import { getVault } from "../lib/vault/expoStorage";
import { isRealSession } from "./session";
import { uploadEncryptedSubmission } from "../lib/submissions";
import { getReporterMetadataForSubmission } from "./reporterProfile";
import { clearWorkingReportIfFor } from "./editorDraft";
import type { DraftAttachment, SubmittedAttachment } from "../lib/attachments/types";
import { canSend, isSendTarget, toVisibleItem } from "./itemRules";
import { deleteAttachmentsFiles } from "../lib/attachments/persistLocal";
import {
  deleteStoragePaths,
  readLocalAttachmentBytes,
  uploadAttachmentBytes,
  type LocalAttachmentBytes,
} from "../lib/attachments/storageUpload";
import { attachmentReadFailedCode, missingAttachmentCode } from "../lib/attachments/sendErrorMessages";
import { storageObjectName } from "../lib/attachments/fileNames";
import { formatSubmissionPipelineError } from "../lib/attachments/submissionErrors";
import { isMissingLocalAttachmentError } from "../lib/attachments/readLocalFileForUpload";

export type ReportStatus = "draft" | "ready" | "queued";
export type SubmissionStatus =
  | "not_submitted"
  | "queued"
  | "syncing"
  | "confirmed"
  | "purged"
  | "failed";

export type ReportRecord = {
  id: string;
  title: string;
  body: string;
  status: ReportStatus;
  submissionStatus: SubmissionStatus;
  createdAt: string;
  updatedAt: string;
  lastSubmissionAttemptAt: string | null;
  attachments: DraftAttachment[];
  /** Plaintext short reason from last failed send (safe-truncated); cleared on success / return-to-ready. */
  lastSubmissionError: string | null;
};

/**
 * Security model (reporter-side):
 * - Reporter safety is prioritized over local convenience.
 * - Once the server confirms receipt, the device intentionally does not retain the report.
 * - The dashboard/server is the record of truth after delivery.
 */
export type PurgeTombstone = {
  clientSubmissionId: string;
  status: "purged";
  confirmedAt: string;
  serverSubmissionId: string;
};

/**
 * Stored inside the real vault's "reports" record (encrypted as a whole by the vault).
 * Every list change goes through vault.update(), so concurrent writes can't lose updates.
 */
type StoredReportRecord = {
  id: string;
  title: string;
  body: string;
  status: ReportStatus;
  submissionStatus: SubmissionStatus;
  createdAt: string;
  updatedAt: string;
  lastSubmissionAttemptAt: string | null;
  attachments: DraftAttachment[];
  lastSubmissionError?: string | null;
};

// In-memory duplicate protection: avoid concurrent sync attempts for the same item.
const inFlightClientSubmissionIds = new Set<string>();

/**
 * Server receipts that arrived after the vault was locked mid-send (ids only, memory only).
 * Applied at the next real unlock, so a confirmed item is purged instead of being re-sent.
 * Lost if the app is killed before then; the item is then re-sent with the same
 * clientSubmissionId (same as a crash between receipt and purge before the vault).
 */
const pendingReceipts = new Map<string, { serverSubmissionId: string; confirmedAt: string }>();

function vaultLocked(): Error {
  return new Error("Vault locked");
}

function requireRealSession() {
  if (!isRealSession()) throw vaultLocked();
}

function asList<T>(value: unknown): T[] {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) throw new Error("Stored list is not a list");
  return value as T[];
}

function getSubmissionPayloadSecret(): string {
  const secret = process.env.EXPO_PUBLIC_SUBMISSION_PAYLOAD_SECRET;
  if (!secret) {
    throw new Error("Missing EXPO_PUBLIC_SUBMISSION_PAYLOAD_SECRET");
  }
  return secret;
}

function normalizeAttachmentsForWorkflow(
  status: ReportStatus,
  attachments: DraftAttachment[]
): DraftAttachment[] {
  if (status === "queued") {
    return attachments.map((a) => ({
      ...a,
      status: "queued",
      uploadError: undefined,
    }));
  }
  return attachments.map((a) => ({
    ...a,
    status: "local",
    uploadError: undefined,
  }));
}

function diffRemovedAttachments(
  previous: DraftAttachment[],
  next: DraftAttachment[]
): DraftAttachment[] {
  const nextIds = new Set(next.map((a) => a.id));
  return previous.filter((a) => !nextIds.has(a.id));
}

/** Throws when locked or when the record can't be read (corruption is never "no items"). */
async function readStoredReports(): Promise<StoredReportRecord[]> {
  requireRealSession();
  return asList<StoredReportRecord>(await getVault().get("reports"));
}

/** The one write path for the item list. */
async function mutateStoredReports(
  fn: (list: StoredReportRecord[]) => StoredReportRecord[]
): Promise<StoredReportRecord[]> {
  requireRealSession();
  return await getVault().update<StoredReportRecord[]>("reports", (current) =>
    fn(asList<StoredReportRecord>(current))
  );
}

async function readPurgeTombstones(): Promise<PurgeTombstone[]> {
  requireRealSession();
  return asList<PurgeTombstone>(await getVault().get("tombstones"));
}

async function addPurgeTombstone(tombstone: PurgeTombstone) {
  requireRealSession();
  await getVault().update<PurgeTombstone[]>("tombstones", (current) => [
    tombstone,
    ...asList<PurgeTombstone>(current).filter((t) => t.clientSubmissionId !== tombstone.clientSubmissionId),
  ]);
}

/** Tombstoned ids, for callers outside this module (editorDraft). Throws when locked. */
export async function getTombstonedIds(): Promise<Set<string>> {
  return new Set((await readPurgeTombstones()).map((t) => t.clientSubmissionId));
}

/** Ids of stored items, for callers outside this module (editorDraft). Throws when locked. */
export async function getStoredReportIds(): Promise<Set<string>> {
  return new Set((await readStoredReports()).map((r) => r.id));
}

async function persistLastSubmissionError(id: string, message: string | null) {
  await mutateStoredReports((reports) =>
    reports.map((r) => (r.id === id ? { ...r, lastSubmissionError: message ? message : undefined } : r))
  );
}

/**
 * Number of stored, non-purged report records.
 * Throws if the stored list can't be read, so corruption is never mistaken for "no reports".
 * Attachment cleanup compares this with getReports().length to detect dropped records.
 */
export async function countStoredActionableReports(): Promise<number> {
  const stored = await readStoredReports();
  const tombstonedIds = await getTombstonedIds();
  return stored.filter((r) => !tombstonedIds.has(r?.id ?? "")).length;
}

/** Every well-formed record is shown (itemRules.toVisibleItem): nothing is hidden. */
function toReportRecord(report: StoredReportRecord): ReportRecord | null {
  return toVisibleItem<DraftAttachment>(report);
}

/** Empty when locked, in a cover session, or when the stored list can't be read. */
export async function getReports(): Promise<ReportRecord[]> {
  if (!isRealSession()) return [];
  let reports: StoredReportRecord[];
  let tombstonedIds: Set<string>;
  try {
    reports = await readStoredReports();
    tombstonedIds = await getTombstonedIds();
  } catch {
    console.warn("[DRAFTS] stored items could not be read");
    return [];
  }
  return reports
    .filter((r) => !tombstonedIds.has(r?.id))
    .map(toReportRecord)
    .filter(Boolean) as ReportRecord[];
}

export async function saveReport(
  title: string,
  body: string,
  status: ReportStatus = "draft",
  attachments: DraftAttachment[] = []
) {
  requireRealSession();
  const now = new Date().toISOString();
  const normalized = normalizeAttachmentsForWorkflow(status, attachments);

  const nextReport: StoredReportRecord = {
    id: String(Date.now()),
    title,
    body,
    attachments: normalized,
    status,
    submissionStatus: status === "queued" ? "queued" : "not_submitted",
    createdAt: now,
    updatedAt: now,
    lastSubmissionAttemptAt: null,
  };

  await mutateStoredReports((reports) => [nextReport, ...reports]);

  return {
    id: nextReport.id,
    title,
    body,
    status,
    submissionStatus: nextReport.submissionStatus,
    createdAt: nextReport.createdAt,
    updatedAt: nextReport.updatedAt,
    lastSubmissionAttemptAt: nextReport.lastSubmissionAttemptAt,
    attachments: normalized,
    lastSubmissionError: null,
  };
}

export async function updateReport(
  id: string,
  title: string,
  body: string,
  status: ReportStatus = "draft",
  attachments?: DraftAttachment[]
) {
  requireRealSession();
  const now = new Date().toISOString();
  let removed: DraftAttachment[] = [];
  let normalized: DraftAttachment[] = [];

  const next = await mutateStoredReports((reports) => {
    const previousForId = reports.find((r) => r.id === id);
    const previousAttachments = previousForId?.attachments ?? [];
    const nextAttachmentsRaw = attachments === undefined ? previousAttachments : attachments;
    removed = diffRemovedAttachments(previousForId ? previousAttachments : [], nextAttachmentsRaw);
    normalized = normalizeAttachmentsForWorkflow(status, nextAttachmentsRaw);

    return reports.map((report) => {
      if (report.id !== id) return report;

      let nextSubmission: SubmissionStatus = "not_submitted";
      if (status === "queued") {
        if (report.submissionStatus === "failed") nextSubmission = "failed";
        else if (report.submissionStatus === "syncing") nextSubmission = "syncing";
        else nextSubmission = "queued";
      }

      return {
        ...report,
        title,
        body,
        attachments: normalized,
        status,
        submissionStatus: nextSubmission,
        updatedAt: now,
      };
    });
  });

  // Files of removed attachments are deleted only after the list no longer references them.
  await deleteAttachmentsFiles(removed);

  const updated = next.find((report) => report.id === id);
  if (!updated) return null;

  return {
    id: updated.id,
    title,
    body,
    status,
    submissionStatus: updated.submissionStatus ?? "not_submitted",
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt ?? updated.createdAt,
    lastSubmissionAttemptAt: updated.lastSubmissionAttemptAt ?? null,
    attachments: normalized,
    lastSubmissionError: updated.lastSubmissionError ?? null,
  };
}

export async function updateReportStatus(id: string, status: ReportStatus) {
  const now = new Date().toISOString();
  await mutateStoredReports((reports) =>
    reports.map((report) => {
      if (report.id !== id) return report;

      let attachmentsNext = report.attachments ?? [];
      if (status === "ready" && report.status === "queued") {
        attachmentsNext = attachmentsNext.map((a) => ({
          ...a,
          status: "local" as const,
          uploadError: undefined,
        }));
      }

      return {
        ...report,
        status,
        submissionStatus: status === "queued" ? "queued" : "not_submitted",
        updatedAt: now,
        attachments: attachmentsNext,
        lastSubmissionError: undefined,
      } as StoredReportRecord;
    })
  );
}

export async function updateSubmissionStatus(
  id: string,
  submissionStatus: SubmissionStatus
) {
  const now = new Date().toISOString();
  await mutateStoredReports((reports) =>
    reports.map((report) =>
      report.id === id
        ? {
            ...report,
            submissionStatus,
            lastSubmissionAttemptAt: now,
            updatedAt: now,
          }
        : report
    )
  );
}

export async function purgeSubmittedReportLocally(input: {
  clientSubmissionId: string;
  serverSubmissionId: string;
}) {
  const stages: string[] = [];
  const errors: { stage: string; message: string }[] = [];

  function stageLog(stage: string) {
    stages.push(stage);
    console.log("[PURGE] stage", { clientSubmissionId: input.clientSubmissionId, stage });
  }

  stageLog("load_reports");
  let target: StoredReportRecord | null = null;
  try {
    target = (await readStoredReports()).find((r) => r.id === input.clientSubmissionId) ?? null;
  } catch (e) {
    errors.push({ stage: "load_reports", message: e instanceof Error ? e.message : "unknown error" });
  }

  stageLog("delete_attachment_files");
  try {
    if (target?.attachments?.length) {
      await deleteAttachmentsFiles(target.attachments);
    }
  } catch (e) {
    errors.push({
      stage: "delete_attachment_files",
      message: e instanceof Error ? e.message : "unknown error",
    });
  }

  stageLog("clear_working_buffer");
  try {
    await clearWorkingReportIfFor(input.clientSubmissionId);
  } catch (e) {
    errors.push({
      stage: "clear_working_buffer",
      message: e instanceof Error ? e.message : "unknown error",
    });
  }

  stageLog("remove_report_record");
  try {
    await mutateStoredReports((reports) => reports.filter((r) => r.id !== input.clientSubmissionId));
  } catch (e) {
    errors.push({
      stage: "remove_report_record",
      message: e instanceof Error ? e.message : "unknown error",
    });
  }

  stageLog("done");

  if (errors.length) {
    console.warn("[PURGE] completed with errors", {
      clientSubmissionId: input.clientSubmissionId,
      stages,
      errors: errors.map((x) => ({ stage: x.stage, message: x.message })),
    });
    return { ok: false as const, errors, stages };
  }

  // Minimal tombstone: prevents re-materialization and never appears in UI.
  await addPurgeTombstone({
    clientSubmissionId: input.clientSubmissionId,
    status: "purged",
    confirmedAt: new Date().toISOString(),
    serverSubmissionId: input.serverSubmissionId,
  }).catch(() => {});

  console.log("[PURGE] success", { clientSubmissionId: input.clientSubmissionId, stages });
  return { ok: true as const, errors: [], stages };
}

async function clearLocalAttachmentsAfterSuccessfulSend(id: string) {
  const target = (await readStoredReports()).find((r) => r.id === id);
  if (!target?.attachments?.length) return;

  await deleteAttachmentsFiles(target.attachments);
  await mutateStoredReports((reports) =>
    reports.map((r) => (r.id === id ? { ...r, attachments: [], lastSubmissionError: undefined } : r))
  );
}

/** Local steps after a confirmed server receipt. Throws "Vault locked" if the vault closed. */
async function commitServerReceipt(clientSubmissionId: string, serverSubmissionId: string, confirmedAt: string) {
  await updateSubmissionStatus(clientSubmissionId, "confirmed");
  await clearLocalAttachmentsAfterSuccessfulSend(clientSubmissionId);
  console.log("[SYNC] purge: start", { clientSubmissionId, serverSubmissionId });

  // Defensive: only purge after confirmed server success. Retry once; on persistent failure,
  // write a minimal tombstone so it disappears from UI without retaining content.
  let purge = await purgeSubmittedReportLocally({ clientSubmissionId, serverSubmissionId });
  if (!purge.ok) {
    console.warn("[SYNC] purge failed; retrying once", { clientSubmissionId });
    purge = await purgeSubmittedReportLocally({ clientSubmissionId, serverSubmissionId });
  }
  if (!purge.ok) {
    requireRealSession(); // if the vault closed, keep the receipt pending instead
    await addPurgeTombstone({
      clientSubmissionId,
      status: "purged",
      confirmedAt,
      serverSubmissionId,
    }).catch(() => {});
  }

  await updateSubmissionStatus(clientSubmissionId, "purged").catch(() => {});
}

/**
 * Applies receipts that arrived while the vault was locked. Call after a real unlock.
 * Never throws; a receipt stays pending if the vault closes again.
 */
export async function applyPendingServerReceipts() {
  if (!isRealSession() || pendingReceipts.size === 0) return;
  for (const [clientSubmissionId, r] of [...pendingReceipts]) {
    try {
      await commitServerReceipt(clientSubmissionId, r.serverSubmissionId, r.confirmedAt);
      pendingReceipts.delete(clientSubmissionId);
      console.log("[SYNC] pending receipt applied", { clientSubmissionId });
    } catch {
      if (!isRealSession()) return;
    }
  }
}

export async function syncQueuedItem(clientSubmissionId: string) {
  requireRealSession();

  if (pendingReceipts.has(clientSubmissionId)) {
    // Already confirmed by the server while the vault was locked; never send twice.
    await applyPendingServerReceipts();
    return { status: "purged" as const, clientSubmissionId };
  }

  if (inFlightClientSubmissionIds.has(clientSubmissionId)) {
    console.log("[SYNC] skip duplicate (in-flight)", { clientSubmissionId });
    return { status: "syncing" as const };
  }
  inFlightClientSubmissionIds.add(clientSubmissionId);
  // Everything after the mark is inside this try, so the mark is always cleared (also when the
  // item is not found or can't be sent).
  try {
    return await syncMarkedItem(clientSubmissionId);
  } finally {
    inFlightClientSubmissionIds.delete(clientSubmissionId);
  }
}

async function syncMarkedItem(clientSubmissionId: string) {
  const reports = await getReports();
  const report = reports.find((item) => item.id === clientSubmissionId);

  if (!report) {
    throw new Error("Item not found");
  }

  if (report.status !== "queued") {
    throw new Error("Only pending items can be synced");
  }

  if (!canSend(report)) {
    throw new Error("Nothing to send: needs text or a file");
  }

  const submissionSecret = getSubmissionPayloadSecret();
  const attemptId = `${report.id}-${Date.now()}`;
  const uploadedStoragePaths: string[] = [];
  let pipelineStep: "attachments" | "firestore" | "confirmed" | "local_cleanup" = "attachments";

  console.log("[SYNC] begin", {
    clientSubmissionId,
    attemptId,
    status: report.submissionStatus,
    attachmentCount: report.attachments.length,
  });

  await persistLastSubmissionError(clientSubmissionId, null);
  await updateSubmissionStatus(clientSubmissionId, "syncing");

  try {
    // Checked before any upload so a missing profile never uploads and then rolls back.
    const reporter = await getReporterMetadataForSubmission();
    if (!reporter) {
      throw new Error(
        "Workspace profile incomplete: add your name in Settings → Workspace profile before syncing."
      );
    }

    console.log("[SYNC] attachments: start", {
      clientSubmissionId,
      count: report.attachments.length,
      attachmentIds: report.attachments.map((a) => a.id),
    });

    const submittedAttachments: SubmittedAttachment[] = [];

    for (const att of report.attachments) {
      const objectName = storageObjectName(att.id, att.name);
      const expectedStoragePath = `submissions/${attemptId}/attachments/${objectName}`;
      console.log("[SYNC] attachment upload: start", { clientSubmissionId, attachmentId: att.id });

      // Step 1: read the local file. Only errors from this step can mean "missing on this
      // device". Raw read errors are not passed on: their text can contain the local path,
      // which ends in the file name. What is stored and logged is a code with the id only.
      let local: LocalAttachmentBytes;
      try {
        local = await readLocalAttachmentBytes({ localUri: att.localUri, mimeType: att.mimeType });
      } catch (e: unknown) {
        const missing = isMissingLocalAttachmentError(e);
        console.warn(
          missing
            ? "[ATTACHMENT] local file missing; send stopped"
            : "[ATTACHMENT] local file could not be read; send stopped",
          { clientSubmissionId, attachmentId: att.id }
        );
        throw new Error(missing ? missingAttachmentCode(att.id) : attachmentReadFailedCode(att.id));
      }

      // Step 2: upload. Errors propagate unchanged and are never classified as a missing file.
      const uploaded = await uploadAttachmentBytes({
        bytes: local.bytes,
        mimeType: local.mimeType,
        storagePath: expectedStoragePath,
        attachmentId: att.id,
        originalName: att.name,
      });
      uploadedStoragePaths.push(uploaded.storagePath);
      submittedAttachments.push(uploaded);
      console.log("[SYNC] attachment upload: success", { clientSubmissionId, attachmentId: att.id });
    }

    pipelineStep = "firestore";
    console.log("[SYNC] server submit: start", {
      clientSubmissionId,
      attemptId,
      attachmentCount: submittedAttachments.length,
    });

    const payload = {
      schemaVersion: 2 as const,
      clientSubmissionId: report.id,
      attemptId,
      itemId: report.id,
      title: report.title,
      body: report.body,
      workflowStatus: report.status,
      createdAt: report.createdAt,
      updatedAt: report.updatedAt,
      attachments: submittedAttachments,
    };

    const serverReceipt = await uploadEncryptedSubmission(payload, submissionSecret, reporter);
    if (!serverReceipt?.ok) throw new Error("Ambiguous server receipt");
    if (serverReceipt.clientSubmissionId !== report.id) {
      throw new Error("Server receipt clientSubmissionId mismatch");
    }
    if (typeof serverReceipt.serverSubmissionId !== "string" || !serverReceipt.serverSubmissionId) {
      throw new Error("Missing serverSubmissionId");
    }

    console.log("[SYNC] server submit: success", {
      clientSubmissionId,
      serverSubmissionId: serverReceipt.serverSubmissionId,
    });

    pipelineStep = "confirmed";
    const serverSubmissionId = serverReceipt.serverSubmissionId;
    const confirmedAt = new Date().toISOString();
    try {
      pipelineStep = "local_cleanup";
      await commitServerReceipt(clientSubmissionId, serverSubmissionId, confirmedAt);
    } catch (commitError) {
      if (isRealSession()) throw commitError;
      // The server has the item; the vault locked before local cleanup. Keep the receipt in
      // memory and finish at the next real unlock instead of failing (which would re-send).
      pendingReceipts.set(clientSubmissionId, { serverSubmissionId, confirmedAt });
      console.warn("[SYNC] receipt kept pending: locked before local cleanup", { clientSubmissionId });
      return { status: "purged" as const, serverSubmissionId, clientSubmissionId };
    }
    console.log("[SYNC] complete", { clientSubmissionId, status: "purged" });
    return { status: "purged" as const, serverSubmissionId, clientSubmissionId };
  } catch (error) {
    const message = formatSubmissionPipelineError(error);
    // Safe to log and store: attachment errors are codes with ids only, local URIs are
    // redacted, and upload messages have object paths removed.
    console.error("[SYNC] failed", { clientSubmissionId, stage: pipelineStep, message });

    // Widened on purpose: TS narrows away the "local_cleanup" assignment made in the inner try.
    const step = pipelineStep as string;
    const serverHasItem = step === "confirmed" || step === "local_cleanup";
    if (serverHasItem) {
      // The server confirmed receipt; its record points at these uploads. Never delete them.
      console.warn("[SYNC] local cleanup failed after server receipt; uploads kept", { clientSubmissionId });
    } else if (uploadedStoragePaths.length) {
      console.log("[SYNC] rollback: deleting partial uploads", {
        clientSubmissionId,
        count: uploadedStoragePaths.length,
      });
      await deleteStoragePaths(uploadedStoragePaths);
    } else {
      console.log("[SYNC] rollback: no uploads", { clientSubmissionId });
    }

    // If the vault locked mid-send these writes fail; the item stays "syncing" and is reset to
    // "queued" on the next start. Never let them mask the original error.
    await updateSubmissionStatus(clientSubmissionId, "failed").catch(() => {});
    await persistLastSubmissionError(clientSubmissionId, message).catch(() => {});
    throw error;
  }
}

/**
 * On startup, items left in "syncing" state mean the app was killed mid-sync.
 * Reset them to "queued" so they are retried — the in-flight Set is cleared on restart.
 */
async function resetStuckSyncingItems() {
  const stored = await readStoredReports();
  if (!stored.some((r) => r.submissionStatus === "syncing" && !pendingReceipts.has(r.id))) return;

  await mutateStoredReports((reports) =>
    reports.map((r) =>
      r.submissionStatus === "syncing" && !pendingReceipts.has(r.id)
        ? { ...r, submissionStatus: "queued" as SubmissionStatus }
        : r
    )
  );
  console.log("[SYNC] reset stuck syncing items to queued");
}

export async function syncPendingItems(reason: "startup" | "network_reconnect" | "manual") {
  if (!isRealSession()) return;
  await applyPendingServerReceipts();
  if (reason === "startup") {
    await resetStuckSyncingItems().catch(() => {});
  }

  const reports = await getReports();
  const pendingIds = new Set(pendingReceipts.keys());
  const targets = reports.filter((r) => isSendTarget(r, pendingIds));
  console.log("[SYNC] batch start", { reason, count: targets.length });
  for (const item of targets) {
    try {
      await syncQueuedItem(item.id);
    } catch {
      // per-item failure already persisted; continue
    }
  }
  console.log("[SYNC] batch complete", { reason });
}

// Backwards-compatible export (used by existing UI code paths).
export async function sendQueuedReport(id: string) {
  return await syncQueuedItem(id);
}

export async function getReportById(id: string) {
  const reports = await getReports();
  return reports.find((report) => report.id === id) ?? null;
}
