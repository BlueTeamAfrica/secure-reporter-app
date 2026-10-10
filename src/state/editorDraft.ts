import AsyncStorage from "@react-native-async-storage/async-storage";
import { getSessionPin } from "./session";
import { encryptDraftText, decryptDraftText } from "../lib/crypto/drafts";
import type { DraftAttachment } from "../lib/attachments/types";
import { REPORTS_KEY, PURGE_TOMBSTONES_KEY, WORKING_REPORT_KEY } from "./storageKeys";

export type WorkingReport = {
  reportId?: string;
  title: string;
  body: string;
  attachments: DraftAttachment[];
  updatedAt: string;
};

type StoredWorkingReport = {
  reportId?: string;
  encryptedTitle: string;
  encryptedBody: string;
  encryptedAttachments?: string;
  updatedAt: string;
};

// WORKING_REPORT_KEY imported from storageKeys.ts
// Runtime-only snapshot of the current editor contents.
// Used to flush a final encrypted autosave right before an aggressive lock clears the real session PIN.
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
  // Best-effort: if we're already locked/decoy, getSessionPin() will be null and saveWorkingReport will throw.
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
// REPORTS_KEY, PURGE_TOMBSTONES_KEY imported from storageKeys.ts

async function isActionableReportId(reportId: string) {
  try {
    const tombstonesRaw = await AsyncStorage.getItem(PURGE_TOMBSTONES_KEY);
    if (tombstonesRaw) {
      const parsed: unknown = JSON.parse(tombstonesRaw);
      if (
        Array.isArray(parsed) &&
        parsed.some((t: any) => t && t.clientSubmissionId === reportId)
      ) {
        return false;
      }
    }
  } catch {
    // ignore
  }

  try {
    const reportsRaw = await AsyncStorage.getItem(REPORTS_KEY);
    if (!reportsRaw) return false;
    const parsed: unknown = JSON.parse(reportsRaw);
    if (!Array.isArray(parsed)) return false;
    return parsed.some((r: any) => r && r.id === reportId);
  } catch {
    return false;
  }
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

export async function saveWorkingReport(input: {
  reportId?: string;
  title: string;
  body: string;
  attachments?: DraftAttachment[];
}) {
  const pin = getSessionPin();
  if (!pin) {
    throw new Error("Missing session PIN");
  }

  const attachments = input.attachments ?? [];
  // Defensive: after confirmed delivery we intentionally purge the report locally.
  // Prevent autosave from re-materializing a purged/submitted report under the same reportId.
  const reportId =
    input.reportId && (await isActionableReportId(input.reportId)) ? input.reportId : undefined;

  const next: StoredWorkingReport = {
    reportId,
    encryptedTitle: encryptDraftText(input.title, pin),
    encryptedBody: encryptDraftText(input.body, pin),
    encryptedAttachments: attachmentsToCipher(attachments, pin),
    updatedAt: new Date().toISOString(),
  };

  await AsyncStorage.setItem(WORKING_REPORT_KEY, JSON.stringify(next));
}

export async function getWorkingReport(): Promise<WorkingReport | null> {
  const pin = getSessionPin();
  if (!pin) return null;

  const raw = await AsyncStorage.getItem(WORKING_REPORT_KEY);
  if (!raw) return null;

  try {
    const parsed: StoredWorkingReport = JSON.parse(raw);

    const title = decryptDraftText(parsed.encryptedTitle, pin);
    const body = decryptDraftText(parsed.encryptedBody, pin);
    const attachments = cipherToAttachments(parsed.encryptedAttachments, pin);

    if (title === "" && body === "" && attachments.length === 0) return null;

    return {
      reportId: parsed.reportId,
      title,
      body,
      attachments,
      updatedAt: parsed.updatedAt,
    };
  } catch {
    return null;
  }
}

export async function clearWorkingReport() {
  await AsyncStorage.removeItem(WORKING_REPORT_KEY);
}
