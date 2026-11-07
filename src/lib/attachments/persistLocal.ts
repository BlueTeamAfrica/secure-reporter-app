import * as FileSystem from "expo-file-system/legacy";
import { DraftAttachment } from "./types";
import { attachmentFileName } from "./fileNames";
import { getWorkingReport, hasStoredWorkingReport } from "../../state/editorDraft";
import { countStoredActionableReports, getReports } from "../../state/drafts";
import { isRealSession } from "../../state/session";

function attachmentsRootDir() {
  const base = FileSystem.documentDirectory;
  if (!base) {
    throw new Error("Document directory is not available on this platform");
  }
  return `${base}secure_reporter_attachments/`;
}

/**
 * Copies a picked file into app-owned storage under documentDirectory.
 * Keeps a single durable copy; picker/cache URIs may be reclaimed by the OS.
 */
export async function importPickedFileToSandbox(input: {
  sourceUri: string;
  attachmentId: string;
  displayName: string;
  mimeType: string;
}): Promise<string> {
  const dir = attachmentsRootDir();
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});

  // No part of the original name on disk (S3); the name is kept, encrypted, in the item.
  const dest = `${dir}${attachmentFileName(input.attachmentId, input.displayName, input.mimeType)}`;

  await FileSystem.copyAsync({ from: input.sourceUri, to: dest });
  await deletePickerCacheCopy(input.sourceUri);
  return dest;
}

/** The system picker's own copy (cache/DocumentPicker/<random>.<ext>). */
function pickerCacheDir(): string | null {
  return FileSystem.cacheDirectory ? `${FileSystem.cacheDirectory}DocumentPicker/` : null;
}

/**
 * Deletes the picker's cache copy once the app has its own (S7). Only files inside the
 * picker's cache folder are ever touched, never the user's own files.
 */
export async function deletePickerCacheCopy(uri: string) {
  const dir = pickerCacheDir();
  if (!dir || !uri || !uri.startsWith(dir)) return;
  await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
}

/** Size in bytes of a local copy (0 if unknown). */
export async function localFileSize(uri: string): Promise<number> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists && !info.isDirectory && typeof info.size === "number" ? info.size : 0;
  } catch {
    return 0;
  }
}

export async function deleteLocalAttachmentFile(uri: string | undefined) {
  if (!uri || !uri.startsWith("file:")) return;
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    // Best-effort cleanup; temp/cache URIs may already be gone.
  }
}

export async function deleteAttachmentsFiles(attachments: DraftAttachment[]) {
  await Promise.all(attachments.map((a) => deleteLocalAttachmentFile(a.localUri)));
}

/**
 * Wipes all imported attachment bytes and the picker's cache copies (erase, legacy wipe).
 * Does not need the vault. Throws if a folder could not be removed (erase reports the step).
 */
export async function deleteAllImportedAttachments() {
  const base = FileSystem.documentDirectory;
  if (base) await FileSystem.deleteAsync(`${base}secure_reporter_attachments`, { idempotent: true });
  const picker = pickerCacheDir();
  if (picker) await FileSystem.deleteAsync(picker, { idempotent: true });
}

/**
 * Best-effort forensic cleanup:
 * Deletes only orphaned imported attachment files that are not referenced by any actionable
 * local item (saved/pending/needs sync) nor the in-progress working buffer.
 *
 * Never deletes queued items or drafts; only deletes unattached bytes.
 *
 * Fails closed: a file is deleted only when every stored item was read successfully and
 * none of them references it. Without an open real vault (locked, unlock screen, cover
 * session) references can't be read, so nothing is deleted. Must run BEFORE vault.lock().
 */
export async function cleanupOrphanImportedAttachments() {
  if (!isRealSession()) return;

  const base = FileSystem.documentDirectory;
  if (!base) return;
  const dir = `${base}secure_reporter_attachments/`;

  const files = await FileSystem.readDirectoryAsync(dir).catch(() => []);
  if (!files.length) return;

  const referenced = new Set<string>();

  try {
    const reports = await getReports();
    // getReports() returns [] if the list can't be read and drops records it won't show.
    // countStoredActionableReports() throws on a read failure. Either way a dropped record's
    // files would look orphaned, so skip cleanup entirely.
    if ((await countStoredActionableReports()) !== reports.length) {
      console.warn("[ATTACHMENT] cleanup skipped: some stored items could not be read");
      return;
    }
    for (const r of reports) {
      for (const att of r.attachments ?? []) {
        if (typeof att.localUri === "string" && att.localUri.startsWith("file:")) {
          referenced.add(att.localUri);
        }
      }
    }

    const working = await getWorkingReport();
    if (!working && (await hasStoredWorkingReport())) {
      console.warn("[ATTACHMENT] cleanup skipped: working draft could not be read");
      return;
    }
    for (const att of working?.attachments ?? []) {
      if (typeof att.localUri === "string" && att.localUri.startsWith("file:")) {
        referenced.add(att.localUri);
      }
    }
  } catch {
    console.warn("[ATTACHMENT] cleanup skipped: could not load references");
    return;
  }

  await Promise.all(
    files.map(async (name) => {
      const uri = `${dir}${name}`;
      const fileUri = uri.startsWith("file:") ? uri : `file://${uri}`;
      if (referenced.has(fileUri) || referenced.has(uri)) return;
      await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
    })
  );
}
