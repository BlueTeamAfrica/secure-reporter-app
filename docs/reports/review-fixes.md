# Review fixes

Date: 2026-11-07. Fixes for `docs/reports/pre-build-review.md`. **Not built.**

- App: branch `feat/phase2b`, tagged `test-0.8-review-fixes`, pushed.
- Desk: branch `fix/attachment-download-name` in `../blueteam-secure-desk`, pushed, not merged or deployed.

Final checks on the app: **161/161 tests** (117 before this round, 37 suites), `tsc` clean, lint 0 errors and 1 warning (`usePreventScreenCapture` unused: capture protection stays off until the reporter's build, as decided). Vault format and encryption are unchanged.

## 1. Commits

| Commit | Findings | Summary |
|---|---|---|
| `23e667d` | M1, S1 | Nothing hidden; sending needs text or a file; in-flight mark always cleared |
| `3cae630` | S2, S3, S10, S11 | One Firestore document per item; fixed storage paths with no file names; "already exists" counts as received; too-large message |
| `03755c2` | M3, S7, S8 | 20 MB limit when adding; picker copies deleted; plain file type and size |
| `3b25870` | M2, S4, S12 | Notes-app Back never shows a real screen; private text fields; "Add name" returns to the editor |
| `bd62c17` | S5, S6 | No console output outside development; 7 permissions blocked |
| `995b909` | Build | `reporter` profile, remote version codes, "1.0.0 (N)", Diagnostics screenshot switch, final-build checklist |
| this commit | — | Arabic review table regenerated (205 rows), this report |
| desk `22e0b08` | S3 (desk) | Download uses the original file name |

Full diff: `git diff a08fdbe..test-0.8-review-fixes` (34 app files, +1018/−141, before this report).

## 2. What changed, finding by finding

### M1: nothing hidden; what can be sent

- **`src/state/itemRules.ts` (new, pure)** holds both rules, and `drafts.ts` and the editor use it.
  - `toVisibleItem` shows every well-formed item, including title-only, body-only and files-only, on Home, in the send queue and in orphan cleanup. Only a record without a string id is skipped.
  - `canSend`: body text or at least one file; the title is optional.
- **Title alone:** Send shows "Write some text or add a file before sending. A title alone is not sent." and nothing is sent. The send pipeline refuses it too.
- **Tests (`itemRules.test.ts`, 18):** title-only, body-only, files-only and title-plus-body, each as an unsent draft, waiting and failed. All shown; the queue picks up every waiting kind but no drafts; the visible count equals the stored count, so cleanup is never skipped.
- **Desk:** an empty title falls back to its placeholder, and an empty body is treated as none. Both were read in the desk code, not run.

### S1: the in-flight mark

`syncQueuedItem` sets the mark, then runs everything else inside a `try` whose `finally` clears it, including "Item not found" and every other early exit.

### S2: one document per item

- Each item gets a random 128-bit `submissionId` (32 hex characters). It's created with the item and saved once; items made before this get one on their first send, also saved once.
- Firestore writes `submissions/<submissionId>` with `?documentId=`.
- Results (`src/lib/firestoreReceipt.ts`):
  - 2xx with the matching name: received.
  - **409 ALREADY_EXISTS: received** (`alreadyExisted`), then confirmed and cleaned up as usual.
  - Anything else: not received, and the item stays waiting.
- **Desk check (read only):** document IDs are opaque everywhere. `referenceFromId` (`caseWorkspaceModel.ts:237`) uses the last 5 alphanumeric characters, so a hex ID gives `CASE-XXXXX` as before. Every route looks documents up by the given ID (`reviewer-action`, `delete`, `priority`, `due-date`, OneDrive sync). The only 20-character assumption is a comment about old `referenceCode` values. **No desk dependency on auto IDs.**
- **Tests:** IDs are unique and well-formed, a broken random source is refused, 409 counts as received, and 403/500/odd bodies/wrong name/wrong client id count as not received.

### S3 and S10: no file names in paths; fixed per item

- **Storage:** `submissions/<submissionId>/attachments/<attachmentId>.<ext>`. The extension comes from the name, or else the MIME type, or else `bin`. **The local copy uses the same name**, so no original name is on disk or in storage.
- **The original name** (Arabic included) stays only in the encrypted payload and the existing `attachments[].name` field.
- **Retries:**
  - The same path is used every time. An object already there (409/"Duplicate") counts as uploaded and is **never rolled back**, because it may belong to a submission the server has already received.
  - Rollback deletes only what this attempt newly stored.
  - So a crash leaves no second copy (S10).
- **Desk branch:** `createSignedUrl(path, expiry, { download: <original name> })`, via `attachmentDownloadName`. It strips control characters and path separators, replaces double quotes, and caps at 150 characters. With no usable name it signs exactly as before. Older submissions also carry `name`, so they download under the original name too. 11 cases checked with Node.
- **Side effect:** the signed URL now asks the browser to **download** rather than show the file inline.

### S11: refused for size

- Storage refuses (HTTP 413, or status code 413, or "maximum allowed size" / "too large"), so the pipeline stores `FILE_TOO_LARGE:<attachmentId>` with no name.
- Home shows: "This file is too large to send: {name}. Remove it, then send again." (en/ar). Not "will be tried again".

### M3: 20 MB per file

- Checked when adding. A file the picker gives no size for is measured after copying, and deleted if too large.
- Message (en/ar): "Files larger than 20 MB can't be added. Not added: …". No video in the picker.
- **Is 20 MB safe for memory?** By estimate, yes; not measured on the phone.
  - JS: 27 MB base64 read, plus 20 MB decoded, plus 20 MB of bytes, then React Native re-encodes to 27 MB base64 for the request (`convertRequestBody.js`). That's about 95 MB at peak.
  - Java: about 53 MB for that string plus 20 MB of bytes, about 75 MB, against a typical 192–512 MB per-app limit.
  - At 50 MB the Java side would be about 190 MB, which is the risky case.
  - **I kept 20 MB and put a 20 MB file in the device tests.** Lower it if that test is slow or crashes on the reporter's phone.

### S7: picker copies

- The system picker (`ACTION_OPEN_DOCUMENT`) copies to `cache/DocumentPicker/<random>.<ext>`. **Correction to the review: the names are random, not original.**
- The copy is deleted right after the app makes its own, and when a file is refused.
- `deleteAllImportedAttachments` (used by erase and the legacy wipe) also removes the picker cache folder, and now reports a failure instead of swallowing it.

### S8: plain file type and size

The editor shows "Photo · 2.4 MB", "مستند · 120 كيلوبايت", and so on. Western digits; no MIME strings (tested).

### M2: Back in the notes app

- `cover.tsx` only. Hardware Back closes an open note, otherwise **leaves the app** (`BackHandler.exitApp`). It never pops to the screen below `/cover`.
- When the app leaves, the background lock runs as before and the next open asks for a code.
- Lock and panic are unchanged. Tests cover the rule and check that `cover.tsx` handles every Back press.

### S4: text fields

- Every `TextInput` (editor title and body, notes title and body, name) has `autoCorrect={false}` (Android `TYPE_TEXT_FLAG_NO_SUGGESTIONS`, checked in React Native's source), `spellCheck={false}`, `autoComplete="off"`, `importantForAutofill="no"` and `textContentType="none"`.
- A test fails if any `TextInput` in `app/` or `src/` lacks them.

### S12: adding a name from the editor

"Add name" opens the name screen with `returnTo=editor`; Save returns to the editor.

### S5: logging

- `babel.config.js` with `transform-remove-console` for production. EAS builds (preview, reporter, production) bundle with `NODE_ENV=production`; development keeps logging.
- **Confirmed:** a release Android export (Hermes bundle, 4.3 MB) contains **0** of the app's log tags (`[SYNC]`, `[SYNC:firestore]`, `[SEND:supabase]`, `[PURGE]`, `[panic]`, `[lock]`, `[session]`, `[supabase:env]`, `[ATTACHMENT]`, `[DRAFTS]`, `[startup]`, `[SEND:relay]`, "Save failed", "write not confirmed"), while normal strings ("My Notes", "FILE_TOO_LARGE:", Diagnostics text) are present.

### S6: permissions

- **Blocked (7):** `SYSTEM_ALERT_WINDOW`, `USE_BIOMETRIC`, `USE_FINGERPRINT`, `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE`, `READ_MEDIA_IMAGES`, `VIBRATE`. A scratch prebuild shows `tools:node="remove"` for each.
- **Kept: `DETECT_SCREEN_CAPTURE`.**
  - On Android 14+, `expo-screen-capture` calls `registerScreenCaptureCallback` at start-up (`ScreenCaptureModule.kt:49-55`), and Android requires this permission for that call. Blocking it would very likely crash the app on launch.
  - It's an install-time permission, not shown under App info → Permissions.
  - Screenshot blocking itself (`FLAG_SECURE`) needs no permission.
- **The picker needs none of the blocked ones:**
  - `ACTION_OPEN_DOCUMENT` grants access to the chosen file.
  - The copy reads through that grant into app storage.
  - Storage and media permissions were only used by expo-screen-capture's pre-Android 14 screenshot *listener*, which the app doesn't use.
- **Phone checks:** see the device test list, items 16–18.

### Build label and profiles

- `eas.json`: `cli.appVersionSource: remote`. `preview` and the new `reporter` profile have `autoIncrement`.
- `reporter`: APK, `environment: production`, internal distribution, no test flag.
- Settings shows **"1.0.0 (versionCode)"** via `expo-application` (`nativeBuildVersion`).
- On the first remote-version build, EAS starts the counter itself (see Risks).

### Prepared for the final build

- **Diagnostics switch** (`src/diagnostics/screenCaptureToggle.ts`; test builds only; the function refuses otherwise): turns screenshot blocking on and off to check the recent-apps preview. It's not saved, so it's off again after a restart or language reload.
- **`docs/final-build-checklist.md`**: capture protection on; Diagnostics and `src/diagnostics/` removed; the `reporter` profile; EAS variables to delete; APK file checks (manifest, permissions, labels, fonts, no Diagnostics text, no log tags); phone checks; hand-over.

## 3. New strings

12 new rows, in both languages. `docs/arabic-review.md` is regenerated (205 rows):
- the title-only message (changed);
- the too-large send messages (2);
- file kinds (6);
- KB/MB units (2);
- the 20 MB add message.

## 4. Device test list for the next build (test build, both languages where marked)

| # | Fix | Steps | Pass |
|---|---|---|---|
| 1 | M1 | Save a draft with **only a title**, one with **only text**, one with **only a photo** | All three appear under My drafts |
| 2 | M1 | Send the **text-only** and the **photo-only** entries | "Sent."; both arrive at the desk (photo-only: placeholder title, no body) |
| 3 | M1 | Open the title-only draft and tap Send | The "Write some text or add a file…" message; nothing sent (en + ar) |
| 4 | S2 | Send an entry; turn on flight mode just as it starts; then turn it off and Send now | One document on the desk, not two |
| 5 | S3 | Send a file named in Arabic (e.g. `صورة.jpg`); on the desk (desk branch deployed to a test environment) download it | Saves as `صورة.jpg`; the storage object is `<id>.jpg` |
| 6 | M3 | Add a file over 20 MB | Refused with the message; nothing added (en + ar) |
| 7 | M3 | Add and send a file just under 20 MB on the reporter's model of phone | Sends; no crash; Home stays responsive |
| 8 | S11 | Only if the bucket limit is under 20 MB: send a file between the two limits | "This file is too large to send: …", not "tried again" |
| 9 | S8 | Add a photo, a PDF, a Word file, a voice note | Rows read "Photo · 1.2 MB", "PDF", "Document", "Audio" (Arabic: صورة, ملف PDF, مستند, صوت) |
| 10 | S7 | Add a file, then (test build) Diagnostics → storage counts | No leftover picker copies (or check `cache/DocumentPicker` with adb on a test phone) |
| 11 | M2 | Panic from Settings and from the editor; on the notes list press Back | The app leaves (home screen); reopening asks for a code; **no real screen is ever shown** |
| 12 | M2 | Second code after a lock that started on Settings; Back on the notes list | Same as 11 |
| 13 | S4 | Type unusual words in an entry; then in the notes app, type their first letters | No suggestion strip in either; the words are not offered (Gboard and the phone's own keyboard) |
| 14 | S12 | (Needs a phone with no name; e.g. after Erase, skip the name by killing the app) Editor → Send → Add name → Save | Back in the editor, not the guide |
| 15 | S5 | Test build over USB: `adb logcat \| grep -E "SYNC\|panic\|lock\]"` while sending and panicking | Nothing from the app |
| 16 | S6 | App info → Permissions | No permissions requested (or none granted) |
| 17 | S6 | Add files from Photos, Downloads, Drive and a voice-recorder folder | All can be added without a permission prompt |
| 18 | S6 | Launch on an Android 14+ phone | No crash (`DETECT_SCREEN_CAPTURE` kept for this) |
| 19 | Label | Settings | "Version 1.0.0 (N)" |
| 20 | Capture switch | Diagnostics → Block screenshots on → open recent apps | Preview blank; screenshot blocked. Off: preview visible again. Repeat in the notes app |

## 5. Decisions needed

None blocking. Two notes:
- **Download vs view:** the desk's signed URL now forces a download, so images and PDFs no longer open inline in the browser. Say if inline viewing should stay for some types.
- **Firestore rule:** if the deployed rules reject a create on an existing ID with **403 PERMISSION_DENIED** instead of 409, the app treats it as not received, and the item stays "Not sent" forever after a send that actually reached the server. The rule in the repo (`allow create: if true`) should give 409, but the deployed rule is unverified.

## 6. Risks

1. **The 409 versus 403 point above.** It affects only re-sends after a lost receipt.
2. **First remote-version build:** EAS starts the versionCode counter on the first `appVersionSource: remote` build. It usually starts from the app config (none, so 1). Non-interactive builds may stop and ask; if so, run `eas build:version:set` once.
3. **20 MB is an estimate,** not a measurement (device test 7).
4. **Keyboard learning:** React Native has no prop for Android's "no personalized learning" IME flag. `NO_SUGGESTIONS` removes the strip, and most keyboards don't learn from such fields, but this isn't guaranteed (device test 13).
5. **Existing waiting items** on a test phone get a submission ID on their next send; their earlier attempt folders (`submissions/<attemptId>/…`) stay on the server as before.
6. **The desk branch is untested:** no desk dependencies are installed here, so the desk's `tsc` and lint weren't run. The API option type was checked in the same `supabase-js` version (2.104). Arabic in the download header depends on the Supabase storage server's encoding (device test 5).

## 7. Not verified

- Everything on a phone: the device test list above.
- The desk branch, in a running desk.
- The deployed Firestore rules and the Supabase bucket's size limit and access policies (review M7, still open).
- Permission removal in the built APK; only the generated manifest was checked (final-build checklist §3).
- iOS.
