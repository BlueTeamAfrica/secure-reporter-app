/**
 * TEST-PHASE DIAGNOSTIC: review before wider release.
 *
 * Read-only counts of what is stored on this device, so a phone can be diagnosed remotely
 * without clearing data. It never returns titles, bodies, file names, PINs or hashes, and it
 * makes no writes and deletes nothing. It needs a real (non-cover) unlocked session.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import { decryptDraftText, encryptDraftText } from "../lib/crypto/drafts";
import { getSessionPin } from "./session";
import { getReports, type PurgeTombstone } from "./drafts";
import { getWorkingReport } from "./editorDraft";
import { PURGE_TOMBSTONES_KEY, REPORTS_KEY, WORKING_REPORT_KEY } from "./storageKeys";

type CipherState = "ok" | "empty" | "failed";

export type StorageDiagnostics = {
  reports: {
    /** false when draft_reports exists but is not a readable JSON list. */
    listReadable: boolean;
    stored: number;
    visibleToApp: number;
    hiddenTombstoned: number;
    hiddenDecryptFailed: number;
    hiddenEmptyTitleOrBody: number;
    hiddenUnknownShape: number;
    /** stored − visible − hidden counts above; should be 0. */
    unexplained: number;
    /** Visible to the app, but neither Home list shows this status combination. */
    notShownOnHome: number;
    /** Visible records whose attachment list failed to decrypt (they show no attachments). */
    attachmentListDecryptFailed: number;
  };
  /** All stored records, raw values as stored (before any read-time migration). */
  statusCounts: { status: string; submissionStatus: string; count: number }[];
  tombstones: {
    listReadable: boolean;
    count: number;
    newest: { confirmedAt: string; serverIdLast4: string }[];
  };
  workingDraft: {
    exists: boolean;
    /** "n/a" when no working draft is stored. */
    decrypts: "ok" | "empty" | "failed" | "n/a";
  };
  attachmentFiles: {
    inFolder: number;
    inFolderReferenced: number;
    inFolderUnreferenced: number;
    referencedMissing: number;
  };
};

const ATTACHMENTS_DIR_NAME = "secure_reporter_attachments/";

function classifyCipher(cipher: string, pin: string, emptyCipher: string): CipherState {
  // Today's scheme uses a fixed IV per PIN, so an encrypted empty string always produces the
  // same ciphertext. That tells "empty" apart from "failed to decrypt" exactly. Revisit when
  // the storage format changes.
  if (cipher === emptyCipher) return "empty";
  try {
    return decryptDraftText(cipher, pin) ? "ok" : "failed";
  } catch {
    return "failed";
  }
}

function attachmentListDecrypts(cipher: string, pin: string): boolean {
  try {
    return Array.isArray(JSON.parse(decryptDraftText(cipher, pin)));
  } catch {
    return false;
  }
}

async function readJsonList(key: string): Promise<{ readable: boolean; items: unknown[] }> {
  const raw = await AsyncStorage.getItem(key);
  if (raw === null) return { readable: true, items: [] };
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? { readable: true, items: parsed } : { readable: false, items: [] };
  } catch {
    return { readable: false, items: [] };
  }
}

function str(v: unknown): v is string {
  return typeof v === "string";
}

/** Mirrors the Active and Pending filters in app/home.tsx. */
function shownOnHome(status: string, submissionStatus: string): boolean {
  const active =
    status !== "queued" &&
    (submissionStatus === "not_submitted" ||
      submissionStatus === "failed" ||
      submissionStatus === "syncing");
  const outbox =
    status === "queued" &&
    (submissionStatus === "queued" || submissionStatus === "failed" || submissionStatus === "syncing");
  return active || outbox;
}

/** Returns null when there is no real unlocked session (locked or cover session). */
export async function getStorageDiagnostics(): Promise<StorageDiagnostics | null> {
  const pin = getSessionPin();
  if (!pin) return null;

  const emptyCipher = encryptDraftText("", pin);

  // Tombstones
  const tombList = await readJsonList(PURGE_TOMBSTONES_KEY);
  const tombstones = tombList.items.filter(
    (t): t is PurgeTombstone => !!t && typeof t === "object" && str((t as PurgeTombstone).clientSubmissionId)
  );
  const tombstonedIds = new Set(tombstones.map((t) => t.clientSubmissionId));
  const newest = [...tombstones]
    .sort((a, b) => String(b.confirmedAt ?? "").localeCompare(String(a.confirmedAt ?? "")))
    .slice(0, 5)
    .map((t) => ({
      confirmedAt: str(t.confirmedAt) ? t.confirmedAt : "?",
      serverIdLast4: str(t.serverSubmissionId) ? t.serverSubmissionId.slice(-4) : "?",
    }));

  // Stored reports, classified the same way getReports() decides what it can show.
  const reportList = await readJsonList(REPORTS_KEY);
  let hiddenTombstoned = 0;
  let hiddenDecryptFailed = 0;
  let hiddenEmptyTitleOrBody = 0;
  let hiddenUnknownShape = 0;
  let attachmentListDecryptFailed = 0;
  const statusMap = new Map<string, { status: string; submissionStatus: string; count: number }>();

  for (const item of reportList.items) {
    const r = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;

    const status = str(r.status) ? r.status : "(none)";
    const submissionStatus = str(r.submissionStatus) ? r.submissionStatus : "(none)";
    const key = `${status}|${submissionStatus}`;
    const entry = statusMap.get(key) ?? { status, submissionStatus, count: 0 };
    entry.count += 1;
    statusMap.set(key, entry);

    if (str(r.id) && tombstonedIds.has(r.id)) {
      hiddenTombstoned += 1;
      continue;
    }
    if (str(r.text)) continue; // legacy plain-text record: shown
    if (str(r.encryptedText)) {
      const s = classifyCipher(r.encryptedText, pin, emptyCipher);
      if (s === "failed") hiddenDecryptFailed += 1;
      else if (s === "empty") hiddenEmptyTitleOrBody += 1;
      continue;
    }
    if (str(r.encryptedTitle) && str(r.encryptedBody)) {
      const t = classifyCipher(r.encryptedTitle, pin, emptyCipher);
      const b = classifyCipher(r.encryptedBody, pin, emptyCipher);
      if (t === "failed" || b === "failed") hiddenDecryptFailed += 1;
      else if (t === "empty" || b === "empty") hiddenEmptyTitleOrBody += 1;
      else if (str(r.encryptedAttachments) && !attachmentListDecrypts(r.encryptedAttachments, pin)) {
        attachmentListDecryptFailed += 1;
      }
      continue;
    }
    hiddenUnknownShape += 1;
  }

  const visible = await getReports();
  const stored = reportList.items.length;
  const unexplained =
    stored - visible.length - hiddenTombstoned - hiddenDecryptFailed - hiddenEmptyTitleOrBody - hiddenUnknownShape;
  const notShownOnHome = visible.filter((r) => !shownOnHome(r.status, r.submissionStatus)).length;

  // Working draft
  const workingRaw = await AsyncStorage.getItem(WORKING_REPORT_KEY);
  let workingDecrypts: StorageDiagnostics["workingDraft"]["decrypts"] = "n/a";
  if (workingRaw !== null) {
    try {
      const w = JSON.parse(workingRaw) as Record<string, unknown>;
      if (!str(w.encryptedTitle) || !str(w.encryptedBody)) {
        workingDecrypts = "failed";
      } else {
        const t = classifyCipher(w.encryptedTitle, pin, emptyCipher);
        const b = classifyCipher(w.encryptedBody, pin, emptyCipher);
        workingDecrypts =
          t === "failed" || b === "failed" ? "failed" : t === "empty" && b === "empty" ? "empty" : "ok";
      }
    } catch {
      workingDecrypts = "failed";
    }
  }

  // Attachment files
  const referenced = new Set<string>();
  const addRef = (uri: unknown) => {
    if (str(uri) && uri.startsWith("file:")) referenced.add(uri);
  };
  for (const r of visible) for (const a of r.attachments ?? []) addRef(a.localUri);
  const working = await getWorkingReport();
  for (const a of working?.attachments ?? []) addRef(a.localUri);

  let inFolder = 0;
  let inFolderReferenced = 0;
  const base = FileSystem.documentDirectory;
  if (base) {
    const dir = `${base}${ATTACHMENTS_DIR_NAME}`;
    const names = await FileSystem.readDirectoryAsync(dir).catch(() => [] as string[]);
    inFolder = names.length;
    for (const name of names) {
      const uri = `${dir}${name}`;
      const fileUri = uri.startsWith("file:") ? uri : `file://${uri}`;
      if (referenced.has(uri) || referenced.has(fileUri)) inFolderReferenced += 1;
    }
  }

  let referencedMissing = 0;
  for (const uri of referenced) {
    const info = await FileSystem.getInfoAsync(uri).catch(() => null);
    if (!info || !info.exists) referencedMissing += 1;
  }

  return {
    reports: {
      listReadable: reportList.readable,
      stored,
      visibleToApp: visible.length,
      hiddenTombstoned,
      hiddenDecryptFailed,
      hiddenEmptyTitleOrBody,
      hiddenUnknownShape,
      unexplained,
      notShownOnHome,
      attachmentListDecryptFailed,
    },
    statusCounts: [...statusMap.values()].sort((a, b) => b.count - a.count),
    tombstones: { listReadable: tombList.readable, count: tombstones.length, newest },
    workingDraft: { exists: workingRaw !== null, decrypts: workingDecrypts },
    attachmentFiles: {
      inFolder,
      inFolderReferenced,
      inFolderUnreferenced: inFolder - inFolderReferenced,
      referencedMissing,
    },
  };
}
