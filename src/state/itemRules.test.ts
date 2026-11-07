import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { canSend, isSendTarget, toVisibleItem } from "./itemRules.ts";

const file = { id: "f1", name: "a.jpg", mimeType: "image/jpeg", size: 10, localUri: "file:///x", status: "local" };
const base = { createdAt: "2026-11-07T10:00:00.000Z", updatedAt: "2026-11-07T10:00:00.000Z", attachments: [] as unknown[] };

const KINDS = {
  "title only": { title: "Title", body: "", attachments: [] },
  "body only": { title: "", body: "Text", attachments: [] },
  "files only": { title: "", body: "", attachments: [file] },
  "title and body": { title: "Title", body: "Text", attachments: [] },
} as const;

describe("items: nothing is hidden", () => {
  for (const [kind, content] of Object.entries(KINDS)) {
    for (const [label, status, submissionStatus] of [
      ["unsent draft", "draft", "not_submitted"],
      ["waiting to send", "queued", "queued"],
      ["failed send", "queued", "failed"],
    ] as const) {
      it(`${kind}, ${label}: shown, with its content`, () => {
        const item = toVisibleItem({ id: "1", ...base, ...content, status, submissionStatus });
        assert.ok(item, "must be shown");
        assert.equal(item.title, content.title);
        assert.equal(item.body, content.body);
        assert.equal(item.attachments.length, content.attachments.length);
      });
    }
  }

  it("missing or wrong-typed fields don't hide an item", () => {
    const item = toVisibleItem({ id: "2", title: 5, body: null, status: "weird", submissionStatus: undefined });
    assert.ok(item);
    assert.deepEqual([item.title, item.body, item.status, item.submissionStatus], ["", "", "draft", "not_submitted"]);
    assert.deepEqual(item.attachments, []);
  });

  it("only a record that is not an item (no id) is skipped", () => {
    for (const bad of [null, undefined, "x", 3, {}, { id: 7 }, { id: "" }]) assert.equal(toVisibleItem(bad), null);
  });

  it("an old 'queued' record without a submission status counts as waiting", () => {
    assert.equal(toVisibleItem({ id: "3", body: "x", status: "queued" })!.submissionStatus, "queued");
  });
});

describe("items: what can be sent (body text or a file; title optional)", () => {
  it("body only and files only can be sent; title only and empty cannot", () => {
    assert.equal(canSend(KINDS["body only"]), true);
    assert.equal(canSend(KINDS["files only"]), true);
    assert.equal(canSend(KINDS["title and body"]), true);
    assert.equal(canSend(KINDS["title only"]), false);
    assert.equal(canSend({ title: "", body: "  \n ", attachments: [] }), false);
  });

  it("the send queue picks up every waiting kind, including body-only and files-only", () => {
    const none = new Set<string>();
    for (const content of Object.values(KINDS)) {
      const waiting = toVisibleItem({ id: "w", ...base, ...content, status: "queued", submissionStatus: "queued" })!;
      assert.equal(isSendTarget(waiting, none), true);
      const failed = toVisibleItem({ id: "f", ...base, ...content, status: "queued", submissionStatus: "failed" })!;
      assert.equal(isSendTarget(failed, none), true);
      const draft = toVisibleItem({ id: "d", ...base, ...content, status: "draft" })!;
      assert.equal(isSendTarget(draft, none), false, "unsent drafts are not sent");
    }
  });

  it("not picked up while sending, after a receipt is held, or once confirmed", () => {
    const item = (s: string) => toVisibleItem({ id: "x", body: "t", status: "queued", submissionStatus: s })!;
    assert.equal(isSendTarget(item("syncing"), new Set()), false);
    assert.equal(isSendTarget(item("confirmed"), new Set()), false);
    assert.equal(isSendTarget(item("queued"), new Set(["x"])), false);
  });
});

describe("orphan cleanup sees every item", () => {
  it("visible count equals stored count for all kinds, so cleanup is never skipped by a hidden draft", () => {
    const stored = Object.values(KINDS).map((c, i) => ({ id: String(i), ...base, ...c, status: "draft" }));
    assert.equal(stored.map(toVisibleItem).filter(Boolean).length, stored.length);
  });
});
