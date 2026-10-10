export type AttachmentWorkflowStatus =
  | "local"
  | "queued"
  | "uploading"
  | "uploaded"
  | "failed";

/** Persisted with drafts / queue; file bytes live at `localUri` in app sandbox. */
export type DraftAttachment = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  localUri: string;
  status: AttachmentWorkflowStatus;
  createdAt: string;
  storagePath?: string;
  downloadUrl?: string;
  uploadError?: string;
};

/** Included inside the encrypted submission JSON after Storage upload succeeds. */
export type SubmittedAttachment = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  storagePath: string;
  /** Optional: when using private Storage, a signed URL can be generated later. */
  downloadUrl?: string;
  uploadedAt: string;
};
