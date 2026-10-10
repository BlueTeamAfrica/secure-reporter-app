# Secure Reporter — Mobile App
**Last updated:** 2026-05-26
**Repo:** BlueTeamForAfrica/secure-reporter-app
**Working with:** Claude Code

---

## What this project is

A high-security mobile app (Expo/React Native) for field reporters operating under duress. Reporters use it to capture notes and attachments, encrypt everything locally, and submit to the dashboard. After confirmed server receipt, all local data is automatically purged — the device is intentionally not a record of truth.

Built by Blue Team Africa. Primary editorial client is the Atar/Sudan Facts newsroom.

The core design principle: **reporter protection over convenience**. Every UX decision flows from this.

---

## Platform & Setup

- **Stack:** Expo ~54, React Native 0.81, Expo Router 6, TypeScript
- **State:** Plain TS modules in `src/state/` (not React Context)
- **Backend:** Firestore REST (direct write), Supabase Storage (attachments)
- **Security:** AES-256-CBC encryption (key = SHA256(PIN), IV = MD5("iv:"+PIN)) — do NOT change this without coordinating with dashboard
- **Repo:** `https://github.com/BlueTeamForAfrica/secure-reporter-app.git`

---

## Security model (non-negotiable)

- **Dual PIN:** Real PIN unlocks real app. Decoy PIN shows harmless cover screen. Never reveal dual-mode exists.
- **Session:** PIN held in memory only. 2-minute inactivity timeout. Locks immediately on background.
- **Drafts:** AES-256-CBC encrypted in AsyncStorage. Key = SHA256(PIN). Losing PIN = losing drafts.
- **Reporter profile:** Encrypted in AsyncStorage with a device-specific random key stored in SecureStore (`reporter_profile_device_key`).
- **Submissions:** AES encrypted before Firestore write. Key = `EXPO_PUBLIC_SUBMISSION_PAYLOAD_SECRET`.
- **Attachments:** Supabase Storage (direct upload from device).
- **After confirmation:** Local copy purged. Tombstones prevent re-materialization.
- **Panic mode:** Triple-tap or 2s long-press header zone → immediate lock.

---

## What's built (production-stable as of May 2026)

- Global security in `app/_layout.tsx` (lock on background, decoy routing, privacy overlay, panic trigger)
- Dual PIN setup and verification (setup uses custom keypad + PIN confirmation step)
- Draft encryption and full report lifecycle (draft → ready → queued → confirmed → purged)
- Attachment pipeline (document picker → Supabase Storage)
- Home-centric flow: unlock → Home (not auto-editor)
- Text-only submissions work (attachments optional)
- Missing local attachment files skipped non-fatally on send
- Typing interruption fix: inactivity timer resets on `onChangeText`
- Stuck-in-syncing recovery: app restart resets "syncing" items to "queued"

---

## Security fixes applied (2026-05-26)

- **Orphan cleanup order fixed** — `cleanupOrphanImportedAttachments` now runs before `clearSessionPin` in `lockNow`. Previously it ran after PIN was cleared, causing all attachment files to be deleted on every lock.
- **Reporter profile now encrypted** — was plaintext in AsyncStorage. Now encrypted with a device-specific 32-byte key from SecureStore. Legacy plaintext profiles migrated transparently on next save.
- **Session timeout unified** — `_layout.tsx` inactivity timer now uses `SESSION_TIMEOUT_MS` (2 min) from `session.ts` instead of hardcoded 15s.
- **Setup uses custom keypad** — replaced `TextInput` (system keyboard) with `PinPad` component. Added PIN confirmation step.
- **Debug logs removed** — all `[EDITOR DEBUG]` logs removed from `_layout.tsx`, `home.tsx`, `report/new.tsx`.
- **Nav params sanitized** — report cards no longer pass `title`/`body` as URL params. Content loads from encrypted store by ID only.
- **Cover long-press delay** — increased from 800ms to 3000ms to reduce accidental reveal under observation.
- **Stuck syncing recovery** — `syncPendingItems("startup")` now resets items stuck in `"syncing"` state to `"queued"`.
- **Storage key constants** — deduplicated into `src/state/storageKeys.ts`.

---

## Pending before production release

1. **Device QA matrix** — test on physical device: unlock, decoy PIN, panic trigger, offline queue, purge, attachment skip
2. **APK size audit** — classify packages as keep/remove/review (do not uninstall without checking plugin usage)
3. **Screenshot blocking** — Android recents privacy hardening
4. **Verify env parity** — app Firebase/Supabase/secrets must match dashboard exactly (`EXPO_PUBLIC_SUBMISSION_PAYLOAD_SECRET` must be identical on both sides)

---

## Known architectural debt (requires coordinated fix — do not change unilaterally)

- **`EXPO_PUBLIC_SUBMISSION_PAYLOAD_SECRET` in APK binary** — anyone who decompiles the APK can extract the submission encryption key. Proper fix = asymmetric encryption (device keypair). Requires full protocol redesign across both repos.
- **No KDF on PIN-to-key derivation** — SHA-256 with no salt/iterations. Offline brute force of an AsyncStorage dump is fast for a 4-6 digit PIN. Fix = PBKDF2 + stored salt. Breaking change to all existing local drafts.
- **Deterministic IV** — `MD5("iv:"+secret)` means identical content produces identical ciphertext. Fix requires coordinated migration with `decryptEncryptedPayload.ts` on dashboard.

---

## Critical rules

- **Do not change the encryption scheme** (AES key/IV derivation) without a coordinated migration with the dashboard
- **No sensitive content in logs** — no filenames, paths, or report content ever
- **Neutral UI language** — never use words like "encrypted", "report", "secure" on visible screens
- **Never touch this repo from dashboard-only tasks** — they are separate systems

---

## Build & Release (EAS)

### Prerequisites
```bash
npm install -g eas-cli
eas login
```

### Required EAS environment variables
Check: `eas env:list` — add missing ones with `eas env:create` (set to production environment).

```
EXPO_PUBLIC_SUBMISSION_PAYLOAD_SECRET
EXPO_PUBLIC_ATTACHMENT_RELAY_BASE
EXPO_PUBLIC_ATTACHMENT_RELAY_KEY
EXPO_PUBLIC_FIREBASE_PROJECT_ID
EXPO_PUBLIC_FIREBASE_API_KEY
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
EXPO_PUBLIC_FIREBASE_APP_ID
```

### Build workflow
```bash
# 1. Verify code is clean
npx tsc --noEmit
npm run lint

# 2. Confirm env vars are set
eas env:list

# 3. Build APK (direct install on Android, ~10-20 min)
eas build -p android --profile preview

# Production AAB (Play Store) when needed:
# eas build -p android --profile production
```

### eas.json profiles
- `preview` → APK — direct install on Android phones
- `production` → AAB — Play Store bundle

### After build
1. Download `.apk` from the Expo build link (`https://expo.dev/accounts/.../builds/...`)
2. Transfer to phone (WhatsApp, Drive, USB)
3. Enable "Install unknown apps" on device
4. Install and run QA matrix (see Pending section above)
