# Phase 2b plan

Date: 2026-11-06. Branch: `feat/phase2b`, from `feat/rtl-spike` at `7ac3acc`. **Plan only: no code has changed.**

Everything here comes from reading code in this repo and `blueteam-secure-desk`. Nothing was run on a device. Baseline: 54/54 tests.

## 1. Conflicts with the brief

| # | Brief says | What the code does | Proposed handling |
|---|---|---|---|
| C1 | Changing the cover PIN asks for the current cover PIN (item 6) | `changePin("cover", null, new)` takes no old PIN, and `unlock()` closes the real session first. The existing API can't check a cover PIN inside a real session | **Decision D1** |
| C2 | One "Name" field (item 6), but don't change what the desk receives without asking | Removing region and phone inputs makes both fields `""` on the desk | **Decision D2** |
| C3 | All visible text from one strings file, but `_layout.tsx` only for items 3 and 4 | The privacy overlay's "Protected" is hard-coded in `_layout.tsx:318` | **Decision D3** |
| C4 | Store count and time for "last sent" inside the real vault | The vault's record list is fixed, so a new record is a vault change. Writing to `profile` at send time needs a hook in submission code | Read existing tombstones instead; nothing new is stored (section 3) |
| C5 | Language screen comes first, but `_layout.tsx` only for items 3 and 4 | A new route is bounced: `redirectFor` sends any non-public path to `/` when not configured | Make language the first step inside `/setup`, with no new route |
| C6 | Cairo font, but `_layout.tsx` only for items 3 and 4 | Fonts load through `useFonts` in `_layout.tsx` | Embed Cairo with the `expo-font` config plugin; no layout change |
| C7 | Cover notes with an editor, but no layout change for item 5 | `redirectFor` forces cover sessions to exactly `/cover` | Keep the list and editor as states of one `/cover` route |
| C8 | Notes button absent from "setup" | `/reporter-profile` and the guide run right after setup, with a real session open | Show the button there: panic works, and the guide can point at the real button. Hide it only on `/setup`, `/unlock`, `/cover` |

## 2. Gesture zone audit (item 4)

Confirmed in code. The zone is drawn after the `Stack`, so it takes touches from anything beneath it. A single tap on a control under it does nothing; three quick taps trigger panic.

Positions are calculated for a 360dp-wide screen, with the zone at x 70–290, y 0–72. Android's `SafeAreaView` adds no inset here, so screen content starts at y 24 and runs under the status bar. Control widths are estimates.

| Screen | LTR | RTL |
|---|---|---|
| Home: Sync | **Fully under** (about x 178–240) | **Fully under** (about x 120–182) |
| Home: Settings | **About 40dp under** (about x 250–336) | **About 40dp under** (about x 24–110) |
| Settings: Back | **About 30dp under** (x 24–100) | **About 30dp under** (x 260–336) |
| Diagnostics: Back | Same as Settings | Same as Settings |
| Settings, Diagnostics, profile, editor, review: scrolling content | **Any control passes under when scrolled** | Same |
| Editor: first screenful | Title field starts at about y 76, just clear until scrolled | Same |
| Home: list | Clear: clipped by its `ScrollView` below the header | Same |
| Success, upload | Clear: centred or no controls | Same |
| `receipts` | Stub with no controls, not linked from any screen | Same |

**Moving individual buttons can't fix this, because scrolling brings every control through the zone.**

**Fix: a fixed top band on every real screen, added in `_layout.tsx`.**
- The band is status-bar inset + 56dp. The `Stack` starts below it, so no screen content can reach the zone in any direction or at any scroll position.
- The band holds the Notes button and the zone, and nothing else. It also stops real screens running under the status bar.
- Notes button: notebook icon above the label, about 72dp wide, at the logical start (right in Arabic, left in English).
- The zone stays centred, width `min(220, screen − 2 × 80)`: 200dp on a 360dp phone, 160dp on 320dp. Triple-tap and 2-second hold don't change.
- The top of the screen can't be covered by the keyboard, and sending happens far lower on the screen.

## 3. Is the vault API enough?

| Need | API | Enough? |
|---|---|---|
| Cover notes | `get`, `put`, `update` on the existing `notes` record | Yes |
| Sample notes in setup | `createVaults` → `enterCoverFromReal` → `put("notes")` → `unlock(realPin)` | Yes. One extra key derivation in setup |
| Change real PIN | `changePin("real", old, new)` checks old PIN and that the PINs differ | Yes |
| Change cover PIN | `changePin("cover", null, new)` checks the PINs differ | **Partly: can't check the current cover PIN (D1)** |
| Erase with real PIN | `unlock(pin)`, then `wipeAll()` | Yes, but a wrong PIN closes the session and shows the PIN screen. A cover PIN must not erase; treated as wrong |
| Last sent | `get("tombstones")`; each entry has ids and `confirmedAt`, with no title or content | Yes. Entries are never pruned, so the count is all-time |
| Language | SecureStore, outside the vault (done in spike) | Yes |

No vault internals, encryption or submission code change, unless D1 chooses otherwise.

## 4. Order of work

One commit per step. Tests, `tsc` and lint must pass at each.

| Step | Item | Touches | New tests |
|---|---|---|---|
| 1 | Strings and type foundation | New pure `src/i18n/strings.ts` (en, ar); `src/theme/fonts.ts`; `pinMessages.ts` keeps its API; all screens; `app.json` for Cairo and status bar; pure date formatter | Same keys in both languages; banned words in both; no Arabic-Indic digits; formatter |
| 2 | Top band and Notes button (3, 4) | `app/_layout.tsx` only; button calls existing `handlePanicMode` | Pure zone-width function |
| 3 | Language (1) | `/setup` first step; real Settings item with warning; `index.tsx` corrects a saved language that disagrees with the layout, once | Reload-needed logic |
| 4 | Cover notes (5) | `app/cover.tsx`, new pure `src/state/coverNotes.ts`, `setup.tsx` for seeding | CRUD and seeding with the in-memory vault; seeds never reach the real slot |
| 5 | Settings (6) | `settings/` screens, `reporter-profile.tsx`, `device.ts` (`wipeDevice` also removes language and keypad keys, and continues past a failed step) | Wrong PIN, same PIN, erase refused for cover PIN, erase leaves first-launch state |
| 6 | Send status (7) | `home.tsx`, new read-only summary over tombstones | Summary logic |
| 7 | First-run guide (8) | New `/guide` route, reached from the first profile save | None (static content); strings test covers it |
| 8 | Launcher name and icon (2) | `app.json` `name` only; regenerate icon, adaptive, monochrome and splash images | None |
| 9 | Cleanup (9) | `home.tsx`, `.env.local`, dead `attachmentRelayEnv.ts` | None |
| 10 | Arabic for review (2) | `docs/arabic-review.md` | None |

Then a preview APK and device test plan, once you say so. The final Arabic wording awaits your approval.

### Notes per item

- **Strings:** language changes only through a reload, so strings can be chosen once at start-up. `I18nManager.isRTL` gives this synchronously, with no provider and no change to `_layout.tsx`.
- **Arrows:** they come from the strings table, so they flip with the language.
- **Dates:** `toLocaleString()` at `home.tsx:102,228` follows the device locale and could show Arabic-Indic digits. A small pure formatter avoids this and doesn't depend on Hermes `Intl`.
- **Line height:** a `text(size, weight)` style helper replaces per-screen values (1.6× Arabic, 1.3× English; starting values, to tune on device).
- **Status bar:** the prebuild warns that `userInterfaceStyle` needs `expo-system-ui`. If the phone is in dark mode, that would explain white icons. Plan: install it and set `androidStatusBar.barStyle` in `app.json`. Fallback: call the `StatusBar` API from a module outside `_layout.tsx`.
- **First launch on an Arabic-language phone:** the layout may already be RTL, so choosing English needs a reload too. The rule is to reload only when the direction changes.
- **Sample notes:** three or four, with times spread across the setup day. Using the same time for all would look staged, and dates before the install could look staged to anyone checking. If the app dies during seeding, the first cover open adds them; `null` means never seeded, `[]` means the user deleted them all.
- **Cover editor:** saves on a short delay while typing and refreshes the inactivity timer. Lock can't flush the cover editor without a layout change, so the last moment of typing there can be lost.
- **Hardware back in the cover editor:** returns to the list, with no route change.
- **Erase:** after wiping, resets the RTL flags and reloads, so the next screen is the language choice.
- **Failed PIN checks in Settings:** use the same counter as unlock (`recordFailedAttempt`), then lock. Without this, an open session allows unlimited guessing.
- **Send status wording:** sync runs only while **Home** is focused and the session is open, so "with the app open" isn't quite accurate. The line must say to keep this screen open.
- **"Sent" confirmation:** Home compares the tombstone count before and after a sync, which also catches background sends and receipts finished at unlock.
- **Empty messages:** one empty state replaces "Nothing pending", "You're all caught up", "No saved notes" and the second "Nothing pending."

## 5. Profile fields and the desk (item 6)

The app always sends all four fields; `submissions.ts` doesn't change, and the shared contract allows `""`.

| Field | Today | If blank, on the desk |
|---|---|---|
| `reporterName` | Required; sync refuses without it | Must stay required |
| `reporterAlias` | Form says "leave blank" | Row hidden. **No change: safe to remove the input** |
| `reporterRegion` | Optional ("recommended") | Detail panel shows "Region: —" (always rendered). Item card byline and context line lose it. Omitted from DOCX export |
| `reporterPhone` | Optional | Row hidden; omitted from DOCX export. **The desk loses its contact number for this reporter** |

- `firestore.rules` doesn't refer to any of these fields, so nothing blocks blank values.
- All four are plaintext top-level fields on the Firestore document (`SHARED_CONTEXT.md` lists this as an open issue). Collecting less also exposes less.

## 6. Cleanup findings (item 9)

**Unused `error` at `home.tsx:552`: it hides nothing.** `syncQueuedItem` saves the failed status and message before rethrowing, and the card shows them after reload. If the vault locked mid-send, the item stays `syncing` and resets to `queued` on the next start. Plan: use a bare `catch`.

**A real hidden failure is nearby.** The manual Sync button always shows "Up to date" (`home.tsx:395`), even if every item failed, because `syncPendingItems` swallows per-item errors. Plan: re-read the list and show a failure message. This only touches `home.tsx`.

**Another visible problem:** `sendErrorMessages.ts:21` can show "Supabase Storage upload failed: {reason}", and raw messages can reach the card. Plan: map these to translated plain wording at display time, leaving the stored error unchanged.

**`ATTACHMENT_RELAY`: unused.** Only `src/lib/env/attachmentRelayEnv.ts` reads it, and nothing imports that file. `SHARED_CONTEXT.md` also says it's dead.
- Remove from `.env.local`: `EXPO_PUBLIC_ATTACHMENT_RELAY_BASE`, `EXPO_PUBLIC_ATTACHMENT_RELAY_KEY`.
- EAS variables for you to delete: those two, plus the typo `XPO_PUBLIC_SUPABASE_ANON_KEY`.
- Delete `attachmentRelayEnv.ts`, since it has no importers.
- `functions/` isn't touched. If the relay function is deployed, it's still live with its own secret; I can't tell from here.

**Autosave:** the editor updates an in-memory snapshot on every change and writes to the vault after 1.5 seconds without typing.

| Moment | Can typed text be lost? |
|---|---|
| Panic from the editor | No: flushes the snapshot before anything else |
| Lock from the editor | Should not. `lockNow` calls `router.replace` before the flush, which reads the snapshot synchronously right after. This relies on React not unmounting the editor in between. Add it to the device tests |
| Language switch | Settings can't be opened from the editor, so what's saved is what autosave already wrote |
| **Leaving the editor (back) within 1.5 seconds** | **Yes.** The unmount cancels the timer and clears the snapshot. See D4 |

## 7. Other findings, not in the brief

- **Draft content in route params:** `home.tsx:464-465` passes draft title and body as URL params, against the comment at `home.tsx:67`. `report/review` and `report/upload` also use `title`/`body` params. Editor resume loads from the vault anyway. Removing them from Home is simple; the others need a closer look.
- **Sending takes many steps:** write → Preview → Mark Ready → Add to Pending → Sync Now, with labels like SAVED, READY, PENDING, NOT SYNCED. See D6.
- **Package ID visible:** Android App Info shows `com.blueteamafrica.securereporterapp` even with the name "My Notes". You decided not to change it; this is the remaining visible trace.
- **`receipts` stub:** unlinked, but reachable by deep link (`securereporterapp://receipts`) and showing "Receipts Screen". Keep it out of the strings work, or delete it (needs a one-line `_layout.tsx` removal).
- **`@expo/vector-icons`:** currently only a transitive dependency; add it directly for the notebook icon.
- **`CLAUDE.md` is out of date** on crypto and PIN, as you noted. Not part of this phase.

## 8. Decisions needed

- **D1, current cover PIN check.** (a) Add a small read-only `checkPin` to the vault, which needs your approval as a vault change; recommended, and it also stops a wrong erase PIN closing the session. (b) Close the session, unlock with the cover PIN, then ask for the real PIN to return; no vault change, but clumsy and riskier. (c) Don't ask for the current cover PIN, relying on the open real session; simplest, but differs from your decision.
- **D2, region and phone.** (a) Remove both from the app, so the desk gets `""`; recommended, as it fits your one-field decision and collects less, but the desk loses its contact number. (b) Keep both as optional.
- **D3, "Protected" overlay.** Allow a text-only change in `_layout.tsx`? Recommended: yes, and show "My Notes" instead, since "Protected" may look suspicious in the recents screen.
- **D4, editor exit loss.** Save on leaving the editor instead of discarding? Recommended: yes. It's an editor-only change, but paths that intentionally clear the draft must clear the snapshot first.
- **D5, keypad in RTL.** Still open from the spike. Recommended: keep `1 2 3` in the same place in both languages, so PIN muscle memory survives a language change.
- **D6, send steps.** Keep all the steps and only translate them, or reduce them for a non-technical reporter? Recommended: translate only in this phase, and reassess after the first reporter test, because the flow touches queue states.

## 9. Risks

1. **The band changes tested `_layout.tsx` layout.** Lock and panic logic stay the same, but the panic and lock device tests must be rerun in both directions.
2. **A smaller gesture zone** (200dp or less) than was tested.
3. **Sample-note seeding is a new setup step** that briefly opens the cover session, then reopens the real one. If the app is backgrounded in that window, it must close the session, as `unlock.tsx:94` already does.
4. **Embedded Cairo and `expo-system-ui` change the native build,** so the spike's APK is no longer a valid baseline.
5. **Arabic quality depends on your review.** My drafts could read unnaturally to a Sudanese reporter.
6. **Tombstone count isn't exact:** a failed tombstone write is ignored (`drafts.ts`), so the count could read low. The item itself would have been delivered.
7. **Screen-by-screen text changes touch almost every UI file,** so a mistake could change behaviour; each step keeps the logic untouched and is reviewed by diff.

## 10. Not verified

- All audit positions are calculated, not measured; Arabic label widths are unknown until Cairo is in.
- The status bar cause is a hypothesis.
- `expo-font` embedding of Cairo under the planned family names.
- Lock-path flush ordering on a device.
- Spike device results: I'm relying on your statement that forceRTL + reloadAsync is tested; I haven't seen the results.
- Whether the relay function is deployed.
- iOS: not reviewed.
