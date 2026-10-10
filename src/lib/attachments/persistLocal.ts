import * as FileSystem from "expo-file-system/legacy";
import { DraftAttachment } from "./types";
import { sanitizeFileName } from "./fileNames";
import { getWorkingReport } from "../../state/editorDraft";
import { getReports } from "../../state/drafts";

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
}): Promise<string> {
  const dir = attachmentsRootDir();
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});

  const safe = sanitizeFileName(input.displayName);
  const dest = `${dir}${input.attachmentId}_${safe}`;

  await FileSystem.copyAsync({ from: input.sourceUri, to: dest });
  return dest;
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

/** Wipes all imported attachment bytes (e.g. device reset). Does not require the session PIN. */
export async function deleteAllImportedAttachments() {
  const base = FileSystem.documentDirectory;
  if (!base) return;
  const root = `${base}secure_reporter_attachments`;
  await FileSystem.deleteAsync(root, { idempotent: true }).catch(() => {});
}

/**
 * Best-effort forensic cleanup:
 * Deletes only orphaned imported attachment files that are not referenced by any actionable
 * local item (saved/pending/needs sync) nor the in-progress working buffer.
 *
 * Never deletes queued items or drafts; only deletes unattached bytes.
 */
export async function cleanupOrphanImportedAttachments() {
  const base = FileSystem.documentDirectory;
  if (!base) return;
  const dir = `${base}secure_reporter_attachments/`;

  const files = await FileSystem.readDirectoryAsync(dir).catch(() => []);
  if (!files.length) return;

  const referenced = new Set<string>();

  try {
    const reports = await getReports();
    for (const r of reports) {
      for (const att of r.attachments ?? []) {
        if (typeof att.localUri === "string" && att.localUri.startsWith("file:")) {
          referenced.add(att.localUri);
        }
      }
    }
  } catch {
    // ignore (e.g. locked/decoy mode)
  }

  try {
    const working = await getWorkingReport();
    for (const att of working?.attachments ?? []) {
      if (typeof att.localUri === "string" && att.localUri.startsWith("file:")) {
        referenced.add(att.localUri);
      }
    }
  } catch {
    // ignore
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
