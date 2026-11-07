import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { decode as base64Decode } from "base-64";
import { getSupabaseEnv } from "../env/supabaseEnv";
import { getSupabaseClient } from "../supabase/client";
import {
  assertLocalAttachmentReadable,
  isMissingLocalAttachmentError,
  missingLocalAttachmentError,
  normalizeLocalFileUri,
} from "./readLocalFileForUpload";
import { fileTooLargeCode, SEND_ERROR_MESSAGES } from "./sendErrorMessages";
import { classifyStorageError } from "./storageErrors";
import type { SubmittedAttachment } from "./types";

/**
 * Direct upload to Supabase Storage (private bucket), in two separate steps:
 * 1. readLocalAttachmentBytes: reads the file from the app sandbox. Only errors from this step
 *    can mean "the file is missing on this device".
 * 2. uploadAttachmentBytes: sends the bytes. Its errors are never treated as a missing local
 *    file, whatever their text says.
 */

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = base64Decode(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Remove object paths from any service message before it is logged or stored. */
function redactObjectPaths(message: string, storagePaths: string[]): string {
  let out = message;
  for (const path of storagePaths) {
    const objectName = path.split("/").pop() ?? "";
    for (const s of [path, objectName]) {
      if (s) out = out.split(s).join("[object]");
    }
  }
  return out;
}

export type LocalAttachmentBytes = {
  bytes: Uint8Array;
  mimeType: string;
};

/** Step 1: read the local file. Throws a missing-file error only when the file is not there. */
export async function readLocalAttachmentBytes(input: {
  localUri: string;
  mimeType: string;
}): Promise<LocalAttachmentBytes> {
  if (Platform.OS === "web") {
    throw new Error(
      "Supabase Storage upload is only supported on iOS and Android in this build."
    );
  }

  const trimmedLocal = (input.localUri ?? "").trim();
  if (!trimmedLocal) {
    throw missingLocalAttachmentError();
  }

  const readUri = normalizeLocalFileUri(trimmedLocal);
  await assertLocalAttachmentReadable(readUri);

  let base64: string;
  try {
    base64 = await FileSystem.readAsStringAsync(readUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
  } catch (e) {
    if (isMissingLocalAttachmentError(e)) {
      throw missingLocalAttachmentError();
    }
    throw e;
  }

  return {
    bytes: base64ToUint8Array(base64),
    mimeType: input.mimeType || "application/octet-stream",
  };
}

/**
 * Step 2: upload bytes already read from the device, to the item's fixed path.
 * - Already there (an earlier attempt of this item stored it): counts as uploaded, and
 *   `alreadyStored` tells the caller not to delete it on rollback.
 * - Refused for size: throws the FILE_TOO_LARGE code (retrying can't help).
 */
export async function uploadAttachmentBytes(input: {
  bytes: Uint8Array;
  mimeType: string;
  storagePath: string;
  attachmentId: string;
  originalName: string;
}): Promise<{ uploaded: SubmittedAttachment; alreadyStored: boolean }> {
  const { bytes, mimeType } = input;
  const { bucket } = getSupabaseEnv();
  const supabase = getSupabaseClient();

  // Avoid logging local URIs, filenames, or storage paths (they may contain sensitive identifiers).
  console.log("[SEND:supabase] upload", {
    attachmentId: input.attachmentId,
    mimeType,
    size: bytes.length,
    bucket,
  });

  const uploadedAt = new Date().toISOString();
  const { error } = await supabase.storage.from(bucket).upload(input.storagePath, bytes, {
    contentType: mimeType,
    upsert: false,
  });

  const kind = error ? classifyStorageError(error) : null;
  if (kind === "too_large") {
    console.warn("[SEND:supabase] upload refused: too large", { attachmentId: input.attachmentId, size: bytes.length });
    throw new Error(fileTooLargeCode(input.attachmentId));
  }
  if (error && kind !== "exists") {
    const reason = redactObjectPaths(error.message ?? "unknown error", [input.storagePath]);
    console.error("[SEND:supabase] upload failed", {
      attachmentId: input.attachmentId,
      message: reason,
    });
    throw new Error(SEND_ERROR_MESSAGES.uploadFailed.replace("{reason}", () => reason));
  }

  console.log("[SEND:supabase] upload success", { attachmentId: input.attachmentId, size: bytes.length, alreadyStored: kind === "exists" });

  return {
    uploaded: {
      id: input.attachmentId,
      name: input.originalName,
      mimeType,
      size: bytes.length,
      storagePath: input.storagePath,
      downloadUrl: "",
      uploadedAt,
    },
    alreadyStored: kind === "exists",
  };
}

export async function deleteStoragePaths(paths: string[]) {
  if (!paths.length) {
    console.log("[SEND:supabase:rollback] no Storage paths to delete");
    return;
  }

  const { bucket } = getSupabaseEnv();
  const supabase = getSupabaseClient();
  console.log("[SEND:supabase:rollback] remove", { count: paths.length, bucket });
  const { error } = await supabase.storage.from(bucket).remove(paths);
  if (error) {
    console.warn("[SEND:supabase:rollback] remove failed (best-effort)", {
      message: redactObjectPaths(error.message ?? "unknown error", paths),
    });
  } else {
    console.log("[SEND:supabase:rollback] remove ok");
  }
}
