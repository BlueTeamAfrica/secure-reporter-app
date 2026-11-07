import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { coverBackAction } from "./coverBack.ts";
import { PRIVATE_TEXT_INPUT } from "./privateTextInput.ts";

const ROOT = fileURLToPath(new URL("../..", import.meta.url).href);

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return tsxFiles(p);
    return p.endsWith(".tsx") ? [p] : [];
  });
}

describe("notes app back button (M2)", () => {
  it("closes an open note; on the list it leaves the app, never goes back to another screen", () => {
    assert.equal(coverBackAction(true), "closeNote");
    assert.equal(coverBackAction(false), "leaveApp");
  });

  it("cover.tsx handles every hardware back press itself", () => {
    const src = readFileSync(join(ROOT, "app/cover.tsx"), "utf8");
    assert.match(src, /hardwareBackPress[\s\S]{0,200}coverBackAction[\s\S]{0,200}return true/);
    assert.doesNotMatch(src, /router\.back\(/);
  });
});

describe("text fields (S4)", () => {
  it("the shared props turn off autocorrect, spell check, autofill and suggestions", () => {
    assert.deepEqual(PRIVATE_TEXT_INPUT, {
      autoCorrect: false,
      spellCheck: false,
      autoComplete: "off",
      importantForAutofill: "no",
      textContentType: "none",
    });
  });

  it("every TextInput in the app uses them", () => {
    const files = [...tsxFiles(join(ROOT, "app")), ...tsxFiles(join(ROOT, "src"))];
    let count = 0;
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(/<TextInput\b([\s\S]*?)\/>/g)) {
        count++;
        assert.match(m[1], /\{\.\.\.PRIVATE_TEXT_INPUT\}/, `${f}: TextInput without PRIVATE_TEXT_INPUT`);
      }
    }
    assert.ok(count >= 5, `expected the app's text fields, found ${count}`);
  });
});
