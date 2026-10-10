# Project: secure-reporter-app

## Purpose
Expo/React Native mobile app for field reporters under duress. Captures encrypted notes + attachments, queues offline, syncs to Firestore + Supabase. After confirmed server receipt, all local data is auto-purged — the device is never the record of truth.

See `secure-reporter-shared/SHARED_CONTEXT.md` for Firestore rules, auth contracts, and cross-repo encryption alignment.

## Stack
- Expo ~54, React Native 0.81, Expo Router 6, TypeScript
- State: plain TS modules in `src/state/` — not React Context
- Backend: Firestore REST (`experimentalForceLongPolling`), Supabase Storage
- Crypto: AES-256-CBC via CryptoJS; SHA-256 PIN hashing via expo-crypto

## Commands
```bash
npm start          # Metro + Expo
npm run ios        # iOS Simulator (Xcode required)
npm run android    # Android (Android Studio required)
npm run web        # Web (limited — Supabase upload not supported on web)
npm run lint       # expo lint

# EAS builds
npx tsc --noEmit && npm run lint   # verify clean before building
eas env:list                        # confirm all env vars are set
eas build -p android --profile preview     # APK for direct install (~10-20 min)
eas build -p android --profile production  # AAB for Play Store

# Firebase Functions (functions/)
cd functions && npm run build   # tsc → lib/
cd functions && npm run serve   # local emulator
cd functions && npm run deploy  # deploy
```
No automated tests — verify manually on device.

## Environment Variables (`.env.local`)
```
EXPO_PUBLIC_FIREBASE_API_KEY=
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=
EXPO_PUBLIC_FIREBASE_PROJECT_ID=
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
EXPO_PUBLIC_FIREBASE_APP_ID=
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_SUPABASE_BUCKET=
EXPO_PUBLIC_SUBMISSION_PAYLOAD_SECRET=    # AES key for Firestore payload — must match dashboard
```
Firebase Functions requires `REPORTER_ATTACHMENT_UPLOAD_SECRET` as a Cloud Function secret.

## Security Model
**Threat model: reporter under duress needing plausible deniability.**

- **PIN** (`src/state/device.ts`): SHA-256 hashed, stored in expo-secure-store. Two PINs: real + decoy. App never reveals dual-mode existence.
- **Session** (`src/state/session.ts`): Real PIN held in memory only. 2-minute inactivity timeout (`SESSION_TIMEOUT_MS`). Locks on background, except when OS document picker is open (`documentPickerTransientActive`).
- **Draft encryption** (`src/lib/crypto/drafts.ts`): AES-256-CBC in AsyncStorage. Key = SHA256(PIN), IV = MD5("iv:"+PIN). PIN never stored — losing it loses all drafts.
- **Reporter profile** (`src/state/reporterProfile.ts`): Encrypted in AsyncStorage with a device-specific random key from SecureStore. Was plaintext before 2026-05-26; legacy profiles migrate on next save.
- **Submission encryption** (`src/lib/submissions.ts`): Full report JSON AES-encrypted with `EXPO_PUBLIC_SUBMISSION_PAYLOAD_SECRET` before Firestore write. Dashboard holds the matching key.

## App Routing (`app/`)
`app/_layout.tsx` enforces the entire security model globally:
- Unconfigured → `/setup`; configured → `/unlock`
- Every route change: session unlocked + not timed out → `/unlock` otherwise
- Decoy sessions always → `/cover`
- Privacy overlay when backgrounded/inactive
- Panic trigger: triple-tap or 2s long-press header zone (220×72px, top-center, invisible)
- `usePreventScreenCapture` is disabled — TODO: re-enable before release

## State Modules (`src/state/`)
| Module | Purpose |
|--------|---------|
| `session.ts` | In-memory PIN, 2-min timeout, inactivity hooks |
| `device.ts` | Persistent config, PIN hashing, failed-attempt lockouts |
| `drafts.ts` | CRUD for encrypted `ReportRecord` list; `syncQueuedItem` submission pipeline |
| `editorDraft.ts` | Encrypted autosave buffer (`working_report_buffer`); flushed before lock |
| `reporterProfile.ts` | Reporter name/region/phone/alias — encrypted; sent as plaintext metadata on Firestore doc |
| `storageKeys.ts` | Deduplicated AsyncStorage key constants |

## Report Workflow
```
draft → ready → queued → (syncQueuedItem) → confirmed → purged (local)
```
- **queued**: attachments upload to Supabase Storage, then encrypted payload writes to Firestore
- **confirmed**: server receipt validated
- **purged**: local copy deleted; tombstone in `purge_tombstones` prevents re-materialization
- Items stuck in `"syncing"` on restart reset to `"queued"` (`syncPendingItems("startup")`)
- Missing local attachment files skipped non-fatally (do not fail the send)

## Attachment Pipeline (`src/lib/attachments/`)
- Files imported via `expo-document-picker`, copied to sandbox (`persistLocal.ts`)
- `DraftAttachment` records (including `localUri`) AES-encrypted alongside report body
- On sync: read as base64 (`readLocalFileForUpload.ts`), decoded, uploaded to Supabase Storage
- Orphan cleanup (`cleanupOrphanImportedAttachments`) runs before `clearSessionPin` in `lockNow`

## Theming
- `src/theme/colors.ts` — shared warm palette (matches dashboard)
- `src/theme/fonts.ts` — use `poppins(weight)` always; never use `fontWeight` directly (breaks iOS/Android)

## Known Architectural Debt (do not change unilaterally)
- **`EXPO_PUBLIC_SUBMISSION_PAYLOAD_SECRET` in APK binary** — decompilable. Fix = asymmetric encryption across both repos.
- **No KDF on PIN** — SHA-256 with no salt/iterations. Offline brute force of AsyncStorage dump is fast. Fix = PBKDF2 + stored salt (breaking change).
- **Deterministic IV** — identical content produces identical ciphertext. Fix requires coordinated migration with dashboard `decryptEncryptedPayload.ts`.

## Open Threads
- [ ] Device QA matrix — unlock, decoy PIN, panic, offline queue, purge, attachment skip
- [ ] APK size audit — classify packages; do not remove without checking plugin usage
- [ ] Screenshot blocking — Android recents privacy hardening + re-enable `usePreventScreenCapture`
- [ ] Verify env parity — `EXPO_PUBLIC_SUBMISSION_PAYLOAD_SECRET` must be identical on app + dashboard

## Key Conventions
- Security-first — no shortcuts on auth or encryption
- Never log sensitive content: no filenames, paths, report body, PINs, or decrypted payloads
- Neutral UI language — never use "encrypted", "secure", "report" on visible screens
- Blueprints before coding — especially for session, PIN, or submission flow changes

## Do Not Touch
- Encryption logic (`src/lib/crypto/`, `src/lib/submissions.ts`) unless explicitly scoped
- `app/_layout.tsx` security model without full threat-model review
- Decoy/panic flow — safety-critical
- `EXPO_PUBLIC_SUBMISSION_PAYLOAD_SECRET` — coordinate with dashboard before any change

## Session Start Checklist
1. Read this file
2. Read `secure-reporter-shared/SHARED_CONTEXT.md`
3. Read `MASTER_HANDOVER.md` and `STATUS.md`
4. State which open thread you are targeting before writing any code

## Corrections
- [Date] — [mistake] → [correct approach]
