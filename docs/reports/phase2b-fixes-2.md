# Phase 2b fixes 2: simulate interrupted erase

Date: 2026-11-07. Branch: `feat/phase2b`, pushed. **Not built.**

Checks: 117/117 tests (114 before), `tsc` clean, lint 0 errors and 1 warning (capture protection still off, as before). No change to the vault, encryption, submission code or `app/_layout.tsx`.

## 1. What it does

Diagnostics → **Recovery test** → **Simulate interrupted erase** → confirmation dialog, then:
1. closes the session, as the erase does first;
2. deletes the device secret (SecureStore `vault_s`, with the vault's own SecureStore options), which is exactly the first step of `vault.wipeAll`;
3. goes to the PIN screen.

**State left: dead end 1 from `phase2b-fixes.md`** (device secret gone, vault left in place):
- `isInitialized` is still true, so the app stays on the PIN screen and never goes to setup.
- Every code, real, second or wrong, gets `DEVICE_SECRET_MISSING`. The screen shows "can't be opened on this device" with the keypad disabled, plus the recovery "Erase everything" button.
- The recovery erase then returns to first launch.

This state was chosen because it appears straight away on the PIN screen. The setup dead end (`ALREADY_INITIALIZED`) only shows after entering two new codes.

**Confirmation dialog:**
- Title: "Break this app's data?"
- Body: "This deletes the key that opens everything stored in this app on this phone. Drafts, items waiting to send and notes become unreadable for good. Only Erase everything will work afterwards."
- Buttons: Cancel / **Break the data** (red).

## 2. Test-build gating

- **UI:** the section is inside the screen's existing `IS_TEST_BUILD` block, next to the speed test. That's the same check that shows the Diagnostics row and the hold-to-open shortcut in Settings.
- **Function:** `simulateInterruptedErase(storage, isTestBuild)` throws and deletes nothing unless the flag is true (tested). This second check matters because expo-router bundles every route file in every build, so `storage-check.tsx` exists in production too and can be opened by deep link. The screen's other content is already gated.
- **Only user:** `app/settings/storage-check.tsx` is the only importer of `src/diagnostics/`.

## 3. Removal before the reporter's APK

It sits entirely inside the Diagnostics footprint, so it goes when Diagnostics goes, in one change:

1. Delete `app/settings/storage-check.tsx` (Diagnostics screen; the only importer).
2. Delete `src/diagnostics/` (this action and its test).
3. In `app/settings/index.tsx`, remove the Diagnostics row and the 3-second hold on the title.
4. Optional, same change: `src/state/storageDiagnostics.ts` and `src/lib/vault/kdfBenchmark.ts` (+ test), if nothing else imports them.
5. Check: `grep -rn "storage-check\|src/diagnostics\|simulateInterruptedErase" app src` returns nothing; tests, `tsc` and lint pass.

The release checklist for this step is in `CLAUDE.md` Open Threads (screenshot blocking and Diagnostics). It should name `src/diagnostics/` when that file is next updated; I did not edit `CLAUDE.md` here.

## 4. Tests (`src/diagnostics/simulateInterruptedErase.test.ts`, 3 new)

Run against the real vault code:
- **Leaves the dead-end state:** `isInitialized` stays true and the blobs stay. Real, second and wrong codes all give `DEVICE_SECRET_MISSING`, and `offersRecoveryErase` is true.
- **Recovery works:** the recovery erase (`runErase`) then reaches first launch, and new codes can be created.
- **Gated:** with the test-build flag off, it throws and deletes nothing.

## 5. Files

| File | Change |
|---|---|
| `src/diagnostics/simulateInterruptedErase.ts` | New |
| `src/diagnostics/simulateInterruptedErase.test.ts` | New |
| `app/settings/storage-check.tsx` | Recovery test section, header comment, imports |
| `docs/reports/phase2b-fixes-2.md` | This report |

## 6. Device test

| # | Steps | Pass |
|---|---|---|
| 18 | Test build: Settings → Diagnostics → Simulate interrupted erase → Cancel | Nothing changes |
| 19 | Same → Break the data | PIN screen. Any code: "can't be opened on this device", keypad disabled, "Erase everything" shown |
| 20 | Erase everything → confirm | Language screen (first launch); setup works; nothing old visible |
| 21 | Force close in step 19's state, reopen | Same PIN screen state; the button is still offered |

## 7. Risks

- **It really destroys the phone's data** after one confirmation. It's meant for test devices; on a test phone holding unsent items, those items are lost.
- **Anyone holding an unlocked test-build phone can use it.** Production builds can't, because of both checks.

## 8. Not verified

- Not run on a device.
- Removal steps are listed, not rehearsed.
