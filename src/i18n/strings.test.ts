import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatWhen } from "./format.ts";
import { activeLanguage, fmt, TABLES, t } from "./strings.ts";

type Leaf = { path: string; value: string };

function leaves(node: unknown, path = ""): Leaf[] {
  if (typeof node === "string") return [{ path, value: node }];
  if (Array.isArray(node)) return node.flatMap((v, i) => leaves(v, `${path}[${i}]`));
  if (node && typeof node === "object") {
    return Object.entries(node).flatMap(([k, v]) => leaves(v, path ? `${path}.${k}` : k));
  }
  throw new Error(`unexpected value at ${path}`);
}

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

const en = leaves(TABLES.en);
const ar = leaves(TABLES.ar);

describe("strings", () => {
  it("English and Arabic have exactly the same keys", () => {
    assert.deepEqual(
      ar.map((l) => l.path),
      en.map((l) => l.path),
    );
  });

  it("every Arabic string has the same placeholders as its English one", () => {
    const enByPath = new Map(en.map((l) => [l.path, l.value]));
    for (const l of ar) assert.deepEqual(placeholders(l.value), placeholders(enByPath.get(l.path)!), l.path);
  });

  it("no visible string says encrypted, secure or report, in either language", () => {
    for (const l of en) assert.doesNotMatch(l.value, /encrypt|secur|report/i, l.path);
    for (const l of ar) assert.doesNotMatch(l.value, /تشفير|مشفر|مشفّر|آمن|أمان|أمني|تقرير|تقارير|بلاغ/, l.path);
  });

  it("digits are Western 0-9 only", () => {
    for (const l of [...en, ...ar]) assert.doesNotMatch(l.value, /[٠-٩۰-۹]/, l.path);
  });

  it("Arabic strings are in Arabic, except names that stay as they are", () => {
    const keepAsIs = new Set(["common.appName", "language.english"]);
    for (const l of ar) {
      if (keepAsIs.has(l.path)) continue;
      assert.match(l.value, /[؀-ۿ]/, l.path);
    }
  });

  it("the launcher name and overlay text is My Notes in both languages", () => {
    assert.equal(TABLES.en.common.appName, "My Notes");
    assert.equal(TABLES.ar.common.appName, "My Notes");
  });

  it("back arrows point the reading direction's way", () => {
    assert.match(TABLES.en.common.back, /^←/);
    assert.match(TABLES.ar.common.back, /^→/);
    assert.match(TABLES.en.cover.back, /^←/);
    assert.match(TABLES.ar.cover.back, /^→/);
  });

  it("sample notes are dull and the same count in both languages", () => {
    assert.ok(TABLES.en.cover.samples.length >= 3 && TABLES.en.cover.samples.length <= 4);
    assert.equal(TABLES.ar.cover.samples.length, TABLES.en.cover.samples.length);
    const text = [...TABLES.en.cover.samples, ...TABLES.ar.cover.samples].map((s) => s.title + s.body).join(" ");
    assert.doesNotMatch(text, /news|journal|source|witness|desk|send|خبر|أخبار|صحف|مصدر|شاهد|إرسال/i);
  });

  it("defaults to English and fills placeholders", () => {
    assert.equal(activeLanguage(), "en");
    assert.equal(t(), TABLES.en);
    assert.equal(fmt("Waiting: {count}. {x}", { count: 3 }), "Waiting: 3. {x}");
  });
});

describe("date display", () => {
  const now = new Date(2026, 10, 7, 15, 30);
  it("today, yesterday, this year and older, with Western digits", () => {
    assert.equal(formatWhen(new Date(2026, 10, 7, 9, 5), TABLES.en, now), "Today, 09:05");
    assert.equal(formatWhen(new Date(2026, 10, 6, 23, 59), TABLES.en, now), "Yesterday, 23:59");
    assert.equal(formatWhen(new Date(2026, 2, 1, 8, 0), TABLES.en, now), "1 Mar, 08:00");
    assert.equal(formatWhen(new Date(2025, 11, 31, 8, 0), TABLES.en, now), "31 Dec 2025");
    assert.equal(formatWhen(new Date(2026, 10, 7, 9, 5), TABLES.ar, now), "اليوم، 09:05");
    assert.equal(formatWhen(new Date(2026, 2, 1, 8, 0), TABLES.ar, now), "1 مارس، 08:00");
    assert.equal(formatWhen(new Date(2025, 0, 2), TABLES.ar, now), "2 يناير 2025");
  });

  it("yesterday across a month boundary, and invalid input", () => {
    const first = new Date(2026, 11, 1, 10, 0);
    assert.equal(formatWhen(new Date(2026, 10, 30, 22, 15), TABLES.en, first), "Yesterday, 22:15");
    assert.equal(formatWhen("not a date", TABLES.en, now), "");
  });
});
