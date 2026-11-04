import AsyncStorage from "@react-native-async-storage/async-storage";
import { getSessionPin } from "./session";
import { encryptDraftText, decryptDraftText } from "../lib/crypto/drafts";
import { uploadEncryptedSubmission } from "../lib/submissions";
import { getReporterMetadataForSubmission } from "./reporterProfile";
import type { DraftAttachment, SubmittedAttachment } from "../lib/attachments/types";
import { deleteAllImportedAttachments, deleteAttachmentsFiles } from "../lib/attachments/persistLocal";
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
import { REPORTS_KEY, PURGE_TOMBSTONES_KEY, WORKING_REPORT_KEY } from "./storageKeys";

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

type StoredReportRecord = {
  id: string;
  encryptedTitle?: string;
  encryptedBody?: string;
  encryptedText?: string;
  text?: string;
  encryptedAttachments?: string;
  createdAt: string;
  updatedAt?: string;
  status?: ReportStatus;
  submissionStatus?: SubmissionStatus;
  lastSubmissionAttemptAt?: string | null;
  lastSubmissionError?: string;
};

// REPORTS_KEY, PURGE_TOMBSTONES_KEY, WORKING_REPORT_KEY imported from storageKeys.ts

// In-memory duplicate protection: avoid concurrent sync attempts for the same item.
const inFlightClientSubmissionIds = new Set<string>();

function getSubmissionPayloadSecret(): string {
  const secret = process.env.EXPO_PUBLIC_SUBMISSION_PAYLOAD_SECRET;
  if (!secret) {
    throw new Error("Missing EXPO_PUBLIC_SUBMISSION_PAYLOAD_SECRET");
  }
  return secret;
}

function attachmentsToCipher(attachments: DraftAttachment[], pin: string) {
  if (!attachments.length) return undefined;
  return encryptDraftText(JSON.stringify(attachments), pin);
}

function cipherToAttachments(cipher: string | undefined, pin: string): DraftAttachment[] {
  if (!cipher) return [];
  try {
    const plain = decryptDraftText(cipher, pin);
    const parsed: unknown = JSON.parse(plain);
    if (!Array.isArray(parsed)) return [];
    return parsed as DraftAttachment[];
  } catch {
    return [];
  }
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

async function getStoredReports(): Promise<StoredReportRecord[]> {
  const raw = await AsyncStorage.getItem(REPORTS_KEY);
  if (!raw) return [];

  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function saveStoredReports(reports: StoredReportRecord[]) {
  await AsyncStorage.setItem(REPORTS_KEY, JSON.stringify(reports));
}

async function getPurgeTombstones(): Promise<PurgeTombstone[]> {
  const raw = await AsyncStorage.getItem(PURGE_TOMBSTONES_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as PurgeTombstone[];
  } catch {
    return [];
  }
}

async function addPurgeTombstone(tombstone: PurgeTombstone) {
  const existing = await getPurgeTombstones();
  const next = [
    tombstone,
    ...existing.filter((t) => t.clientSubmissionId !== tombstone.clientSubmissionId),
  ];
  await AsyncStorage.setItem(PURGE_TOMBSTONES_KEY, JSON.stringify(next));
}

async function persistLastSubmissionError(id: string, message: string | null) {
  const reports = await getStoredReports();
  const next = reports.map((r) =>
    r.id === id
      ? {
          ...r,
          lastSubmissionError: message ? message : undefined,
        }
      : r
  );
  await saveStoredReports(next);
}

/**
 * Number of stored, non-purged report records, counted without decrypting.
 * Throws if the stored list can't be parsed, so corruption is never mistaken for "no reports".
 * Attachment cleanup compares this with getReports().length to detect dropped records.
 */
export async function countStoredActionableReports(): Promise<number> {
  const raw = await AsyncStorage.getItem(REPORTS_KEY);
  if (!raw) return 0;
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error("Stored reports are not a list");
  }
  const tombstones = await getPurgeTombstones();
  const tombstonedIds = new Set(tombstones.map((t) => t.clientSubmissionId));
  return parsed.filter((r) => !tombstonedIds.has((r as StoredReportRecord | null)?.id ?? "")).length;
}

export async function clearAllDrafts() {
  await deleteAllImportedAttachments();
  await AsyncStorage.removeItem(REPORTS_KEY);
  await AsyncStorage.removeItem(PURGE_TOMBSTONES_KEY);
}

function defaultSubmissionStatus(_status: ReportStatus): SubmissionStatus {
  return "not_submitted";
}

export async function getReports(): Promise<ReportRecord[]> {
  const pin = getSessionPin();
  const reports = await getStoredReports();
  const tombstones = await getPurgeTombstones();
  const tombstonedIds = new Set(tombstones.map((t) => t.clientSubmissionId));

  return reports
    .filter((r) => !tombstonedIds.has(r.id))
    .map((report) => {
      const updatedAt = report.updatedAt ?? report.createdAt;
      const status: ReportStatus = report.status ?? "draft";
      // Migration: older state values are mapped into the new state machine.
      const raw = (report.submissionStatus ?? defaultSubmissionStatus(status)) as any;
      const submissionStatus: SubmissionStatus =
        raw === "submitting"
          ? "syncing"
          : raw === "submitted"
            ? "confirmed"
            : raw === "purge_failed"
              ? "purged"
              : status === "queued" && raw === "not_submitted"
                ? "queued"
                : raw;
      const lastSubmissionAttemptAt = report.lastSubmissionAttemptAt ?? null;
      const lastSubmissionError = report.lastSubmissionError ?? null;
      const attachments =
        pin && report.encryptedAttachments
          ? cipherToAttachments(report.encryptedAttachments, pin)
          : [];

      if (typeof report.text === "string") {
        return {
          id: report.id,
          title: "Untitled note",
          body: report.text,
          status,
          submissionStatus,
          createdAt: report.createdAt,
          updatedAt,
          lastSubmissionAttemptAt,
          attachments: [],
          lastSubmissionError,
        };
      }

      if (typeof report.encryptedText === "string") {
        if (!pin) return null;

        try {
          const body = decryptDraftText(report.encryptedText, pin);
          if (!body) return null;

          return {
            id: report.id,
            title: "Untitled note",
            body,
            status,
            submissionStatus,
            createdAt: report.createdAt,
            updatedAt,
            lastSubmissionAttemptAt,
            attachments: [],
            lastSubmissionError,
          };
        } catch {
          return null;
        }
      }

      if (
        typeof report.encryptedTitle === "string" &&
        typeof report.encryptedBody === "string"
      ) {
        if (!pin) return null;

        try {
          const title = decryptDraftText(report.encryptedTitle, pin);
          const body = decryptDraftText(report.encryptedBody, pin);

          if (!title || !body) return null;

          return {
            id: report.id,
            title,
            body,
            status,
            submissionStatus,
            createdAt: report.createdAt,
            updatedAt,
            lastSubmissionAttemptAt,
            attachments,
            lastSubmissionError,
          };
        } catch {
          return null;
        }
      }

      return null;
    })
    .filter(Boolean) as ReportRecord[];
}

export async function saveReport(
  title: string,
  body: string,
  status: ReportStatus = "draft",
  attachments: DraftAttachment[] = []
) {
  const pin = getSessionPin();
  if (!pin) {
    throw new Error("Missing session PIN");
  }

  const reports = await getStoredReports();
  const now = new Date().toISOString();
  const normalized = normalizeAttachmentsForWorkflow(status, attachments);

  const nextReport: StoredReportRecord = {
    id: String(Date.now()),
    encryptedTitle: encryptDraftText(title, pin),
    encryptedBody: encryptDraftText(body, pin),
    encryptedAttachments: attachmentsToCipher(normalized, pin),
    status,
    submissionStatus: status === "queued" ? "queued" : defaultSubmissionStatus(status),
    createdAt: now,
    updatedAt: now,
    lastSubmissionAttemptAt: null,
  };

  const next = [nextReport, ...reports];
  await saveStoredReports(next);

  return {
    id: nextReport.id,
    title,
    body,
    status,
    submissionStatus: nextReport.submissionStatus!,
    createdAt: nextReport.createdAt,
    updatedAt: nextReport.updatedAt!,
    lastSubmissionAttemptAt: nextReport.lastSubmissionAttemptAt!,
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
  const pin = getSessionPin();
  if (!pin) {
    throw new Error("Missing session PIN");
  }

  const reports = await getStoredReports();
  const now = new Date().toISOString();

  const previousForId = reports.find((r) => r.id === id);
  const previousAttachments =
    previousForId?.encryptedAttachments && pin
      ? cipherToAttachments(previousForId.encryptedAttachments, pin)
      : [];

  const nextAttachmentsRaw =
    attachments === undefined ? previousAttachments : attachments;

  const removed = diffRemovedAttachments(previousForId ? previousAttachments : [], nextAttachmentsRaw);
  await deleteAttachmentsFiles(removed);

  const normalized = normalizeAttachmentsForWorkflow(status, nextAttachmentsRaw);

  const next = reports.map((report) => {
    if (report.id !== id) return report;

    let nextSubmission: SubmissionStatus = "not_submitted";
    if (status === "queued") {
      if ((report.submissionStatus as any) === "failed") nextSubmission = "failed";
      else if ((report.submissionStatus as any) === "syncing") nextSubmission = "syncing";
      else nextSubmission = "queued";
    }

    return {
      ...report,
      encryptedTitle: encryptDraftText(title, pin),
      encryptedBody: encryptDraftText(body, pin),
      encryptedAttachments: attachmentsToCipher(normalized, pin),
      encryptedText: undefined,
      text: undefined,
      status,
      submissionStatus: nextSubmission,
      updatedAt: now,
    };
  });

  await saveStoredReports(next);

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
  const pin = getSessionPin();
  if (!pin) {
    throw new Error("Missing session PIN");
  }

  const reports = await getStoredReports();
  const now = new Date().toISOString();

  const next = reports.map((report) => {
    if (report.id !== id) return report;

    let encryptedAttachments = report.encryptedAttachments;
    if (status === "ready" && report.status === "queued" && report.encryptedAttachments) {
      const reset = cipherToAttachments(report.encryptedAttachments, pin).map((a) => ({
        ...a,
        status: "local" as const,
        uploadError: undefined,
      }));
      encryptedAttachments = attachmentsToCipher(reset, pin);
    }

    return {
      ...report,
      status,
      submissionStatus: status === "queued" ? "queued" : "not_submitted",
      updatedAt: now,
      encryptedAttachments,
      lastSubmissionError: undefined,
    } as StoredReportRecord;
  });

  await saveStoredReports(next);
}

export async function updateSubmissionStatus(
  id: string,
  submissionStatus: SubmissionStatus
) {
  const reports = await getStoredReports();
  const now = new Date().toISOString();

  const next = reports.map((report) =>
    report.id === id
      ? {
          ...report,
          submissionStatus,
          lastSubmissionAttemptAt: now,
          updatedAt: now,
        }
      : report
  );

  await saveStoredReports(next);
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
  const stored = await getStoredReports();
  const target = stored.find((r) => r.id === input.clientSubmissionId) ?? null;

  stageLog("delete_attachment_files");
  try {
    const pin = getSessionPin();
    if (pin && target?.encryptedAttachments) {
      const attachments = cipherToAttachments(target.encryptedAttachments, pin);
      await deleteAttachmentsFiles(attachments);
    }
  } catch (e) {
    errors.push({
      stage: "delete_attachment_files",
      message: e instanceof Error ? e.message : "unknown error",
    });
  }

  stageLog("clear_working_buffer");
  try {
    const rawWorking = await AsyncStorage.getItem(WORKING_REPORT_KEY);
    if (rawWorking) {
      const parsed = JSON.parse(rawWorking) as { reportId?: string } | null;
      if (parsed?.reportId === input.clientSubmissionId) {
        await AsyncStorage.removeItem(WORKING_REPORT_KEY);
      }
    }
  } catch (e) {
    errors.push({
      stage: "clear_working_buffer",
      message: e instanceof Error ? e.message : "unknown error",
    });
  }

  stageLog("remove_report_record");
  try {
    const next = stored.filter((r) => r.id !== input.clientSubmissionId);
    await saveStoredReports(next);
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
  const pin = getSessionPin();
  if (!pin) return;

  const reports = await getStoredReports();
  const target = reports.find((r) => r.id === id);
  if (!target?.encryptedAttachments) return;

  const atts = cipherToAttachments(target.encryptedAttachments, pin);
  await deleteAttachmentsFiles(atts);

  const next = reports.map((r) =>
    r.id === id
      ? {
          ...r,
          encryptedAttachments: undefined,
          lastSubmissionError: undefined,
        }
      : r
  );
  await saveStoredReports(next);
}

export async function syncQueuedItem(clientSubmissionId: string) {
  const pin = getSessionPin();
  if (!pin) {
    throw new Error("Missing session PIN");
  }

  if (inFlightClientSubmissionIds.has(clientSubmissionId)) {
    console.log("[SYNC] skip duplicate (in-flight)", { clientSubmissionId });
    return { status: "syncing" as const };
  }
  inFlightClientSubmissionIds.add(clientSubmissionId);

  const reports = await getReports();
  const report = reports.find((item) => item.id === clientSubmissionId);

  if (!report) {
    throw new Error("Item not found");
  }

  if (report.status !== "queued") {
    throw new Error("Only pending items can be synced");
  }

  if (!report.body?.trim()) {
    throw new Error("Report text is required");
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
    await updateSubmissionStatus(clientSubmissionId, "confirmed");
    pipelineStep = "local_cleanup";
    await clearLocalAttachmentsAfterSuccessfulSend(clientSubmissionId);
    const serverSubmissionId = serverReceipt.serverSubmissionId;
    console.log("[SYNC] purge: start", { clientSubmissionId, serverSubmissionId });

    // Defensive: only purge after confirmed server success. Retry once; on persistent failure,
    // write a minimal tombstone so it disappears from UI without retaining content.
    const confirmedAt = new Date().toISOString();
    let purge = await purgeSubmittedReportLocally({ clientSubmissionId, serverSubmissionId });
    if (!purge.ok) {
      console.warn("[SYNC] purge failed; retrying once", { clientSubmissionId });
      purge = await purgeSubmittedReportLocally({ clientSubmissionId, serverSubmissionId });
    }
    if (!purge.ok) {
      await addPurgeTombstone({
        clientSubmissionId,
        status: "purged",
        confirmedAt,
        serverSubmissionId,
      }).catch(() => {});
    }

    await updateSubmissionStatus(clientSubmissionId, "purged").catch(() => {});
    console.log("[SYNC] complete", { clientSubmissionId, status: "purged" });
    return { status: "purged" as const, serverSubmissionId, clientSubmissionId };
  } catch (error) {
    const message = formatSubmissionPipelineError(error);
    // Safe to log and store: attachment errors are codes with ids only, local URIs are
    // redacted, and upload messages have object paths removed.
    console.error("[SYNC] failed", { clientSubmissionId, stage: pipelineStep, message });

    if (uploadedStoragePaths.length) {
      console.log("[SYNC] rollback: deleting partial uploads", {
        clientSubmissionId,
        count: uploadedStoragePaths.length,
      });
      await deleteStoragePaths(uploadedStoragePaths);
    } else {
      console.log("[SYNC] rollback: no uploads", { clientSubmissionId });
    }

    await updateSubmissionStatus(clientSubmissionId, "failed");
    await persistLastSubmissionError(clientSubmissionId, message);
    throw error;
  } finally {
    inFlightClientSubmissionIds.delete(clientSubmissionId);
  }
}

/**
 * On startup, items left in "syncing" state mean the app was killed mid-sync.
 * Reset them to "queued" so they are retried — the in-flight Set is cleared on restart.
 */
async function resetStuckSyncingItems() {
  const stored = await getStoredReports();
  const hasStuck = stored.some((r) => r.submissionStatus === "syncing");
  if (!hasStuck) return;

  const next = stored.map((r) =>
    r.submissionStatus === "syncing" ? { ...r, submissionStatus: "queued" as SubmissionStatus } : r
  );
  await saveStoredReports(next);
  console.log("[SYNC] reset stuck syncing items to queued");
}

export async function syncPendingItems(reason: "startup" | "network_reconnect" | "manual") {
  if (reason === "startup") {
    await resetStuckSyncingItems();
  }

  const reports = await getReports();
  const targets = reports.filter(
    (r) => r.status === "queued" && (r.submissionStatus === "queued" || r.submissionStatus === "failed")
  );
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
