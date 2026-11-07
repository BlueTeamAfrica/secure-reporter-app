import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { describe, it } from "node:test";

import { displaySendError } from "../i18n/sendError.ts";
import { TABLES } from "../i18n/strings.ts";
import { isSubmissionId, makeSubmissionId } from "../state/submissionIds.ts";
import { attachmentFileName, fileExtension, itemStoragePath } from "./attachments/fileNames.ts";
import { fileTooLargeCode } from "./attachments/sendErrorMessages.ts";
import { classifyStorageError } from "./attachments/storageErrors.ts";
import { interpretCreateResponse } from "./firestoreReceipt.ts";

const rnd = (n: number) => new Uint8Array(randomBytes(n));
const DOC = "projects/p/databases/(default)/documents/submissions/0123456789abcdef0123456789abcdef";

describe("submission id (S2)", () => {
  it("random, 32 hex, different every time; validator accepts only that shape", () => {
    const ids = new Set(Array.from({ length: 200 }, () => makeSubmissionId(rnd)));
    assert.equal(ids.size, 200);
    for (const id of ids) assert.ok(isSubmissionId(id));
    for (const bad of [undefined, "", "1731000000000", "ABCDEF0123456789ABCDEF0123456789", "x".repeat(32)]) {
      assert.equal(isSubmissionId(bad), false);
    }
  });

  it("refuses a broken random source", () => {
    assert.throws(() => makeSubmissionId(() => new Uint8Array(3)));
  });
});

describe("Firestore create: what counts as received (S2)", () => {
  it("201 with the expected document name: received", () => {
    const r = interpretCreateResponse(200, JSON.stringify({ name: DOC, fields: { clientSubmissionId: { stringValue: "c1" } } }), DOC, "c1");
    assert.deepEqual(r, { received: true, serverSubmissionId: DOC, alreadyExisted: false });
  });

  it("409 ALREADY_EXISTS (a re-send of the same item): received, not a second document", () => {
    const body = JSON.stringify({ error: { code: 409, status: "ALREADY_EXISTS", message: "Document already exists" } });
    assert.deepEqual(interpretCreateResponse(409, body, DOC, "c1"), { received: true, serverSubmissionId: DOC, alreadyExisted: true });
  });

  it("anything else is not received: permission denied, server error, odd bodies", () => {
    for (const [status, body] of [
      [403, JSON.stringify({ error: { status: "PERMISSION_DENIED" } })],
      [500, "oops"],
      [200, "not json"],
      [200, JSON.stringify({})],
      [200, JSON.stringify({ name: DOC.replace(/[0-9a-f]{32}$/, "f".repeat(32)) })],
      [200, JSON.stringify({ name: DOC, fields: { clientSubmissionId: { stringValue: "other" } } })],
    ] as const) {
      assert.equal(interpretCreateResponse(status, body, DOC, "c1").received, false, `${status} ${body}`);
    }
  });
});

describe("file names and paths: no original name on disk or in storage (S3, S10)", () => {
  it("Arabic and other names become <attachmentId>.<ext>", () => {
    assert.equal(attachmentFileName("a1", "صورة الاجتماع.JPG", "image/jpeg"), "a1.jpg");
    assert.equal(attachmentFileName("a2", "ملاحظات صوتية", "audio/mp4"), "a2.m4a");
    assert.equal(attachmentFileName("a3", "report final.docx", "application/octet-stream"), "a3.docx");
    assert.equal(attachmentFileName("a4", "", "application/x-unknown"), "a4.bin");
    assert.equal(fileExtension("archive.tar.gz", ""), "gz");
    assert.equal(fileExtension("weird.ext-too-long-123", "image/png"), "png");
  });

  it("the storage path is fixed per item and holds no part of the name", () => {
    const sid = makeSubmissionId(rnd);
    const p1 = itemStoragePath(sid, "a1", "صورة.jpg", "image/jpeg");
    const p2 = itemStoragePath(sid, "a1", "صورة.jpg", "image/jpeg");
    assert.equal(p1, `submissions/${sid}/attachments/a1.jpg`);
    assert.equal(p1, p2, "a retry reuses the same path");
    assert.doesNotMatch(p1, /[؀-ۿ]|صورة/);
  });
});

describe("storage upload errors (S10, S11)", () => {
  it("already stored by an earlier attempt", () => {
    assert.equal(classifyStorageError({ status: 409, statusCode: "409", message: "The resource already exists" }), "exists");
    assert.equal(classifyStorageError({ status: 400, statusCode: "Duplicate", message: "The resource already exists" }), "exists");
  });

  it("refused for size", () => {
    assert.equal(classifyStorageError({ status: 413, statusCode: "413", message: "Payload too large" }), "too_large");
    assert.equal(
      classifyStorageError({ status: 400, statusCode: "413", message: "The object exceeded the maximum allowed size" }),
      "too_large",
    );
  });

  it("anything else is an ordinary failure (retried later)", () => {
    for (const e of [{ status: 500, message: "timeout" }, { status: 403, message: "row-level security" }, null, "x"]) {
      assert.equal(classifyStorageError(e), "other");
    }
  });

  it("too large shows a specific message, not 'will be tried again', in both languages", () => {
    const files = [{ id: "f1", name: "تسجيل.m4a" }];
    for (const lang of ["en", "ar"] as const) {
      const msg = displaySendError(fileTooLargeCode("f1"), files, TABLES[lang]);
      assert.match(msg, /تسجيل\.m4a/);
      assert.notEqual(msg, TABLES[lang].sendError.generic);
      assert.equal(displaySendError(fileTooLargeCode("zz"), files, TABLES[lang]), TABLES[lang].sendError.tooLarge);
    }
  });
});
