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
import type { SubmittedAttachment } from "./types";

/**
 * Direct upload to Supabase Storage (private bucket).
 */

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = base64Decode(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function uploadLocalFileToStorage(input: {
  localUri: string;
  mimeType: string;
  storagePath: string;
  fileName?: string;
  /** Alias for display name when building relay JSON `fileName`. */
  name?: string;
  attachmentId: string;
  originalName: string;
}): Promise<SubmittedAttachment> {
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

  const mimeType = input.mimeType || "application/octet-stream";

  const bytes = base64ToUint8Array(base64);
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

  if (error) {
    console.error("[SEND:supabase] upload failed", {
      attachmentId: input.attachmentId,
      message: error.message,
    });
    throw new Error(`Supabase Storage upload failed: ${error.message}`);
  }

  console.log("[SEND:supabase] upload success", { attachmentId: input.attachmentId, size: bytes.length });

  return {
    id: input.attachmentId,
    name: input.originalName,
    mimeType,
    size: bytes.length,
    storagePath: input.storagePath,
    downloadUrl: "",
    uploadedAt,
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
    console.warn("[SEND:supabase:rollback] remove failed (best-effort)", { message: error.message });
  } else {
    console.log("[SEND:supabase:rollback] remove ok");
  }
}
