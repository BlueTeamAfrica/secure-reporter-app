import { encryptDraftText } from "./crypto/drafts";
import type { SubmittedAttachment } from "./attachments/types";
import type { ReporterFirestoreFields } from "../state/reporterProfile";
import { interpretCreateResponse } from "./firestoreReceipt";

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

/**
 * Writes the submission as Firestore document `submissions/<submissionId>`. The id is random,
 * created once per item, so a re-send of the same item can't create a second document: the
 * server answers ALREADY_EXISTS, which counts as received (firestoreReceipt.ts).
 */
export async function uploadEncryptedSubmission(
  payload: SubmissionPayload,
  secret: string,
  reporter: ReporterFirestoreFields,
  submissionId: string
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

  const documentName = `projects/${projectId}/databases/(default)/documents/submissions/${submissionId}`;
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/submissions?documentId=${encodeURIComponent(submissionId)}&key=${apiKey}`;

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

  // Never log the response body: it may echo fields back (including ciphertext).
  const receipt = interpretCreateResponse(
    response.status,
    await response.text(),
    documentName,
    payload.clientSubmissionId
  );
  if (!receipt.received) {
    console.error("[SYNC:firestore] write not confirmed", {
      status: response.status,
      clientSubmissionId: payload.clientSubmissionId,
    });
    throw new Error(receipt.reason);
  }

  return {
    ok: true as const,
    clientSubmissionId: payload.clientSubmissionId,
    serverSubmissionId: receipt.serverSubmissionId,
    alreadyExisted: receipt.alreadyExisted,
  };
}
