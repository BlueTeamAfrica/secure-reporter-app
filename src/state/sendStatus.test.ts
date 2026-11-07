import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { displaySendError } from "../i18n/sendError.ts";
import { TABLES } from "../i18n/strings.ts";
import { missingAttachmentCode, attachmentReadFailedCode, SEND_ERROR_MESSAGES } from "../lib/attachments/sendErrorMessages.ts";
import { summarizeSent, syncOutcome } from "./sendStatus.ts";
import { isEmptyWorkingDraft } from "./workingDraftPlan.ts";

describe("last sent (from tombstones: count and time only)", () => {
  it("counts confirmed items and finds the latest time", () => {
    const s = summarizeSent([
      { clientSubmissionId: "a", status: "purged", confirmedAt: "2026-11-06T10:00:00.000Z", serverSubmissionId: "x" },
      { clientSubmissionId: "b", status: "purged", confirmedAt: "2026-11-07T09:30:00.000Z", serverSubmissionId: "y" },
    ]);
    assert.deepEqual(s, { count: 2, lastSentAt: "2026-11-07T09:30:00.000Z" });
  });

  it("handles nothing sent and malformed entries", () => {
    assert.deepEqual(summarizeSent(null), { count: 0, lastSentAt: null });
    assert.deepEqual(summarizeSent([{ confirmedAt: 3 }, null, "x", { confirmedAt: "nope" }]), { count: 0, lastSentAt: null });
  });
});

describe("manual Sync result", () => {
  const base = { online: true, waitingBefore: 2, waitingAfter: 0, sentBefore: 5, sentAfter: 7 };

  it("all sent", () => assert.deepEqual(syncOutcome(base), { kind: "sent", sent: 2 }));

  it("never claims success while an item is still waiting", () => {
    assert.deepEqual(syncOutcome({ ...base, waitingAfter: 2, sentAfter: 5 }), { kind: "failed", failed: 2 });
    assert.deepEqual(syncOutcome({ ...base, waitingAfter: 1, sentAfter: 6 }), { kind: "partial", sent: 1, failed: 1 });
    // Item still waiting but not marked failed (e.g. stuck while locking): still "not sent".
    assert.deepEqual(syncOutcome({ ...base, waitingBefore: 1, waitingAfter: 1, sentAfter: 5 }), { kind: "failed", failed: 1 });
  });

  it("offline and nothing waiting", () => {
    assert.deepEqual(syncOutcome({ ...base, online: false }), { kind: "offline" });
    assert.deepEqual(syncOutcome({ ...base, waitingBefore: 0 }), { kind: "nothing" });
  });

  it("an item that left the queue counts as sent even if its tombstone write failed", () => {
    assert.deepEqual(syncOutcome({ ...base, sentAfter: 5 }), { kind: "sent", sent: 2 });
  });
});

describe("send error display", () => {
  const files = [{ id: "f1", name: "photo.jpg" }];
  it("attachment codes become plain wording with the file name, in both languages", () => {
    assert.match(displaySendError(missingAttachmentCode("f1"), files, TABLES.en), /photo\.jpg/);
    assert.match(displaySendError(missingAttachmentCode("f1"), files, TABLES.ar), /photo\.jpg/);
    assert.equal(displaySendError(attachmentReadFailedCode("zz"), files, TABLES.en), TABLES.en.sendError.unreadableFile);
  });

  it("technical messages never reach the screen", () => {
    const stored = SEND_ERROR_MESSAGES.uploadFailed.replace("{reason}", "bucket not found");
    assert.equal(displaySendError(stored, files, TABLES.en), TABLES.en.sendError.generic);
    assert.equal(displaySendError("TypeError: Network request failed", [], TABLES.ar), TABLES.ar.sendError.generic);
  });
});

describe("save on exit (D4)", () => {
  it("an empty editor creates nothing; any text or file is kept", () => {
    assert.equal(isEmptyWorkingDraft({ title: "  ", body: "\n", attachments: [] }), true);
    assert.equal(isEmptyWorkingDraft({ title: "", body: "x", attachments: [] }), false);
    assert.equal(isEmptyWorkingDraft({ title: "", body: "", attachments: [{}] }), false);
  });
});
