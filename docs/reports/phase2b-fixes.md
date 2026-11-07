# Phase 2b fixes

Date: 2026-11-07. Branch: `feat/phase2b`, tagged `test-0.7-phase2b-fixes`, pushed. **Not built** (as asked, so device findings can join the next build).

Checks: 114/114 tests (108 before), `tsc` clean, lint 0 errors and 1 warning (capture protection still off, as before). The vault format and encryption are unchanged; `src/lib/vault/` was not touched.

## 1. Arabic wording

Edited in `src/i18n/strings.ts`; `docs/arabic-review.md` regenerated from it (5 rows changed).

| Where | Before | After |
|---|---|---|
| Sample "مشتريات" | خبز، أرز | عيش، رز |
| Sample "هذا الأسبوع" | دفع فاتورة الكهرباء | شحن الكهرباء |
| Name screen and the "add your name first" message (2 places) | يُرسل اسمك مع كل مادة ليعرفوا أنها منك. | يُرسل اسمك مع كل مادة. |
| English, same 2 places | Your name is sent with each entry, so they know it is from you. | Your name is sent with each entry. |
| Wait timer | {seconds} ث | {seconds} ثانية |

- **One change you didn't ask for:** the English sample line "Pay the electricity bill" became "Top up the electricity", to match شحن الكهرباء.
- Existing installs keep their old samples, which are only created on the first cover open. Nothing is migrated.

## 2. Partial erase recovery

### How someone could get stuck

The erase deletes in this order: device secret, header a, header b, 10 records, files, keys, flags. An interruption could leave:

| State after interruption | What the app did | Dead end? |
|---|---|---|
| Device secret deleted, both headers left | PIN screen: "can't be opened on this device" (`DEVICE_SECRET_MISSING`), keypad disabled | **Yes** |
| One header deleted | `isInitialized` is false, so the app goes to setup; creating codes fails with `ALREADY_INITIALIZED`, shown as a generic error | **Yes** |
| Headers missing at unlock | "needs to be set up again" (`NOT_INITIALIZED`) | **Yes** |
| Both headers deleted | Setup works (`createVaults` overwrites) | No |

### Fix

1. **Safe to repeat.**
   - Every delete already succeeds when its data is gone. Checked in the installed sources: vault deletes of missing keys; `expo-secure-store` `deleteItemImpl` only removes keys that exist; AsyncStorage `multiRemove`; `FileSystem.deleteAsync(..., { idempotent: true })`.
   - `runErase` (`src/state/erasePlan.ts`, pure) runs every step even when one fails, and reports which failed.
   - Settings and recovery share one path: `src/state/erase.ts`.
   - The old `wipeDevice` and `forgetLanguage` are removed, and the SecureStore key names now have one source.
2. **Recovery button.**
   - `offersRecoveryErase` returns true only for `DEVICE_SECRET_MISSING`, `NOT_INITIALIZED` and `ALREADY_INITIALIZED`.
   - In those states the PIN screen and the setup confirmation step show "Erase everything", with the same warning text as Settings and a confirmation dialog.
   - It runs the same erase, then reloads to first launch (the language screen).
   - It is not offered for `UNSUPPORTED_FORMAT`, because a newer app version may still read that data; nor for wrong codes, `CORRUPT`, or unknown and transient errors.
3. **Messages.** `ALREADY_INITIALIZED` now shows "The app needs to be set up again", and `NOT_INITIALIZED` disables the keypad, since retrying can't help. `pinMessages` tests were extended to cover this.

### Why this doesn't help an attacker

- **It only appears when the data is already unreadable.** It shows only on errors the vault itself reports from what's stored. A wrong code returns "wrong", never one of these states (tested). No input on the screen can make it appear on an intact install.
- **Causing those states already destroys the data.** Removing the device secret or a header needs root or adb on a release build. Anyone with that access can wipe the app anyway.
- **Erasing without the PIN gives nothing new.** Android's *App info → Clear storage*, or uninstalling, already erases everything with no PIN. The button just offers that inside the app.
- **No data or key is ever revealed.** It only deletes. Under coercion it shows a generic "can't be opened" message and an erase option. It doesn't hint at a second code or what the app holds.

### Tests (`src/state/erasePlan.test.ts`, 6 new)

These run against the real vault code, with simulated SecureStore, files and RTL flags.

- **Full erase:** ends at first launch. "First launch" means no vault keys, nothing in SecureStore, no files, default flags, setup works again, and no old data appears. Erasing again on an empty phone is harmless.
- **Interrupted at every step:** the app is killed before each storage operation in turn (every one, counted from a full erase: device secret, both headers, all 10 records, files, 4 keys, flags). For each crash point, the state is checked with the old codes. It is never a dead end: either the real code still opens (so Settings can erase again), setup works, or the error offers recovery. Then the erase is repeated, and the phone must end at first launch.
- **A failing step:** the others still run, and the run reports which step failed.
- **When recovery is offered:** only the three codes above. Not for `INVALID_PIN`, `UNSUPPORTED_FORMAT`, `KDF_UNAVAILABLE`, `CORRUPT`, `LOCKED`, unknown errors, or a wrong code on an intact vault.

## 3. Files

| Files | Change |
|---|---|
| `src/i18n/strings.ts`, `docs/arabic-review.md` | Wording |
| `src/state/erasePlan.ts` (new), `src/state/erasePlan.test.ts` (new), `src/state/erase.ts` (new) | Erase steps and recovery rule |
| `src/state/device.ts` | Key names from `erasePlan`; old wipe removed |
| `src/state/language.ts` | `forgetLanguage` removed (now an erase step) |
| `src/state/pinMessages.ts` (+ test) | `ALREADY_INITIALIZED` message; `NOT_INITIALIZED` disables the keypad |
| `src/components/RecoveryErase.tsx` (new), `app/unlock.tsx`, `app/setup.tsx`, `app/settings/erase.tsx` | Recovery button; Settings uses the shared erase |

## 4. Risks

1. **A false "device secret missing" could lead to a needless erase.** If SecureStore returned nothing for a secret that still exists, the button would appear and the reporter could erase recoverable data. Two things limit this: `expo-secure-store` throws on read failures rather than returning null, and a thrown error shows the generic message with no button. A confirmation dialog with the full warning is also required.
2. **The recovery erase is reachable without a code** in those three states, by design (see "Why this doesn't help an attacker").

## 5. Not verified

- Nothing was run on a device; the recovery button needs a device test, by forcing a half-erased state with a test build.
- The interruption tests simulate killing the app between storage operations; they don't simulate a single storage write failing halfway.

## 6. Device test additions

| # | Steps | Pass |
|---|---|---|
| 17 | Arabic: confirm the new wording on the name screen, the wait timer ("ثانية"), and the samples on a fresh install's first cover open (عيش، رز، شحن الكهرباء) | Wording as in the table above |
| 18 | Recovery: needs a test-build way to delete the device secret or one header (none exists yet; see Decisions) | Button shown; erase leads to the language screen |
