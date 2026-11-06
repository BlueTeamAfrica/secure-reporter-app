import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  LANGUAGE_KEY,
  otherLanguage,
  parseLanguage,
  rtlFlagsFor,
} from "./languagePlan.ts";
import {
  LEGACY_ASYNC_KEYS,
  LEGACY_SECURE_MARKER_KEYS,
  LEGACY_SECURE_SHARED_KEYS,
} from "./legacyWipePlan.ts";

describe("language plan", () => {
  it("reads only the two known codes", () => {
    assert.equal(parseLanguage("ar"), "ar");
    assert.equal(parseLanguage("en"), "en");
    for (const bad of [null, undefined, "", "AR", "fr", '{"language":"ar"}']) {
      assert.equal(parseLanguage(bad), null);
    }
  });

  it("Arabic forces RTL", () => {
    assert.deepEqual(rtlFlagsFor("ar"), { allowRTL: true, forceRTL: true });
  });

  it("English turns off both flags, so an Arabic-language phone also goes LTR", () => {
    assert.deepEqual(rtlFlagsFor("en"), { allowRTL: false, forceRTL: false });
  });

  it("switches between the two languages", () => {
    assert.equal(otherLanguage("ar"), "en");
    assert.equal(otherLanguage("en"), "ar");
  });

  it("is not a key the legacy wipe deletes or treats as a marker", () => {
    const wiped: readonly string[] = [
      ...LEGACY_ASYNC_KEYS,
      ...LEGACY_SECURE_MARKER_KEYS,
      ...LEGACY_SECURE_SHARED_KEYS,
    ];
    assert.equal(wiped.includes(LANGUAGE_KEY), false);
  });
});

describe("update server guard", () => {
  const readJson = (path: string) =>
    JSON.parse(readFileSync(fileURLToPath(new URL(path, import.meta.url).href), "utf8"));

  it("app config keeps updates off, with no automatic checks and no update URL", () => {
    const { updates } = readJson("../../app.json").expo;
    assert.equal(updates.enabled, false);
    assert.equal(updates.checkAutomatically, "NEVER");
    assert.equal(updates.url, undefined);
  });

  it("no EAS build profile sets an update channel", () => {
    const { build } = readJson("../../eas.json");
    for (const profile of Object.values(build) as { channel?: string }[]) {
      assert.equal(profile.channel, undefined);
    }
  });
});
