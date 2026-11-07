/**
 * TEST BUILDS ONLY. Diagnostics switch for screenshot blocking (FLAG_SECURE), to check the
 * recent-apps preview on a test build. Not saved: off again after a restart or reload.
 * Removed together with Diagnostics before the reporter's APK, where capture protection is
 * simply on (see docs/final-build-checklist.md).
 */
import * as ScreenCapture from "expo-screen-capture";

const KEY = "diagnostics";

export async function setScreenshotBlocking(on: boolean, isTestBuild: boolean): Promise<void> {
  if (!isTestBuild) throw new Error("Not available.");
  if (on) await ScreenCapture.preventScreenCaptureAsync(KEY);
  else await ScreenCapture.allowScreenCaptureAsync(KEY);
}
