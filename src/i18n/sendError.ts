/**
 * Display text for a stored send error, in the active language. Pure.
 *
 * The stored value (written by the send pipeline, unchanged) is either an attachment code
 * `<CODE>:<attachmentId>` or a technical message. Codes become plain wording with the file
 * name from the item's own attachment list; anything else becomes one plain message, so no
 * service names or technical text reach the screen.
 */
import { fmt, type Strings } from "./strings.ts";

const MISSING = "MISSING_ATTACHMENT:";
const UNREADABLE = "ATTACHMENT_READ_FAILED:";
const TOO_LARGE = "FILE_TOO_LARGE:";

export function displaySendError(
  stored: string,
  attachments: readonly { id: string; name: string }[],
  strings: Strings,
): string {
  const s = strings.sendError;
  const nameFor = (prefix: string) =>
    attachments.find((a) => a.id === stored.slice(prefix.length))?.name?.trim() || null;
  if (stored.startsWith(MISSING)) {
    const fileName = nameFor(MISSING);
    return fileName ? fmt(s.missingFileNamed, { fileName }) : s.missingFile;
  }
  if (stored.startsWith(UNREADABLE)) {
    const fileName = nameFor(UNREADABLE);
    return fileName ? fmt(s.unreadableFileNamed, { fileName }) : s.unreadableFile;
  }
  if (stored.startsWith(TOO_LARGE)) {
    const fileName = nameFor(TOO_LARGE);
    return fileName ? fmt(s.tooLargeNamed, { fileName }) : s.tooLarge;
  }
  return s.generic;
}
