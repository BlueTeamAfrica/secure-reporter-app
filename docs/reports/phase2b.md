# Phase 2b

Date: 2026-11-07. Branch: `feat/phase2b`, pushed. Build commit: `833faab`, tagged `test-0.6-phase2b`.

**Status: built and checked statically. Nothing has been run on a device.**

Checks on the final commit: 108/108 tests (54 before this phase), `tsc` clean, lint 0 errors and 1 warning (`usePreventScreenCapture` unused, because capture protection stays off as you asked).

## 1. Stages

Each stage was committed and tagged, with tests, `tsc` and lint passing.

| Tag | Commit | Contents |
|---|---|---|
| `phase2b-s1-checkpin` | `11683d6` | D1: `vault.checkPin`; `pinAttempts.guardedPinAttempt`; lockout rule moved to `lockoutPolicy.ts` unchanged |
| `phase2b-s2-strings` | `3d24365` | One strings file (en/ar); Cairo embedded; Western-digit dates; status bar; keypad left-to-right (D5) |
| `phase2b-s3-band` | `b2ba95c` | Top band with Notes button and gesture zone (items 3, 4); overlay text "My Notes" (D3) |
| `phase2b-s4-language` | `268c356` | Language as the first setup screen; real Settings item (item 1) |
| `phase2b-s5-cover` | `31646ce` | Cover notes app; samples on first open, once (item 5) |
| `phase2b-s6-settings` | `e345cc3` | Change both codes, erase everything, name-only profile (item 6, D2) |
| `phase2b-s7-home` | `59e1930` | Send status, real Sync result, Send button (D6), save on exit (D4), cleanup |
| `phase2b-s8-guide` | `8ff5c3f` | Two-screen first-run guide (item 8) |
| `phase2b-s9-launcher` | `833faab` | "My Notes", notepad icon, `docs/arabic-review.md`, relay cleanup |

Full diff: `git diff 2787c76..test-0.6-phase2b`. Size: 53 files, +3184 / −981.

## 2. What changed, by decision and item

### D1: `checkPin`, the only vault change

`checkPin(kind, pin)` works only inside a real session:
- runs one scrypt, and checks the real slot (comparing it with the open key) or the cover slot;
- zeroes the stretched PIN, any unwrapped key and the device secret;
- never sets or clears the session.

`guardedPinAttempt` decides what to do with the answer:
- during a lockout, it checks nothing (no scrypt);
- a wrong code calls the PIN screen's own `recordFailedAttempt`;
- a right code resets the counter.

The rule itself (3 wrong = 10 s, 5 = 60 s) moved from `device.ts` into `lockoutPolicy.ts`, unchanged, so it can be tested.

Tests, covering all three requirements:

| Requirement | Tests |
|---|---|
| Counts toward the lockout | The 3rd wrong try starts the delay; the 5th starts the long cooldown; nothing is checked while locked out |
| Clears the derived key | Every scrypt output is all zeros after the check, for right, wrong and cross-kind codes |
| Session untouched | Same kind and same key afterwards; data still readable; a `lock()` mid-check wins |

### D2: name only

- The profile has one Name field. Region, phone and alias are saved and sent as `""`.
- `submissions.ts` and the field set are unchanged.
- **Desk check, done by reading its code; the desk has no tests and no installed dependencies, so nothing was run:**
  - `caseWorkspaceModel.str()` and `getSubmissionDisplay.clean()` turn `""` into `null`.
  - Every place that shows them is null-safe: the detail panel shows "Region: —", the phone and alias rows are hidden, the item card hides the region, the DOCX export skips them.
  - `firestore.rules` has `allow create: if true` and no field checks.
  - Nothing else in the desk reads these fields.
  - So a blank submission raises no error. The desk was not changed.

### D3: overlay text

The privacy overlay in `_layout.tsx` now shows "My Notes". This is a text-only change.

### D4: save on leaving the editor

- Leaving the editor runs `saveRuntimeSnapshotOnExit`, which writes what was typed to the working draft.
- An empty editor creates nothing (`isEmptyWorkingDraft`, tested).
- After an explicit Save or Send, a flag stops later renders and the exit save from bringing the cleared draft back as "Continue writing".

### D5: keypad layout

The keypad rows, dots and digits use `direction: "ltr"` in both languages. Messages keep the language's direction.

### D6: Send button. Correction to my plan: there was no Preview step

No screen in the app opens `/report/review`. The editor itself had Save, Make ready and Add to pending. So the one Send button went into the editor:
1. the existing `persist("ready")`;
2. the existing `updateReportStatus(id, "queued")`;
3. return to Home with `send=1`, where Home runs the existing `syncPendingItems` and shows the result.

The editor now has only Save draft and Send. No queue or submission code changed. The unreachable review, upload and success screens are only translated.

### Item 1: language

- First launch: `/setup` opens with two large buttons, العربية and English. It reloads only when the layout direction must change (`needsReload`, tested); for example, English on an Arabic-language phone does need a reload.
- Settings → Language warns, then calls the spike's `switchLanguageAndReload`: it saves the draft the way lock does, closes the session and reloads to the PIN screen.
- Strings: `src/i18n/strings.ts`. Tests enforce identical keys and placeholders in both languages, no banned words in either, and Western digits only.
- Fonts:
  - Cairo is embedded with the `expo-font` plugin. The scratch prebuild showed the four `.ttf` files in `assets/fonts`.
  - `lh()` gives Arabic 1.3× line height wherever a screen sets one.
- Arrows come from the strings file, so they flip with the language.
- Dates use a pure formatter that doesn't depend on `Intl`.
- Status bar: `androidStatusBar.barStyle: dark-content` and `expo-system-ui` (light). The prebuild theme has `windowLightStatusBar=true`.

### Items 3 and 4: Notes button and gesture zone

- Real screens render below a fixed band, at least 72dp tall (status inset + 56dp). The band holds only:
  - the Notes button: 72×48dp, at the logical start edge;
  - the gesture zone: centred, `min(220, width − 176)`, so 184dp on a 360dp phone and 144dp on 320dp.
- The button calls `handlePanicMode` → `panicNow`, the same path as the gesture, which saves the draft first. It also dismisses the keyboard.
- The band sits at the top, so the keyboard can't cover it, and it's far from Send at the bottom of the editor.
- The band is not shown on `/`, `/setup`, `/unlock` or `/cover`.
- **Narrow phones and the Arabic label:** the font files give an upper bound of 48.5dp for «ملاحظات» at 12sp in Cairo 600 (35.1dp for "Notes" in Poppins). That's 63dp at 1.3× font scale, inside the 64dp label area. This is why the button is 72dp wide rather than the 64dp first planned. Tested widths: 280–600dp, insets 0–48, LTR and RTL, with at least an 8dp gap between button and zone.
- Lock, panic and routing logic in `_layout.tsx` are unchanged.

### Item 5: cover notes

- `/cover` has a list, plus new, edit and delete; it saves while typing; the editor is a state of the same route.
- There is no Settings, language switch or way back.
- Samples (4 dull notes in the chosen language) are added by `openCoverNotes` after the cover screen renders, so panic isn't slowed:
  - only while the record is null, in one `vault.update`;
  - they never exist after setup alone;
  - tests cover opening by cover PIN or by panic, reopening, deleting every note, an interrupted first open, two opens at once, and the real vault being refused.
- Each note's time is set 9, 47, 133 and 318 minutes before the first open, so they don't look created together.

### Item 6: Settings

Language, change code, change second code, name, shuffle keypad, erase everything, and Diagnostics in test builds.

**Change code:**
1. Current code, checked with `checkPinInSession` and counted toward the lockout.
2. New code, twice.
3. The vault refuses a code equal to the other one (`PINS_NOT_DISTINCT`).
There is no recovery.

**Erase everything:**
- Shows a warning, then asks for the real code. The second code counts as a wrong try and erases nothing (tested).
- Removes both vaults (device secret first), the queue (in the vault), all local files, the counters, keypad and language settings.
- Restores the fresh-install RTL flags and reloads to first launch.
- Every step runs even if one fails.

### Item 7: send status

- When items are waiting, Home says: "Waiting: n. They are sent when you are online with the app open on this screen."
- "Last sent" is read from the vault's existing tombstones: the count and time only, and nothing new is stored.
- "Sent." is shown after any sync that delivered something.
- There is one empty state.
- The manual Sync result comes from `syncOutcome` (tested). Anything still waiting afterwards counts as not sent, so it can never claim success while an item waits. Results: Sent / Not sent: n, still waiting / some sent, some not / No connection / Nothing waiting. Items stay waiting.

### Item 8: guide

Two screens after the first name save: two codes and the Notes button, then getting back and sending.

### Item 2: launcher name and wording

- `expo.name` is "My Notes". Slug, package ID and scheme are unchanged.
- The icon is a plain notepad, generated by a script kept outside the repo, for the launcher, adaptive, monochrome and splash images.
- `docs/arabic-review.md` lists 194 rows, generated from the strings file.

### Item 9: cleanup

| Item | Result |
|---|---|
| Unused `error` (`home.tsx:552`) | Removed; it hid nothing, as found in the plan |
| Manual Sync always said "Up to date" | Fixed (item 7) |
| Raw send errors on screen | Shown in plain words in both languages (`displaySendError`) |
| Relay | `attachmentRelayEnv.ts` deleted (no importers); both variables removed from `.env.local` |
| Draft text in route params | Home no longer passes draft title and body |

**EAS variables for you to delete:** `EXPO_PUBLIC_ATTACHMENT_RELAY_BASE`, `EXPO_PUBLIC_ATTACHMENT_RELAY_KEY`, and the typo `XPO_PUBLIC_SUPABASE_ANON_KEY`.

**Autosave answer:**
- **Lock or panic:** typed text is saved. Both flush the snapshot, which the editor updates on every keystroke.
- **Language switch:** saves what autosave or the exit save already wrote.
- **Leaving the editor:** now saved too (D4).

## 3. Not done or left as is

- **Diagnostics stays in English.** It's kept for test builds, as you asked, so `storage-check.tsx` text isn't in the strings file.
- **The `receipts` stub still shows "Receipts Screen"**, but only through a deep link. Removing it would need a line removed from `_layout.tsx`.
- **`CLAUDE.md`** is still out of date.

## 4. Built APK checks

- APK: https://expo.dev/artifacts/eas/SyHuoBBzUDHiAY6zP9oP9cs1DfgmHNR6kCTUR98h-EI.apk
- Build logs: https://expo.dev/accounts/blueteamafrica/projects/secure-reporter-app/builds/cf79de69-1df5-4097-9865-f6f80de67b67

Read from the APK itself (binary manifest, `resources.arsc`, `assets/`, Hermes bundle), not only the config:

| Check | Result |
|---|---|
| Update URL | **None.** No `EXPO_UPDATE_URL` and no runtime version in the manifest; `app.config` has no `updates.url` |
| Automatic update checks | **Off.** `expo.modules.updates.ENABLED=false`, `EXPO_UPDATES_CHECK_ON_LAUNCH=NEVER` |
| Launcher name | **"My Notes".** The application label points at a resource string; `resources.arsc` contains "My Notes" and not the old name. `app.config` `name` is "My Notes"; slug and package are unchanged |
| RTL | `supportsRtl=true`; `allowBackup=false` |
| Cairo | `assets/fonts/Cairo_400Regular`, `500Medium`, `600SemiBold`, `700Bold` (`.ttf`) |
| Capture protection | **Still off.** `usePreventScreenCapture()` is commented out in `_layout.tsx` at `test-0.6-phase2b` |
| Diagnostics | **Present.** "Storage counts and speed test" is in the bundle (test-build row) |
| Arabic strings | In the bundle (Hermes stores them as UTF-16) |
| Other strings in the bundle | "Protected" is only part of a React internal name (`isProtectedReactElement`). `u.expo.dev` comes from expo-router's link parser (comparison only). `checkForUpdateAsync` is expo-updates' unused JS API |

**Still loaded from EAS:** the relay variables are in the build log (`EXPO_PUBLIC_ATTACHMENT_RELAY_*`), because they're still set in EAS. Nothing imports them, so they aren't in the app code. Delete them in EAS.

## 5. Device test plan

Run once in **Arabic** and once in **English**. Use a fresh install, or Erase everything to start again.

| # | Area | Steps | Pass |
|---|---|---|---|
| 1 | First launch | Install, open | Language screen: العربية and English, large. Arabic: the app reloads into RTL Arabic. English on an LTR phone: no reload |
| 2 | Both PINs | Create code, confirm; second code (try the same code: refused), confirm; "I understand" | Name screen, then a two-screen guide, then Home. Status bar icons dark and readable |
| 3 | Lock and unlock | Background the app; reopen; real code. Wait 2 min idle | PIN screen each time; real code opens Home; idle locks |
| 4 | Notes button | On Home, Settings and the editor with the keyboard open, tap Notes once | Instantly the notes app. Then leave, reopen, real code: the draft is under "Continue writing" with the last words typed |
| 5 | Panic gesture | Triple-tap, then 2 s hold, in the band's centre, on Home and Settings | Notes app. Check Sync and Back can be tapped normally. Arabic: button on the right; English: on the left |
| 6 | Cover samples | First time the cover opens, by second code or by panic | 4 sample notes, in the app's language, at different times. Reopen: no duplicates. Delete all, reopen: still empty |
| 7 | Cover notes | New, edit, delete; leave, reopen with the second code | Changes kept; no Settings, language or way back |
| 8 | Send | New entry, type, Send (online) | Back on Home; "Sent."; "Last sent" with time; the item is gone |
| 9 | Failed Sync | Send while the server can't be reached (for example, flight mode turned off just as the send starts), or with a missing file | "Not sent: 1 … still waiting"; the item stays under Waiting with a plain reason. Never "Up to date" |
| 10 | Offline queue | Flight mode on, Send | "No connection…"; Waiting line shown. Lock, flight mode off, unlock to Home: it sends, "Sent." |
| 11 | Change both codes | Settings → Change code: wrong current code ×3 | "Wait" countdown (lockout). Then right code, new code twice: old code no longer opens; the new one does. Repeat for the second code; try a new code equal to the other: refused |
| 12 | Language switch with an open draft | Type in an entry, go back to Home (draft under "Continue writing"), Settings → Language → confirm | Warning, reload, PIN screen in the other language; real code shows the same draft. Cover in the new language too |
| 13 | Erase everything | Settings → Erase: enter the second code | "Not right", nothing erased. Real code: reload to the language screen. Old codes no longer work |
| 14 | Name only | Settings → Name | One field. A sent item shows on the desk with name only (Region "—") and no error |
| 15 | Narrow and large text | 320dp phone or display zoom, font size largest | Notes label fits; gesture still works in the band's centre |
| 16 | Diagnostics | Settings | Diagnostics row present (test build) |

## 6. Risks

1. **The band changes the layout around tested lock and panic code** (logic unchanged). Lock and panic must be retested in both languages.
2. **The gesture zone is narrower:** 184dp on a 360dp phone (it was 220).
3. **Cairo depends on the plugin's file-name family on Android.** If it doesn't load, Arabic falls back to the system font, which is readable.
4. **Status bar fix not seen on a device.**
5. **Arabic wording is my draft;** it needs your review in `docs/arabic-review.md`.
6. **Cover editor:** typing in the last ~0.6 s before a lock can be lost; lock can't flush the cover editor without a layout change.
7. **Sample-note times** (up to 5 hours before the first open) could predate the install if the cover opens soon after setup.
8. **Erase:** if the device secret is shredded but a blob delete fails, the app may show "can't be opened on this device", with no in-app way to reset.
9. **The preview APK uses the production EAS environment:** test sends reach the production desk.
10. **`expo-system-ui` and Cairo change the native build,** so earlier APKs are not a baseline.

## 7. Not verified

- Everything at runtime: the device test plan above.
- The desk's blank-field handling was read, not executed.
- The Arabic label width is an upper bound from glyph advances, not a render.
- iOS.
