import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const path = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url).href);
const appJson = JSON.parse(readFileSync(path("app.json"), "utf8")).expo;

describe("build config guards", () => {
  it("S6: seven unneeded permissions are blocked; DETECT_SCREEN_CAPTURE stays (expo-screen-capture needs it on Android 14+)", () => {
    const blocked: string[] = appJson.android.blockedPermissions;
    for (const p of [
      "SYSTEM_ALERT_WINDOW",
      "USE_BIOMETRIC",
      "USE_FINGERPRINT",
      "READ_EXTERNAL_STORAGE",
      "WRITE_EXTERNAL_STORAGE",
      "READ_MEDIA_IMAGES",
      "VIBRATE",
    ]) {
      assert.ok(blocked.includes(`android.permission.${p}`), p);
    }
    assert.equal(blocked.includes("android.permission.DETECT_SCREEN_CAPTURE"), false);
    assert.equal(blocked.includes("android.permission.INTERNET"), false);
  });

  it("S5: console calls are removed from production bundles only", () => {
    const factory = createRequire(import.meta.url)(path("babel.config.js"));
    const config = factory({ cache: () => {} });
    assert.deepEqual(config.env.production.plugins, ["transform-remove-console"]);
    assert.equal(config.plugins, undefined, "development keeps console output");
  });
});

describe("build profiles and label", () => {
  const eas = JSON.parse(readFileSync(path("eas.json"), "utf8"));

  it("remote version source; preview and reporter auto-increment and build APKs", () => {
    assert.equal(eas.cli.appVersionSource, "remote");
    for (const name of ["preview", "reporter"]) {
      assert.equal(eas.build[name].autoIncrement, true, name);
      assert.equal(eas.build[name].android.buildType, "apk", name);
      assert.equal(eas.build[name].environment, "production", name);
    }
  });

  it("only the test profile sets the test-build flag", () => {
    assert.equal(eas.build.preview.env.EXPO_PUBLIC_TEST_BUILD, "1");
    assert.equal(eas.build.reporter.env?.EXPO_PUBLIC_TEST_BUILD, undefined);
    assert.equal(eas.build.production.env?.EXPO_PUBLIC_TEST_BUILD, undefined);
  });

  it("Settings shows 1.0.0 (versionCode)", async () => {
    const { versionLabel } = await import("./ui/versionLabel.ts");
    assert.equal(versionLabel("1.0.0", "12"), "1.0.0 (12)");
    assert.equal(versionLabel("1.0.0", null), "1.0.0");
    assert.equal(versionLabel(null, "3"), "1.0.0 (3)");
  });
});
