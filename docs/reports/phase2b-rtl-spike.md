# Phase 2b: RTL reload spike

Date: 2026-11-06. Branch: `feat/rtl-spike`, code commit `75555ff`, on top of `main` at `21f2deb`.

**Status: built and statically checked. Nothing has been run on a device.**

- APK: https://expo.dev/artifacts/eas/nQ2ZGPrxvdzkityHal40vEY50GLwf7WxHsC7cqkwkSg.apk
- Build logs: https://expo.dev/accounts/blueteamafrica/projects/secure-reporter-app/builds/c19828cf-938f-4f61-831b-ac1317df2b62

## Step 1: merge

- Merged `fix/phase0-attachments`, `feat/vault`, `feat/vault-wiring` into `main`, in that order.
- The stack was linear, so all three were fast-forwards: no conflicts and no merge commits.
- `main` is `21f2deb`, the commit that `test-0.4-vault-wiring` points at.
- Checks on `main` before pushing: 47/47 tests, `tsc` clean, lint 0 errors and 2 existing warnings.
- Pushed `main` and tag `test-0.5-phase2a-passed`.
- Local `feat/vault` was 1 commit ahead of `origin/feat/vault`. That commit is now in `main`; the remote branch was not updated.

## Step 2: what changed

| File | Change |
|---|---|
| `src/state/languagePlan.ts` | Pure logic: language codes, RTL flags, storage key |
| `src/state/language.ts` | Reads the stored language; switch-and-reload sequence |
| `src/state/languagePlan.test.ts` | 7 new tests, including an update-config guard |
| `app/settings/index.tsx` | Row shown only when `IS_TEST_BUILD`; also shows saved language and layout direction |
| `app.json` | `expo-updates` plugin; `updates.enabled: false`; `checkAutomatically: "NEVER"` |
| `package.json`, `package-lock.json` | `expo-updates ~29.0.20` and its dependencies |

Not changed: vault, encryption, submission code, `app/_layout.tsx`.

Checks on the branch before the build: 54/54 tests, `tsc` clean, lint 0 errors and the same 2 warnings.

### Switch sequence

1. Save the working draft with `flushRuntimeWorkingReportSnapshotToStorage`, the function lock uses.
2. Store the language code (SecureStore key `app_language`). If this fails, stop with the session still open.
3. Clear the in-memory draft snapshot.
4. Apply `I18nManager.allowRTL` and `forceRTL`.
5. Call `endSession()`, which overwrites the data key.
6. Wait 200 ms, then call `Updates.reloadAsync()`.

If the reload fails, the session is already closed, so the row routes to `/unlock`.

### Decisions made during implementation

- **English turns off `allowRTL` as well as `forceRTL`.** React Native's `I18nUtil` lays out RTL when forced, or when allowed on a phone whose language is RTL. With `allowRTL` left on, an Arabic-language phone would stay RTL after choosing English.
- **`endSession()` was added before the reload.** You did not ask for it. Reloading would discard the JS memory anyway, but this overwrites the key first, as a lock does. It calls the existing function and changes no lock logic.
- **SecureStore holds the language,** following `randomize_keypad`. The key is not in the legacy wipe lists, and a test enforces that.
- **The 200 ms wait is a judgment call.** `forceRTL` gives no completion signal, and the reload runs on another native queue. It lowers the risk of a race but does not rule it out; test 7 is the check.

## expo-updates checks

Source reviewed: `expo-updates` 29.0.20. The installed Android source and `src/Updates.ts` are identical to what was read.

| Question | Result | Evidence |
|---|---|---|
| Does `reloadAsync` work with updates off? | Yes, by source | `DisabledUpdatesController.relaunchReactApplicationForModule` runs `RecreateReactContextProcedure`, which calls `reactHost.reload` |
| Is this path tested upstream? | Yes | The package's `updates-e2e-disabled.yml` flow includes `basic_reload.yml` |
| Is an update server contacted when disabled? | No path found | `ENABLED=false` returns `INVALID_NOT_ENABLED` before any URL is read, so `DisabledUpdatesController` is used. Its check, fetch and URL-override methods throw. `FileDownloader` and `expo-eas-client` are used only by the enabled and dev-launcher controllers |
| What runs at launch when disabled? | Local only | `NoDatabaseLauncher` uses the embedded bundle and a local error log |
| Does a development build behave differently? | Yes, not relevant here | `reloadAsync` throws under `__DEV__`, so the row only works in preview builds |

### Built APK (not only the generated project)

Read from the APK's binary `AndroidManifest.xml` and `assets/app.config`:

```
application supportsRtl = true
expo.modules.updates.ENABLED = false
expo.modules.updates.EXPO_UPDATES_CHECK_ON_LAUNCH = NEVER
expo.modules.updates.EXPO_UPDATES_LAUNCH_WAIT_MS = 0
EXPO_UPDATE_URL: absent
RUNTIME_VERSION: absent
app.config updates = {"enabled":false,"checkAutomatically":"NEVER"}
```

The JS bundle contains the string `u.expo.dev`. It comes from `expo-router/build/fork/extractPathFromURL.js`, which only compares it with the hostname of an incoming link. That file makes no network calls.

`src/state/languagePlan.test.ts` fails if `updates.enabled` changes, a `url` is added, or an EAS profile gains a `channel`.

## Alternative: `reloadAppAsync`

`expo` already exports `reloadAppAsync`. On Android it calls `reactDelegate.reload()` from `CoreModule`. It would need no new dependency, so no update code would ship in the app. It was not built or tested, because the brief asked for `expo-updates`, which passed its checks.

## Risks

1. **Update code ships in every build.** It is disabled by config rather than absent. `eas update:configure` could turn it on; the guard test would catch that only if tests are run.
2. **Last 1.5 seconds of typing can be lost.** Existing behaviour, not caused by this work. In `app/report/new.tsx`, leaving the editor cancels the 1.5 s autosave timer and clears the snapshot. Lock does not hit this, because the editor is still open when it saves. Not fixed (out of scope).
3. **The flush cannot protect an open editor here.** Settings can't be reached from the editor, so the snapshot is normally already cleared. What survives the switch is the last autosave. Tests must wait 2 seconds before leaving the editor.
4. **A failed draft save does not stop the reload.** The flush function swallows errors. Lock has the same behaviour.
5. **Panic during a switch lands on the PIN screen, not the cover.** The window is short: the flush, the 200 ms wait and the reload. The device is still locked afterwards. Test builds only for now.
6. **Native modules across a reload are untested:** `react-native-quick-crypto` and Nitro, Reanimated and worklets, the splash screen. A native scrypt failure would fall back to the noble implementation, so unlock would still work but slower. The Diagnostics row shows which is in use.
7. **The language choice is visible without the PIN.** The code is in SecureStore, and React Native stores the RTL flag in plain SharedPreferences. It reveals only the language, and the layout shows that anyway.
8. **This APK uses the `production` EAS environment.** Test submissions may reach the production backend.
9. **Arabic-language phones may already get RTL.** `supportsRtl` is on and `allowRTL` defaults to true, so a phone set to Arabic goes RTL before any choice is made, including in current builds. Not confirmed on a device.

## Expected RTL layout findings (from reading code, to confirm on device)

Listed only, not fixed.

| Where | Expected problem |
|---|---|
| `src/components/PinPad.tsx:126,136` | Keypad rows mirror: `3 2 1` instead of `1 2 3`. The bottom row swaps backspace and submit. **This affects muscle memory for a PIN entered under duress** |
| `app/settings/index.tsx`, `app/settings/storage-check.tsx` | The `← Back` arrow points the wrong way for RTL |
| `app/report/review.tsx:150` | The `→` in "Settings → Workspace profile" points the wrong way |
| `app/report/new.tsx`, `app/home.tsx`, `app/unlock.tsx` | `flexDirection: "row"` layouts mirror; check each one |
| Poppins text | No Arabic translations or font in this spike, so English text is shown in an RTL layout |

Should be unaffected: the panic zone (centred) and the privacy overlay. `marginRight` and `paddingRight` flip automatically in RTL.

## Device test plan

Setup: install the APK. Set up a real PIN and a cover PIN if needed. Before test 3, create a draft: **New Note, type a title and text, wait 2 seconds, go back to Home.** Then go to Settings. The test row is at the bottom of the list: "Switch to Arabic".

| # | Steps | Pass |
|---|---|---|
| 1 | Tap "Switch to Arabic" | The app reloads by itself; the layout is mirrored |
| 2 | Look at the first screen after the reload | PIN screen, with nothing unlocked behind it or flashing past |
| 3 | Enter the real PIN; on Home, reopen the draft | Real app opens; title and text intact |
| 4 | Lock, then enter the cover PIN | Cover opens, in RTL |
| 5 | Force close, reopen, unlock, open Settings | Row says "Saved: Arabic. Layout: RTL" |
| 6 | Tap "Switch to English" | Reloads to the PIN screen; after unlock, LTR and "Saved: English. Layout: LTR" |
| 7 | Repeat the switch 5 times quickly, tapping the row more than once each time | No crash or stuck screen; final layout matches the saved language |

Also worth recording:
- Panic gesture in RTL after a reload: it should reach the cover.
- Unlock time and the Diagnostics scrypt row after a reload, compared with before.
- A "Saved" value that disagrees with "Layout" in the row: that means the flag race happened.
- Network: run a capture such as PCAPdroid across launch and a switch. No requests should go to `u.expo.dev` or `exp.host`.

## Not verified

- Anything at runtime: all 7 tests, RTL rendering, the reload itself.
- Absence of update traffic at runtime. This rests on source review and the built manifest, not a network capture.
- iOS. The plugin writes iOS config too, but no iOS source or build was reviewed.
- Whether `reloadAppAsync` would work.
