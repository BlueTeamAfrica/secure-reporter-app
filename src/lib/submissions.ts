import { encryptDraftText } from "./crypto/drafts";
import type { SubmittedAttachment } from "./attachments/types";
import type { ReporterFirestoreFields } from "../state/reporterProfile";

export type SubmissionPayload = {
  schemaVersion: 2;
  /** Stable client id; used for idempotency/retries. */
  clientSubmissionId: string;
  /** Per-attempt id; useful for attachment grouping and debugging. */
  attemptId: string;
  itemId: string;
  title: string;
  body: string;
  workflowStatus: "draft" | "ready" | "queued";
  createdAt: string;
  updatedAt: string;
  attachments: SubmittedAttachment[];
};

function asFirestoreAttachmentArray(attachments: SubmittedAttachment[]) {
  if (!attachments || attachments.length === 0) {
    return { arrayValue: {} };
  }
  return {
    arrayValue: {
      values: attachments.map((a) => ({
        mapValue: {
          fields: {
            id: { stringValue: a.id },
            name: { stringValue: a.name },
            mimeType: { stringValue: a.mimeType },
            size: { integerValue: String(a.size) },
            storagePath: { stringValue: a.storagePath },
            uploadedAt: { timestampValue: a.uploadedAt },
          },
        },
      })),
    },
  };
}

function requireEnv(name: string, value: string | undefined) {
  if (!value) {
    throw new Error(`Missing env: ${name}`);
  }
  return value;
}

export async function uploadEncryptedSubmission(
  payload: SubmissionPayload,
  secret: string,
  reporter: ReporterFirestoreFields
) {
  const projectId = requireEnv(
    "EXPO_PUBLIC_FIREBASE_PROJECT_ID",
    process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID
  );

  const apiKey = requireEnv(
    "EXPO_PUBLIC_FIREBASE_API_KEY",
    process.env.EXPO_PUBLIC_FIREBASE_API_KEY
  );

  const plainJson = JSON.stringify(payload);
  const encryptedPayload = encryptDraftText(plainJson, secret);
  const uploadedAt = new Date().toISOString();

  console.log("[SYNC:firestore] write preparing", {
    clientSubmissionId: payload.clientSubmissionId,
    itemId: payload.itemId,
    payloadAttachmentCount: payload.attachments.length,
  });

  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/submissions?key=${apiKey}`;

  const firestoreBody = {
    fields: {
      clientSubmissionId: { stringValue: payload.clientSubmissionId },
      attemptId: { stringValue: payload.attemptId },
      itemId: { stringValue: payload.itemId },
      workflowStatus: { stringValue: payload.workflowStatus },
      encryptedPayload: { stringValue: encryptedPayload },
      // Metadata-only attachment index for dashboards (no bytes, no signed URLs).
      attachments: asFirestoreAttachmentArray(payload.attachments ?? []),
      uploadedAt: { timestampValue: uploadedAt },
      createdAt: { stringValue: payload.createdAt },
      updatedAt: { stringValue: payload.updatedAt },
      payloadVersion: { integerValue: "2" },
      status: { stringValue: "received" },
      processingStatus: { stringValue: "new" },
      reviewedAt: { nullValue: null },
      reviewerNote: { stringValue: "" },
      reporterName: { stringValue: reporter.reporterName },
      reporterRegion: { stringValue: reporter.reporterRegion },
      reporterPhone: { stringValue: reporter.reporterPhone },
      reporterAlias: { stringValue: reporter.reporterAlias },
    },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(firestoreBody),
  });

  const text = await response.text();

  if (!response.ok) {
    // Do not log Firestore response bodies: they may echo sensitive fields back (including ciphertext).
    console.error("[SYNC:firestore] write FAILED", {
      status: response.status,
      clientSubmissionId: payload.clientSubmissionId,
      itemId: payload.itemId,
    });
    throw new Error(`Firestore REST write failed (${response.status})`);
  }

  let parsed: any = null;

  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }

  const firestoreId = typeof parsed?.name === "string" ? parsed.name : null;
  if (!firestoreId) {
    // Treat missing server receipt as ambiguous: caller must not purge locally.
    throw new Error("Server receipt missing (no Firestore document id returned)");
  }

  // If the server echoes fields back, validate the echoed clientSubmissionId when present.
  const echoedClientSubmissionId =
    typeof parsed?.fields?.clientSubmissionId?.stringValue === "string"
      ? parsed.fields.clientSubmissionId.stringValue
      : null;
  if (echoedClientSubmissionId && echoedClientSubmissionId !== payload.clientSubmissionId) {
    throw new Error("Server receipt clientSubmissionId mismatch");
  }

  console.log("[SYNC:firestore] write success", {
    serverSubmissionId: firestoreId,
    clientSubmissionId: payload.clientSubmissionId,
  });

  const createdFieldKeys =
    parsed && typeof parsed.fields === "object" && parsed.fields
      ? Object.keys(parsed.fields as Record<string, unknown>)
      : [];

  return {
    ok: true as const,
    clientSubmissionId: payload.clientSubmissionId,
    serverSubmissionId: firestoreId,
    createdFieldKeys,
  };
}
