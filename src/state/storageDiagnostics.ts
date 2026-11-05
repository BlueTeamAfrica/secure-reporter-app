/**
 * TEST-PHASE DIAGNOSTIC: review before wider release.
 *
 * Read-only counts of what is stored on this device, so a phone can be diagnosed remotely
 * without clearing data. It never returns titles, bodies, file names, PINs or keys, and it
 * makes no writes and deletes nothing. It needs an open real vault.
 *
 * The vault encrypts each record (reports, tombstones, working) as a whole, so a record is
 * either readable or not; there is no per-item "failed to decrypt" any more.
 */
import * as FileSystem from "expo-file-system/legacy";

import { getVault } from "../lib/vault/expoStorage";
import { isRealSession } from "./session";
import { getReports, type PurgeTombstone } from "./drafts";
import { getWorkingReport } from "./editorDraft";

export type StorageDiagnostics = {
  reports: {
    /** false when the reports record exists but can't be read or isn't a list. */
    listReadable: boolean;
    stored: number;
    visibleToApp: number;
    hiddenTombstoned: number;
    hiddenEmptyTitleOrBody: number;
    hiddenUnknownShape: number;
    /** stored − visible − hidden counts above; should be 0. */
    unexplained: number;
    /** Visible to the app, but neither Home list shows this status combination. */
    notShownOnHome: number;
  };
  /** All stored records, raw values as stored. */
  statusCounts: { status: string; submissionStatus: string; count: number }[];
  tombstones: {
    listReadable: boolean;
    count: number;
    newest: { confirmedAt: string; serverIdLast4: string }[];
  };
  workingDraft: {
    exists: boolean;
    /** "n/a" when no working draft is stored. */
    readable: "ok" | "empty" | "failed" | "n/a";
  };
  attachmentFiles: {
    inFolder: number;
    inFolderReferenced: number;
    inFolderUnreferenced: number;
    referencedMissing: number;
  };
};

const ATTACHMENTS_DIR_NAME = "secure_reporter_attachments/";

type RecordName = "reports" | "tombstones" | "working";

async function readRecord(name: RecordName): Promise<{ readable: boolean; value: unknown }> {
  try {
    return { readable: true, value: await getVault().get(name) };
  } catch {
    return { readable: false, value: null };
  }
}

function readList(r: { readable: boolean; value: unknown }): { readable: boolean; items: unknown[] } {
  if (!r.readable) return { readable: false, items: [] };
  if (r.value === null) return { readable: true, items: [] };
  return Array.isArray(r.value) ? { readable: true, items: r.value } : { readable: false, items: [] };
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

/** Returns null when there is no open real vault (locked or cover session). */
export async function getStorageDiagnostics(): Promise<StorageDiagnostics | null> {
  if (!isRealSession()) return null;

  // Tombstones
  const tombList = readList(await readRecord("tombstones"));
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
  const reportList = readList(await readRecord("reports"));
  let hiddenTombstoned = 0;
  let hiddenEmptyTitleOrBody = 0;
  let hiddenUnknownShape = 0;
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
    if (!str(r.id) || !str(r.title) || !str(r.body)) {
      hiddenUnknownShape += 1;
      continue;
    }
    if (!r.title || !r.body) hiddenEmptyTitleOrBody += 1;
  }

  const visible = await getReports();
  const stored = reportList.items.length;
  const unexplained = stored - visible.length - hiddenTombstoned - hiddenEmptyTitleOrBody - hiddenUnknownShape;
  const notShownOnHome = visible.filter((r) => !shownOnHome(r.status, r.submissionStatus)).length;

  // Working draft
  const workingRecord = await readRecord("working");
  let workingReadable: StorageDiagnostics["workingDraft"]["readable"] = "n/a";
  const workingExists = !workingRecord.readable || workingRecord.value !== null;
  if (!workingRecord.readable) {
    workingReadable = "failed";
  } else if (workingRecord.value !== null) {
    const w = workingRecord.value as Record<string, unknown>;
    const empty =
      (!str(w?.title) || w.title === "") &&
      (!str(w?.body) || w.body === "") &&
      (!Array.isArray(w?.attachments) || w.attachments.length === 0);
    workingReadable = empty ? "empty" : "ok";
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
      hiddenEmptyTitleOrBody,
      hiddenUnknownShape,
      unexplained,
      notShownOnHome,
    },
    statusCounts: [...statusMap.values()].sort((a, b) => b.count - a.count),
    tombstones: { listReadable: tombList.readable, count: tombstones.length, newest },
    workingDraft: { exists: workingExists, readable: workingReadable },
    attachmentFiles: {
      inFolder,
      inFolderReferenced,
      inFolderUnreferenced: inFolder - inFolderReferenced,
      referencedMissing,
    },
  };
}
