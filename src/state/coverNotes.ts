/**
 * Notes app shown in the cover session, stored in the cover vault's "notes" record. Pure
 * (takes the vault as an argument) so the rules are tested against the real vault code.
 *
 * Sample notes:
 * - Added the first time the cover opens (cover PIN or panic), never during setup, so setup
 *   and the real vault never hold them.
 * - Added at most once: the record is null until then, and the samples are written by one
 *   vault.update (a single storage write inside the vault's queue) only while it is still
 *   null. An interrupted first open leaves it null, so the next open adds them; after that
 *   the record is never null again, even when every note is deleted.
 */
import type { Vault } from "../lib/vault/vault";

export type CoverNote = { id: string; title: string; body: string; updatedAt: string };
export type SampleNote = { title: string; body: string };
type Store = { v: 1; notes: CoverNote[] };
type VaultLike = Pick<Vault, "get" | "update">;

/**
 * Minutes before the first open: spread out so the notes don't look created at one moment.
 * Kept within a few hours so they rarely predate installing the app.
 */
export const SAMPLE_AGE_MINUTES = [9, 47, 133, 318] as const;

export const newNoteId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

function isNote(v: unknown): v is CoverNote {
  if (!v || typeof v !== "object") return false;
  const n = v as Record<string, unknown>;
  return (
    typeof n.id === "string" && typeof n.title === "string" && typeof n.body === "string" && typeof n.updatedAt === "string"
  );
}

/** Any non-null value counts as "already opened" (never re-seeded); bad entries are dropped. */
function asStore(value: unknown): Store {
  if (value && typeof value === "object" && Array.isArray((value as Store).notes)) {
    return { v: 1, notes: (value as Store).notes.filter(isNote) };
  }
  return { v: 1, notes: [] };
}

const newestFirst = (notes: CoverNote[]) =>
  [...notes].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));

export function sampleStore(samples: readonly SampleNote[], now: number, makeId: () => string = newNoteId): Store {
  return {
    v: 1,
    notes: samples.map((s, i) => ({
      id: makeId(),
      title: s.title,
      body: s.body,
      updatedAt: new Date(now - (SAMPLE_AGE_MINUTES[i] ?? 400 + i * 60) * 60_000).toISOString(),
    })),
  };
}

/** Notes for the cover screen, newest first. Adds the samples on the very first open only. */
export async function openCoverNotes(
  vault: VaultLike,
  samples: readonly SampleNote[],
  now: number = Date.now(),
  makeId: () => string = newNoteId,
): Promise<CoverNote[]> {
  const current = await vault.get<unknown>("notes");
  if (current !== null) return newestFirst(asStore(current).notes);
  const stored = await vault.update<unknown>("notes", (latest) =>
    latest !== null ? latest : sampleStore(samples, now, makeId),
  );
  return newestFirst(asStore(stored).notes);
}

/** Adds or replaces a note (by id). Returns the notes, newest first. */
export async function saveCoverNote(vault: VaultLike, note: CoverNote): Promise<CoverNote[]> {
  const stored = await vault.update<unknown>("notes", (current) => {
    const store = asStore(current);
    return { v: 1, notes: [note, ...store.notes.filter((n) => n.id !== note.id)] };
  });
  return newestFirst(asStore(stored).notes);
}

export async function deleteCoverNote(vault: VaultLike, id: string): Promise<CoverNote[]> {
  const stored = await vault.update<unknown>("notes", (current) => {
    const store = asStore(current);
    return { v: 1, notes: store.notes.filter((n) => n.id !== id) };
  });
  return newestFirst(asStore(stored).notes);
}
