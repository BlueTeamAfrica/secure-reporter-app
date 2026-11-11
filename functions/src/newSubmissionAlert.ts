/**
 * New-submission alert: when a reporter submission is created, notify the desk's active
 * owners and admins by in-app bell (notifications/{uid}/items) and by email (Resend).
 *
 * Mirrors the desk's existing notification paths (blueteam-secure-desk
 * app/_lib/server/notifications.ts):
 * - Recipients: `users` docs that are active (active trueish | status=="active" | enabled===true)
 *   with role owner or admin (legacy "managing_editor" counts as admin), the same set the desk's
 *   "designed" path derives from RBAC. Email from users/{uid}.email, Firebase Auth fallback.
 * - Bell document shape: type, caseId, caseRef, message, actorName, read, createdAt.
 *
 * Privacy: the bell item and the email carry fixed text only. No reporter name, title,
 * content, file names, document ID or reference code. Logs never carry names, emails, IDs
 * or content: only per-channel ok / SKIPPED / FAILED with counts and error codes.
 *
 * Idempotency: Firestore triggers are at-least-once. A guard doc keyed by the event ID is
 * created with `create()` (fails if it exists) before any notification goes out, and bell
 * items use a deterministic ID derived from the event ID, so a redelivered event writes nothing.
 *
 * Reads `submissions` only to receive the trigger; never reads or writes submission data.
 */
import { createHash } from "crypto";
import * as logger from "firebase-functions/logger";
import { defineSecret } from "firebase-functions/params";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

const RESEND_API_KEY = defineSecret("RESEND_API_KEY");

/** Same sender as the desk (blueteam-secure-desk app/_lib/server/sendEmail.ts). */
const SENDER = "notifications@desk.blueteamafrica.com";
const DESK_INCOMING_URL = "https://desk.blueteamafrica.com/dashboard?view=incoming";

const TYPE = "new_submission";
const BELL_PATH_PATTERN = "notifications/{uid}/items";
const GUARD_COLLECTION = "notificationEventGuards";

/** Owner + admin: the roles the desk's RBAC lets target the "designed" stage. */
const ELIGIBLE_ROLES = new Set(["owner", "admin"]);

const TEXT_AR = "عنصر جديد بانتظاركم على المكتب.";
const TEXT_EN = "A new item is waiting on the desk.";
const SUBJECT = "عنصر جديد على المكتب · New item on the desk";
const FOOTER = "Secure Desk";

function isTrueish(v: unknown): boolean {
  return v === true || v === "true";
}

/** Mirrors desk `isWorkspaceUserActive`. */
function isActive(d: Record<string, unknown>): boolean {
  return isTrueish(d.active) || d.status === "active" || d.enabled === true;
}

/** Mirrors desk `normalizeWorkspaceRole` for the roles this alert cares about. */
function normalizeRole(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const raw = v.trim().toLowerCase();
  if (raw === "managing_editor") return "admin";
  if (raw === "editor") return "reviewer";
  return raw || null;
}

function errorCode(e: unknown): string {
  return e && typeof e === "object" && "code" in e ? String((e as { code: unknown }).code) : "none";
}

/** Never let an address slip into logs through a provider error message. */
function redact(text: string): string {
  return text.replace(/[^\s@<>"']+@[^\s@<>"']+/g, "<redacted>");
}

function errorMessage(e: unknown): string {
  return redact(e instanceof Error ? e.message : String(e));
}

function shortHash(s: string): string {
  return createHash("sha256").update(s).digest("hex").slice(0, 32);
}

type Recipient = { uid: string; email: string | null };

async function findRecipients(): Promise<{ recipients: Recipient[]; activeUsers: number }> {
  const snap = await admin.firestore().collection("users").get();
  let activeUsers = 0;
  const recipients: Recipient[] = [];
  for (const doc of snap.docs) {
    const d = doc.data() as Record<string, unknown>;
    if (!isActive(d)) continue;
    activeUsers++;
    const role = normalizeRole(d.role);
    if (!role || !ELIGIBLE_ROLES.has(role)) continue;
    const email = typeof d.email === "string" && d.email.trim() ? d.email.trim() : null;
    recipients.push({ uid: doc.id, email });
  }
  await Promise.all(
    recipients.map(async (r) => {
      if (r.email) return;
      try {
        const u = await admin.auth().getUser(r.uid);
        if (u.email) r.email = u.email;
      } catch (e) {
        logger.warn(`newSubmissionAlert: auth_email_lookup FAILED code=${errorCode(e)}`);
      }
    }),
  );
  return { recipients, activeUsers };
}

async function writeBell(uid: string, itemId: string, projectId: string): Promise<void> {
  try {
    await admin
      .firestore()
      .collection("notifications")
      .doc(uid)
      .collection("items")
      .doc(itemId)
      .create({
        type: TYPE,
        caseId: "",
        caseRef: "",
        message: TEXT_AR,
        actorName: null,
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      });
    logger.info(`newSubmissionAlert: bell_write ok type=${TYPE} path=${BELL_PATH_PATTERN} project=${projectId}`);
  } catch (e) {
    const code = errorCode(e);
    // 6 = ALREADY_EXISTS: a redelivered event; the item is already there.
    if (code === "6" || code === "already-exists") {
      logger.warn(`newSubmissionAlert: bell_write SKIPPED type=${TYPE} reason=already_exists`);
      return;
    }
    logger.error(
      `newSubmissionAlert: bell_write FAILED type=${TYPE} path=${BELL_PATH_PATTERN} project=${projectId} code=${code} message=${errorMessage(e)}`,
    );
  }
}

function buildHtml(): string {
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Secure Desk</title></head>
<body style="margin:0;padding:0;background:#f5f4f0;font-family:system-ui,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f4f0;padding:40px 16px;">
  <tr><td align="center">
    <table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
      <tr><td style="background:#1a1a2e;padding:20px 28px;"><span style="color:#ffffff;font-size:15px;font-weight:700;letter-spacing:0.02em;">Secure Desk</span></td></tr>
      <tr><td style="padding:28px 28px 0;text-align:right;" dir="rtl" lang="ar">
        <p style="margin:0 0 8px;font-size:15px;color:#1a1a2e;line-height:1.6;">${TEXT_AR}</p>
      </td></tr>
      <tr><td style="padding:0 28px 0;text-align:left;" dir="ltr" lang="en">
        <p style="margin:0 0 24px;font-size:15px;color:#1a1a2e;line-height:1.6;">${TEXT_EN}</p>
      </td></tr>
      <tr><td style="padding:0 28px;text-align:center;">
        <a href="${DESK_INCOMING_URL}" style="display:inline-block;background:#1a1a2e;color:#ffffff;font-size:14px;font-weight:600;padding:10px 20px;border-radius:8px;text-decoration:none;">فتح المكتب · Open the desk</a>
      </td></tr>
      <tr><td style="padding:24px 28px;text-align:center;"><p style="margin:0;font-size:12px;color:#999;">${FOOTER}</p></td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

async function sendEmail(to: string | null, apiKey: string): Promise<void> {
  if (!to) {
    logger.warn(`newSubmissionAlert: email SKIPPED type=${TYPE} reason=no_recipient_email`);
    return;
  }
  if (!apiKey) {
    logger.warn(`newSubmissionAlert: email SKIPPED type=${TYPE} reason=no_api_key`);
    return;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: SENDER,
        to,
        subject: SUBJECT,
        text: `${TEXT_AR}\n\n${TEXT_EN}\n\n${DESK_INCOMING_URL}\n\n${FOOTER}`,
        html: buildHtml(),
      }),
    });
    if (res.ok) {
      logger.info(`newSubmissionAlert: email ok type=${TYPE}`);
      return;
    }
    let detail = "";
    try {
      const body = (await res.json()) as { name?: unknown; message?: unknown };
      detail = `name=${String(body.name ?? "unknown")} message=${redact(String(body.message ?? ""))}`;
    } catch {
      /* non-JSON error body */
    }
    logger.error(`newSubmissionAlert: email FAILED type=${TYPE} status=${res.status} ${detail}`.trim());
  } catch (e) {
    logger.error(`newSubmissionAlert: email FAILED type=${TYPE} code=${errorCode(e)} message=${errorMessage(e)}`);
  }
}

export const notifyNewSubmission = onDocumentCreated(
  {
    document: "submissions/{id}",
    // Must match the Firestore database location (sudanfcts-reporting: europe-west1).
    region: "europe-west1",
    secrets: [RESEND_API_KEY],
    retry: false,
    timeoutSeconds: 60,
    memory: "256MiB",
  },
  async (event) => {
    const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "unknown";
    const eventKey = shortHash(event.id);

    // Guard: claim this event once. A redelivery finds the guard doc and stops here.
    try {
      await admin
        .firestore()
        .collection(GUARD_COLLECTION)
        .doc(eventKey)
        .create({ type: TYPE, createdAt: FieldValue.serverTimestamp() });
    } catch (e) {
      const code = errorCode(e);
      if (code === "6" || code === "already-exists") {
        logger.warn(`newSubmissionAlert: SKIPPED reason=duplicate_event`);
        return;
      }
      // Guard unavailable: carry on; bell items are still deduplicated by their deterministic ID.
      logger.error(`newSubmissionAlert: guard FAILED code=${code} message=${errorMessage(e)}`);
    }

    let found: { recipients: Recipient[]; activeUsers: number };
    try {
      found = await findRecipients();
    } catch (e) {
      logger.error(`newSubmissionAlert: recipients FAILED code=${errorCode(e)} message=${errorMessage(e)} project=${projectId}`);
      return;
    }
    const { recipients, activeUsers } = found;
    if (recipients.length === 0) {
      logger.warn(
        `newSubmissionAlert: ZERO_RECIPIENTS activeUsers=${activeUsers} eligibleRoles=owner,admin project=${projectId}`,
      );
      return;
    }
    logger.info(
      `newSubmissionAlert: recipients=${recipients.length} withEmail=${recipients.filter((r) => r.email).length} project=${projectId}`,
    );

    const apiKey = RESEND_API_KEY.value().trim();
    await Promise.all(
      recipients.map(async (r) => {
        await writeBell(r.uid, `${TYPE}_${eventKey}`, projectId);
        await sendEmail(r.email, apiKey);
      }),
    );
  },
);
