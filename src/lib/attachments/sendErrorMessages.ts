/**
 * Send-error strings shown to the reporter, and the codes stored in their place.
 *
 * `lastSubmissionError` is stored as plain text in AsyncStorage, so nothing that can describe
 * report content (such as a file name) may be written there. Attachment errors are stored as
 * `<CODE>:<attachmentId>` and turned into text only at display time, using the name from the
 * report's decrypted attachment list.
 *
 * Single source for these strings so they can be translated later.
 */
export const SEND_ERROR_MESSAGES = {
  missingAttachmentNamed:
    "Attachment no longer on this device: {fileName}. Remove it or attach it again, then send.",
  missingAttachmentUnnamed:
    "An attachment is no longer on this device. Remove it or attach it again, then send.",
  attachmentReadFailedNamed:
    "Could not read attachment: {fileName}. Remove it or attach it again, then send.",
  attachmentReadFailedUnnamed:
    "Could not read an attachment on this device. Remove it or attach it again, then send.",
  /** `{reason}` is the storage service's message with object paths removed. */
  uploadFailed: "Supabase Storage upload failed: {reason}",
} as const;

const MISSING_ATTACHMENT_PREFIX = "MISSING_ATTACHMENT:";
const ATTACHMENT_READ_FAILED_PREFIX = "ATTACHMENT_READ_FAILED:";

/** Stored when the attachment's local file no longer exists. Contains no file name. */
export function missingAttachmentCode(attachmentId: string) {
  return `${MISSING_ATTACHMENT_PREFIX}${attachmentId}`;
}

/** Stored when the local file exists but could not be read. Contains no file name. */
export function attachmentReadFailedCode(attachmentId: string) {
  return `${ATTACHMENT_READ_FAILED_PREFIX}${attachmentId}`;
}

function withFileName(template: string, fileName: string) {
  return template.replace("{fileName}", () => fileName);
}

/**
 * Turns a stored `lastSubmissionError` into the text to display. Codes are resolved against the
 * report's decrypted attachments; any other stored text is returned unchanged.
 */
export function displaySubmissionError(
  stored: string,
  attachments: readonly { id: string; name: string }[]
): string {
  const lookupName = (prefix: string) => {
    const id = stored.slice(prefix.length);
    const name = attachments.find((a) => a.id === id)?.name?.trim();
    return name || null;
  };

  if (stored.startsWith(MISSING_ATTACHMENT_PREFIX)) {
    const name = lookupName(MISSING_ATTACHMENT_PREFIX);
    return name
      ? withFileName(SEND_ERROR_MESSAGES.missingAttachmentNamed, name)
      : SEND_ERROR_MESSAGES.missingAttachmentUnnamed;
  }

  if (stored.startsWith(ATTACHMENT_READ_FAILED_PREFIX)) {
    const name = lookupName(ATTACHMENT_READ_FAILED_PREFIX);
    return name
      ? withFileName(SEND_ERROR_MESSAGES.attachmentReadFailedNamed, name)
      : SEND_ERROR_MESSAGES.attachmentReadFailedUnnamed;
  }

  return stored;
}
