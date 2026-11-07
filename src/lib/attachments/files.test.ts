import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { fileDescription, fileKind, formatFileSize } from "../../i18n/fileDisplay.ts";
import { TABLES } from "../../i18n/strings.ts";
import { isTooLarge, MAX_FILE_BYTES, MAX_FILE_MB } from "./limits.ts";

describe("20 MB per file (M3)", () => {
  it("up to and including 20 MB is accepted; anything above is refused; unknown size is measured later", () => {
    assert.equal(MAX_FILE_MB, 20);
    assert.equal(isTooLarge(MAX_FILE_BYTES), false);
    assert.equal(isTooLarge(MAX_FILE_BYTES + 1), true);
    assert.equal(isTooLarge(150 * 1024 * 1024), true);
    for (const unknown of [0, undefined, null]) assert.equal(isTooLarge(unknown), false);
  });

  it("the refusal message names the limit in both languages", () => {
    assert.match(TABLES.en.editor.fileTooBig, /\{limit\} MB/);
    assert.match(TABLES.ar.editor.fileTooBig, /\{limit\} ميغابايت/);
  });
});

describe("plain file type and size (S8)", () => {
  it("kinds from MIME type or extension, never the MIME string", () => {
    assert.equal(fileKind("image/heic", "x"), "image");
    assert.equal(fileKind("audio/mp4", "x"), "audio");
    assert.equal(fileKind("application/pdf", "x"), "pdf");
    assert.equal(fileKind("application/vnd.openxmlformats-officedocument.wordprocessingml.document", "x"), "document");
    assert.equal(fileKind("application/octet-stream", "notes.docx"), "document");
    assert.equal(fileKind("text/plain", "x"), "text");
    assert.equal(fileKind("application/zip", "a.zip"), "file");
  });

  it("sizes in KB/MB with Western digits, in both languages", () => {
    assert.equal(formatFileSize(500, TABLES.en), "1 KB");
    assert.equal(formatFileSize(850 * 1024, TABLES.en), "850 KB");
    assert.equal(formatFileSize(2.44 * 1024 * 1024, TABLES.en), "2.4 MB");
    assert.equal(formatFileSize(15 * 1024 * 1024, TABLES.ar), "15 ميغابايت");
    assert.equal(formatFileSize(0, TABLES.en), "");
  });

  it("descriptions contain no MIME strings", () => {
    const d = fileDescription("application/vnd.openxmlformats-officedocument.wordprocessingml.document", "a.docx", 120 * 1024, TABLES.ar);
    assert.equal(d, "مستند · 120 كيلوبايت");
    assert.doesNotMatch(fileDescription("audio/mp4", "x", 0, TABLES.en), /\//);
  });
});
