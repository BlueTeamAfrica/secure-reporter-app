# Final build checklist: the reporter's APK

The changes to make, and the checks to run, before building the APK the reporter installs. Do them on one branch, in one commit, after the last test build has passed its device tests.

## 1. Code changes

| # | Change | Where | Done when |
|---|---|---|---|
| 1 | **Turn capture protection on.** Uncomment `usePreventScreenCapture()` in `RootLayout` | `app/_layout.tsx` (the `// usePreventScreenCapture(); // TODO: re-enable before release` line) | The line is active. The lint warning "`usePreventScreenCapture` is defined but never used" is gone |
| 2 | **Remove Diagnostics.** Delete the screen | `app/settings/storage-check.tsx` | File gone |
| 3 | **Remove the Diagnostics-only tools:** "Simulate interrupted erase" and the screenshot-blocking switch, with their test | `src/diagnostics/` (whole folder) | Folder gone |
| 4 | **Remove the ways in from Settings:** the Diagnostics row and the 3-second hold on the title | `app/settings/index.tsx` (`IS_TEST_BUILD` blocks; the `onLongPress` on the title) | No `IS_TEST_BUILD` left in `app/settings/index.tsx` |
| 5 | Optional, same commit: remove modules only Diagnostics used, if nothing else imports them | `src/state/storageDiagnostics.ts`; `src/lib/vault/kdfBenchmark.ts` (+ test); `getLastUnlockDurationMs` in `src/state/device.ts` | `grep` finds no importers before deleting |

### Check after the changes

- `grep -rn "storage-check\|src/diagnostics\|simulateInterruptedErase\|setScreenshotBlocking\|IS_TEST_BUILD" app src` returns only `src/lib/env/testBuild.ts`, or nothing if you remove that too.
- `npm run test:vault`, `npx tsc --noEmit` and `npm run lint` all pass, with 0 lint warnings.

## 2. Build

- Profile: **`reporter`** in `eas.json`. It builds an APK with `environment: production`, no `EXPO_PUBLIC_TEST_BUILD`, and `autoIncrement` (remote version source).
- Command: `npx eas-cli build --platform android --profile reporter`.
- Do not use `production`: it builds an AAB, which can't be installed directly.
- Before building, in EAS: delete `EXPO_PUBLIC_ATTACHMENT_RELAY_BASE`, `EXPO_PUBLIC_ATTACHMENT_RELAY_KEY` and `XPO_PUBLIC_SUPABASE_ANON_KEY`. The build log's list of loaded variables should not show them.

## 3. Checks on the built APK, before handing it over

Download the APK and inspect the file itself, not the config. These are the same checks used on earlier builds (see `docs/reports/phase2b.md` §4).

| Check | Expected |
|---|---|
| Manifest: update metadata | `expo.modules.updates.ENABLED=false`, `EXPO_UPDATES_CHECK_ON_LAUNCH=NEVER`, no `EXPO_UPDATE_URL`, no runtime version |
| Manifest: permissions | Only `INTERNET`, `ACCESS_NETWORK_STATE`, `ACCESS_WIFI_STATE`, `DETECT_SCREEN_CAPTURE` and the app's own `DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`. **None of:** `SYSTEM_ALERT_WINDOW`, `USE_BIOMETRIC`, `USE_FINGERPRINT`, `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE`, `READ_MEDIA_IMAGES`, `VIBRATE` |
| Manifest: application | `allowBackup=false`, `supportsRtl=true`, not debuggable |
| Launcher name | `resources.arsc` contains "My Notes" and not "secure-reporter-app" |
| Fonts | `assets/fonts/Cairo_400Regular`, `500Medium`, `600SemiBold`, `700Bold` (`.ttf`) |
| Bundle: test-build features gone | The bundle does **not** contain "Storage counts and speed test", "Simulate interrupted erase" or "Screenshot blocking" |
| Bundle: no logging | The bundle contains none of `[SYNC]`, `[SEND:supabase]`, `[PURGE]`, `[panic]`, `[lock]`, `[session]`, `[supabase:env]`, `[ATTACHMENT]` |
| Bundle: app present | Contains "My Notes" and the Arabic strings (UTF-16) |
| Version | Settings shows `1.0.0 (N)`, where N is higher than every test build |

## 4. Checks on the phone (reporter build)

1. Install over nothing (fresh). The language screen appears.
2. Screenshot of any real screen: blocked. The recent-apps preview is blank, for both the real app and the notes app.
3. Settings: no Diagnostics row; holding the title does nothing.
4. A send with one photo reaches the editor's desk.
5. Panic (button and gesture) reaches the notes app; Back on the notes list leaves the app.

## 5. Hand-over

- Note the APK's build number (`1.0.0 (N)`) and the commit it was built from.
- Tag that commit `reporter-1.0.0-N`.
- Keep the APK link private; it is installable by anyone who has it.
