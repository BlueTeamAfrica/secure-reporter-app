# Pre-build review

Date: 2026-11-07. Branch `feat/phase2b` at `90275ff`. **Read-only review:** no code changed, nothing built. The only file written is this report.

Sources: source code at `90275ff`; the built manifest of the `test-0.6-phase2b` APK (no plugin or permission changes since); and the desk code at `../blueteam-secure-desk` (read only). Nothing was run on a device.

"The test" means the reporter's use from Nov 16. Effort: **XS** under 1 hour, **S** a few hours, **M** about a day.

## Summary

| Rank | Count |
|---|---|
| Must fix before the test | 7 |
| Should fix | 13 |
| After the test | 10 |

## 1. Must fix before the test

**M1. An entry without a title (or without body text) disappears, and if sent it is never sent.**
- Where: `src/state/drafts.ts:191`; `app/report/new.tsx:204-212`.
- Cause: `toReportRecord` drops any record whose title or body is empty. The editor lets you save a draft with only a title or only a body, and lets you **Send with an empty title** (only the body is required). `getReports` feeds Home's drafts list, the waiting list and the send queue (`syncPendingItems` targets).
- What the reporter sees:
  - A body-only entry saved as a draft is not on Home.
  - A body-only entry sent is stored as waiting but is never shown, never targeted, and never sent. Home then says "Nothing is waiting to send."
  - It is data loss as far as the reporter can tell, and it's the most likely way she'll write: no title.
- Also: orphan-file cleanup compares stored count with visible count (`persistLocal.ts:84`), so with any hidden record it never runs (see S9).
- The desk handles an empty title: `getSubmissionDisplay.ts:73-81` falls back to a placeholder title.
- Effort: S, with tests. The decision is whether a title-only draft can be sent; the body is required today.

**M2. Back from the notes app briefly shows the real Home.**
- Where: `app/cover.tsx:98` (back is handled only while a note is open); `app/_layout.tsx:143,154` and `app/unlock.tsx:106` use `router.replace("/cover")`, which keeps the screens underneath.
- Example: from Settings or the editor, panic, or lock then second code, leaves the stack as `[home, cover]`. Back on the notes list goes to `/home`. Home renders (title, "Send now", "Settings", "New entry", the Notes band) **before** the layout's redirect effect sends it back to `/cover`.
- Why it matters: someone forcing the phone and pressing back sees a second app.
- Effort: XS–S, in `cover.tsx` only, without touching lock or panic logic. Device check needed.

**M3. A large file can crash the app on Home, every time.**
- Where: `src/lib/attachments/storageUpload.ts:71-84`; `src/lib/attachments/picker.ts:24-34` (no size limit).
- Cause: each file is read whole into JS as base64, then copied to bytes. A long audio recording (allowed by the picker) or a large file can run the app out of memory.
- Why it's a dead end: Home starts a send automatically every time it opens, so the crash repeats on every open.
- Separately, Supabase's bucket or project file-size limit (default 50 MB on the free tier; this bucket's value is unknown) gives a permanent "Not sent… try again later" with no explanation.
- Effort: S (a per-file limit when adding, with a plain message). The limit itself needs a device memory test.

**M4. Screen capture and the recent-apps preview are unprotected.**
- Where: `app/_layout.tsx:69`.
- Already planned for the reporter's APK. Listed because it must not be missed.
- The Android overlay is drawn on the JS side after the app pauses, so the recent-apps thumbnail can show the real screen. `FLAG_SECURE` (`usePreventScreenCapture`) is the reliable fix.
- Effort: XS, plus a device check of the recents preview.

**M5. The reporter's build profile produces a file she can't install.**
- Where: `eas.json:14`.
- `production` builds an AAB (`app-bundle`), which can't be sideloaded.
- The reporter's build needs an APK with no `EXPO_PUBLIC_TEST_BUILD` (see section 6).
- Effort: XS.

**M6. Diagnostics, including "Simulate interrupted erase", must be removed.**
- `IS_TEST_BUILD` already hides them in a non-test build. But route files ship in every build and the screen can be opened by deep link, which is why the simulate action checks the flag itself.
- Removal steps: `docs/reports/phase2b-fixes-2.md` §3.
- Effort: XS–S.

**M7. Check the Supabase bucket's access policies.**
- Uploaded files are **not encrypted**: plain bytes under `submissions/<attemptId>/attachments/…`.
- The anon key ships in the APK (`src/lib/env/supabaseEnv.ts`). If the bucket policy lets anon **read or list**, anyone who unpacks the APK can download every file.
- This needs checking on the server; I couldn't.
- Effort: XS to check.

## 2. Should fix

| # | Finding | Where | Why it matters to the reporter | Effort |
|---|---|---|---|---|
| S1 | **"Item not found" leaves an item stuck "in flight" (still present).** The in-flight mark is added at :513, then three checks throw at :518-528, outside the `try`/`finally` that clears it (:674). Later sends of that item return "skip duplicate (in-flight)" until restart, and Home says "Not sent" each time | `src/state/drafts.ts:513-528` | An item can't be sent, with no explanation, until the app is restarted | XS |
| S2 | **Duplicates from a re-send (still present).** Each attempt POSTs a new Firestore document with an auto ID. A send is repeated after: a response lost after the server wrote; the app killed between the write and local cleanup; a held receipt lost when the app is killed while locked (`drafts.ts:75-81`) | `src/lib/submissions.ts:74,100` | The editor gets the same entry twice. Fix: write with `documentId = clientSubmissionId` and treat "already exists" as success. The rules allow create; no desk change expected. This is submission code, so it needs your go-ahead | S |
| S3 | **Arabic file names become underscores (still present).** `sanitizeFileName` keeps ASCII only, so `صورة.jpg` becomes `_.jpg` in the local copy and the storage path. The desk shows the original `name`, but its download (`.../download/route.ts:62`, signed URL to `storagePath`) saves files as `<id>__.jpg` | `src/lib/attachments/fileNames.ts:3` | The editor gets unreadable file names. Options: (a) store as `<attachmentId>.<ext>` and have the desk send the original name on download, which is a desk change and also stops names appearing in storage paths; (b) allow Unicode letters, though Supabase may reject non-ASCII keys (unverified) | S |
| S4 | **The keyboard can learn report words and suggest them in the notes app.** No `TextInput` sets `autoCorrect={false}` / `spellCheck` / `autoComplete="off"`, so Gboard and others learn from the real editor | `app/report/new.tsx:239,257`; `app/cover.tsx:168,175` | A coercer typing in the notes app may see report words suggested. Turning off autocorrect and suggestions reduces it; React Native doesn't expose Android's "no personalised learning" flag, so it can't be fully closed | XS |
| S5 | **Logs reach logcat in release builds.** About 50 `console` calls, none removed in release (no strip step): `[panic] complete`, `[lock] complete`, every `[SYNC]`/`[SEND]` step with ids, sizes and MIME types, the Supabase URL at start-up (`supabaseEnv.ts:47`), the bucket name (`storageUpload.ts:100,143`) | `app/_layout.tsx:132,155,159`; `src/state/drafts.ts` (24 calls); others listed in §8 | Readable with USB debugging (adb) or root; they show the app sends material and that panic was used. Not readable by other apps (Android 4.1+) | S |
| S6 | **Permissions a notes app doesn't need** (built manifest): `SYSTEM_ALERT_WINDOW`, `USE_BIOMETRIC`, `USE_FINGERPRINT`, `READ_EXTERNAL_STORAGE` (max SDK 32), `WRITE_EXTERNAL_STORAGE`, `READ_MEDIA_IMAGES` (max SDK 33), `VIBRATE`, `DETECT_SCREEN_CAPTURE` | `app.json` (no `android.blockedPermissions`) | App info → Permissions looks odd for "My Notes". The system file picker needs none of the storage or media permissions; blocking them needs a device check that "Add file" still works | XS + test |
| S7 | **Copies from the file picker stay on the phone.** `copyToCacheDirectory: true` puts a copy in the app cache **under its original name**. The app then makes its own copy and never deletes the cache one, including after a send or an erase | `src/lib/attachments/picker.ts:34`; `persistLocal.ts:31`; erase steps (`src/state/erasePlan.ts`) | Unencrypted files and names stay after "sent" and "Erase everything" (readable with root) | XS |
| S8 | **Technical file types shown in the editor.** Each file row shows the raw MIME type, e.g. `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, plus "KB" | `app/report/new.tsx:358-359` | Leftover technical English on a main screen | XS |
| S9 | **Unused copied files pile up.** Orphan cleanup is skipped whenever a record is hidden (M1); interrupted sends can also leave files | `src/lib/attachments/persistLocal.ts:84` | Unencrypted copies stay longer. Goes away with M1 | — (fixed with M1) |
| S10 | **Orphan uploads after a crash.** Killed mid-send, the rollback never runs; the retry uploads under a new `attemptId` path, so the earlier files stay in the bucket | `src/state/drafts.ts:531,564,659-664` | Unencrypted copies stay on the server. Also fixed by a stable path per item | S |
| S11 | **No file-size message** (part of M3): when the bucket limit is hit, the reporter sees only "Could not send. It will be tried again." | `src/i18n/sendError.ts` | She retries forever | with M3 |
| S12 | **Odd flow when adding a name from the editor.** Send with no name → "Add name" → after Save, the guide appears again (first-run route), then Home | `app/report/new.tsx:432`; `app/reporter-profile.tsx:60` | Unexpected screen. Rare, because setup always asks for the name | XS |
| S13 | **No build number shown.** Settings shows only `1.0.0`, so you can't tell builds apart on the device (see section 7) | `app/settings/index.tsx:62-64,164` | You, not the reporter | XS |

## 3. After the test

| # | Finding | Where |
|---|---|---|
| A1 | Unencrypted data on the server: file bytes in Supabase; file names, sizes and MIME types as plain Firestore fields (`attachments[]`); reporter name plain. Known debt (`SHARED_CONTEXT.md` §5) | `src/lib/submissions.ts:84,93-96` |
| A2 | The shared payload secret is in the APK; deterministic IV (CBC). Known debt | `src/lib/crypto/drafts.ts` |
| A3 | Deep link `securereporterapp://…` can open real routes, and they flash before the redirect (as M2). It needs a crafted link. The scheme name itself is a trace (decided not to change) | `app.json:8`; `app/_layout.tsx:171-180` |
| A4 | The package ID `com.blueteamafrica.securereporterapp` is visible in App info (decided) | `app.json` |
| A5 | The picker refuses video (`image/*`, PDF, Word, text, audio only). Video is greyed out with no explanation. Is that intended? | `src/lib/attachments/picker.ts:26-31` |
| A6 | The first-run guide can't be opened again | `app/guide.tsx` |
| A7 | `src/lib/firebase.ts` and the `firebase` package are unused (nothing imports them), so they're dead weight in `package.json` | `src/lib/firebase.ts` |
| A8 | The system file picker's "Recent" list shows files picked in the real app; this is outside the app's control | — |
| A9 | A held receipt is in memory only: if the app is killed while locked after the server confirmed, the item is sent again (see S2) | `src/state/drafts.ts:75-81` |
| A10 | `receipts` stub screen ("Receipts Screen", English), reachable only by deep link | `app/receipts/index.tsx` |

## 4. Reporter journey (both languages)

| Step | Result | Findings |
|---|---|---|
| Install | APK sideload: Android asks to allow the source; Play Protect may warn about an unknown developer | Brief her |
| Language | Both scripts, large; reloads into the chosen layout | OK |
| Both codes | Clear copy; refuses equal codes; "I understand" | OK |
| Name, then guide | One field; two-screen guide | S12 |
| New entry | Title and body; Save draft / Send | **M1**; S4 |
| Add files | System picker; no size limit; video refused | **M3**, S7, S8, A5 |
| Send online | Home: "Sent.", Last sent | M1 (no-title case) |
| Offline | "No connection…"; Waiting line; sends on Home when online | OK. Inactivity lock (2 min, `session.ts:21`) can fire while she watches a long send; it finishes on unlock |
| Home status | One empty state; Waiting / Last sent | M1 hides items |
| Can't tell what happened | A hidden item; a stuck in-flight item; repeated failure from file size | M1, S1, M3/S11 |
| Leftover English | Diagnostics (to be removed), MIME types, "KB", receipts stub. The system picker follows the phone's language, not the app's | S8, M6, A10 |

## 5. Safety

| Area | Status |
|---|---|
| Lock | On background and after 2 min idle; draft saved first. OK |
| Panic: button and gesture | Same path; band keeps controls clear; draft saved first. OK, pending device test |
| Cover session: storage | Two same-size vault slots; nothing in the cover reads real data. The sandbox folder is `secure_reporter_attachments` (`persistLocal.ts:13`) and picker copies keep original names (S7). Readable only with root |
| Cover session: notifications | None; the app has no notification library |
| Cover session: language | Same language as the real app. OK |
| Cover session: timing | Unlock runs one key derivation for either code; samples are added after the cover appears. OK |
| Cover session: back navigation | **M2** |
| Cover session: deep links | A3 |
| Cover session: keyboard | S4 |
| Recent-apps preview | **M4** |
| Logcat | S5 |

## 6. Data

### Leaves the phone

**Firestore `submissions/<auto id>`**, one per send attempt (S2). Plaintext fields:
- `clientSubmissionId` (the local creation time in milliseconds), `attemptId`, `itemId`
- `workflowStatus`, `status: "received"`, `processingStatus: "new"`, `reviewedAt: null`, `reviewerNote: ""`
- `uploadedAt`, `createdAt`, `updatedAt`, `payloadVersion`
- `attachments[]`: `id`, **`name` (original file name)**, `mimeType`, `size`, `storagePath`, `uploadedAt`
- **`reporterName`**, `reporterRegion: ""`, `reporterPhone: ""`, `reporterAlias: ""`
- `encryptedPayload`: AES-CBC with the shared secret, containing title, body and the attachment list
- The API key is in the request URL

**Supabase Storage**, bucket from `EXPO_PUBLIC_SUPABASE_BUCKET`:
- Path: `submissions/<attemptId>/attachments/<attachmentId>_<ASCII-sanitised name>`.
- **The file bytes are unencrypted.** Content-type is set.

**Network metadata:** IP address and timing to Google and Supabase.

### Stays on the phone unencrypted

- The copy of every attached file, in the sandbox folder `secure_reporter_attachments/`, named `<id>_<sanitised name>`.
- The picker's cache copies, under original names, never deleted (S7).
- SecureStore holds `app_language`, `randomize_keypad` and the lockout counters. They're encrypted by the Android keystore, but they are not in the vault.
- The expo-updates local log file (it only says updates are disabled).
- Logcat (S5).
- Everything else (items, drafts, name, notes, tombstones) is inside the vault.

### Cleanup after a confirmed send

1. The local file copies are deleted.
2. The record is removed.
3. The working draft is cleared if it belonged to that item.
4. A tombstone is kept: ids, server id, time.

Not cleaned: picker cache copies (S7) and server-side orphans after a crash (S10).

## 7. Failures

| Case | Result |
|---|---|
| App killed during a send | Item left "syncing"; reset to waiting when Home next opens; sent again. Orphan uploads (S10); duplicate if the server had already written (S2) |
| Partial upload (network drop) | Files uploaded so far are deleted (best effort, needs the network); item marked "Not sent" and stays waiting. OK |
| Duplicate sends in one session | Prevented by the in-flight mark, except the S1 leak |
| Very large or many files | **M3** (memory) and the bucket limit. Many files upload one at a time; a long send can outlast the 2-minute idle lock, and the held receipt covers it (A9) |
| Storage full | Adding a file fails with "Could not add the selected file(s)."; saving shows "Could not save". OK |
| Receipt after lock | Held in memory and applied at the next real unlock; lost if the app is killed first, so a duplicate (A9/S2) |

### Known issues: still present?

| Issue | Status |
|---|---|
| "Item not found" leaving an item in flight | **Yes** (S1) |
| Drafts with only a title or only a body hidden from Home | **Yes, and worse: a sent body-only entry is never sent** (M1) |
| Arabic file names reduced to underscores | **Yes** (S3) |
| Duplicates from a re-send | **Yes** (S2) |

## 8. Final APK readiness

**Gated by the test-build flag** (`src/lib/env/testBuild.ts`: `IS_TEST_BUILD = __DEV__ || EXPO_PUBLIC_TEST_BUILD === "1"`, inlined at build time):
- `app/settings/index.tsx:107`: 3-second hold on the Settings title opens Diagnostics.
- `app/settings/index.tsx:158`: the Diagnostics row.
- `app/settings/storage-check.tsx:331`: storage counts (also needs a real session).
- `app/settings/storage-check.tsx:438`: speed test and "Simulate interrupted erase".
- `app/settings/storage-check.tsx:152`: the simulate function refuses if the flag is off.

**How the flag is set per EAS profile:**
- `preview`: `env.EXPO_PUBLIC_TEST_BUILD = "1"`, `environment: production`, APK.
- `production`: flag not set, no `environment` key (EAS uses production for store builds), **AAB**.

**What the reporter's build must change:**
1. A profile that builds an **APK**, without `EXPO_PUBLIC_TEST_BUILD`, with `environment: production` (M5).
2. Turn on `usePreventScreenCapture` (M4).
3. Remove Diagnostics and `src/diagnostics/` (M6).
4. Strip or limit logging (S5).
5. Block unneeded permissions (S6).
6. Optional: a build label (section 9).

Also: delete the relay variables from EAS (they still load into builds) and the `XPO_PUBLIC_SUPABASE_ANON_KEY` typo.

### Console calls in a release build

| File | Calls |
|---|---|
| `src/state/drafts.ts` | 24 |
| `src/lib/attachments/storageUpload.ts` | 7 |
| `app/_layout.tsx` | 4 |
| `src/lib/attachments/persistLocal.ts` | 3 |
| `src/lib/submissions.ts` | 3 |
| `src/lib/attachments/picker.ts` | 3 |
| `app/report/new.tsx` | 1 |
| `app/report/upload.tsx` | 1 |
| `src/lib/attachments/readLocalFileForUpload.ts` | 1 |
| `src/lib/env/supabaseEnv.ts` | 1 |
| `src/state/session.ts` | 1 |
| `src/state/legacyWipe.ts` | 1 |
| `src/lib/firebase.ts` | 1 (never runs: not imported) |

No titles, bodies, file names, PINs or paths are logged.

## 9. Config

**Built manifest:**
- Permissions: listed in S6, plus the needed `INTERNET`, `ACCESS_NETWORK_STATE`, `ACCESS_WIFI_STATE` (NetInfo) and the Android-internal `DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`.
- `allowBackup=false`; not debuggable.
- Exported components: `MainActivity` (scheme `securereporterapp`) and `ProfileInstallReceiver` (AndroidX, harmless).
- Updates disabled; no update URL.

**`app.json`:** `version` 1.0.0; no `android.versionCode`; no `blockedPermissions`; `scheme` `securereporterapp`; `userInterfaceStyle` light.

**`eas.json`:**
- No `cli` block, which causes the `appVersionSource` warning.
- Recommended: `"cli": { "appVersionSource": "remote" }` with `autoIncrement` on the reporter's profile. EAS then owns the Android version code, so each build is distinguishable. XS.

**Build label such as "1.0.0 (0.7)" in Settings.** Settings currently reads `Constants.expoConfig.version` (`app/settings/index.tsx:62-64`). Options:
- **(a) Recommended:** a per-profile `EXPO_PUBLIC_BUILD_LABEL` in `eas.json` `env` (e.g. `"0.7"`, updated with each test tag), appended to the version row. No new package; inlined at build time.
- **(b)** Add `expo-application` and show `nativeBuildVersion` (the Android version code, with remote auto-increment). It's automatic, but shows "12", not "0.7".

## 10. Decisions needed

1. **M1:** may an entry with only a title be sent, or keep requiring body text?
2. **M3:** maximum size per file, and should video be allowed (A5)?
3. **S2:** may I change `submissions.ts` to write with a stable document ID? This is a submission-code change; no desk change expected.
4. **S3:** file names in storage: (a) id plus extension with the desk sending the original name on download (desk change), or (b) Unicode names, untested with Supabase.
5. **M7:** who checks the Supabase bucket policies (anon read/list)?
6. **Build label:** option (a) or (b).

## 11. Not checked

- Anything at runtime: memory limits for M3, the M2 flash, the recents thumbnail (M4), Gboard learning (S4), and whether blocking permissions breaks the picker (S6).
- Supabase bucket policies and file-size limit (M7, M3).
- Firestore rules as deployed (the repo has `allow create: if true`; the deployed state is an open thread on the desk).
- iOS.
- Desk behaviour was read, not executed.
