import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { describe, it } from "node:test";

import { makeVault, VaultError, type Vault, type VaultStorage } from "../lib/vault/vault.ts";
import { TABLES } from "../i18n/strings.ts";
import { deleteCoverNote, openCoverNotes, saveCoverNote, SAMPLE_AGE_MINUTES } from "./coverNotes.ts";

const REAL_PIN = "482916";
const COVER_PIN = "7351";
const SAMPLES = TABLES.en.cover.samples;
const NOW = Date.UTC(2026, 10, 7, 15, 0);

function memoryStorage(): VaultStorage & { writes: number } {
  const blobs = new Map<string, string>();
  const secure = new Map<string, string>();
  const s = {
    writes: 0,
    get: async (k: string) => blobs.get(k) ?? null,
    set: async (k: string, v: string) => {
      s.writes++;
      blobs.set(k, v);
    },
    delete: async (k: string) => void blobs.delete(k),
    secureGet: async (k: string) => secure.get(k) ?? null,
    secureSet: async (k: string, v: string) => void secure.set(k, v),
    secureDelete: async (k: string) => void secure.delete(k),
  };
  return s;
}

async function freshInstall() {
  const storage = memoryStorage();
  const vault = makeVault({ storage, randomBytes: (n) => new Uint8Array(randomBytes(n)), kdfParams: { logN: 10, r: 8, p: 1 } });
  await vault.createVaults(REAL_PIN, COVER_PIN); // leaves a real session, as setup does
  return { vault, storage };
}

let idCounter = 0;
const ids = () => `id${++idCounter}`;

describe("cover notes: first-open samples", () => {
  it("setup does not add them: the cover record is empty until the cover opens", async () => {
    const { vault } = await freshInstall();
    vault.lock();
    await vault.unlock(COVER_PIN);
    assert.equal(await vault.get("notes"), null);
  });

  it("first open by cover PIN adds the samples once, in the chosen language, spread in time", async () => {
    const { vault } = await freshInstall();
    vault.lock();
    await vault.unlock(COVER_PIN);
    const notes = await openCoverNotes(vault, TABLES.ar.cover.samples, NOW, ids);
    assert.deepEqual(
      notes.map((n) => n.title),
      TABLES.ar.cover.samples.map((s) => s.title),
    );
    const ages = notes.map((n) => (NOW - Date.parse(n.updatedAt)) / 60_000);
    assert.deepEqual(ages, [...SAMPLE_AGE_MINUTES]);
    assert.equal(new Set(notes.map((n) => n.updatedAt)).size, notes.length, "no two at the same moment");
  });

  it("first open by panic (no PIN) adds them too, and they persist into later cover sessions", async () => {
    const { vault } = await freshInstall();
    await vault.enterCoverFromReal();
    const first = await openCoverNotes(vault, SAMPLES, NOW, ids);
    assert.equal(first.length, SAMPLES.length);
    vault.lock();
    await vault.unlock(COVER_PIN);
    assert.deepEqual(await openCoverNotes(vault, SAMPLES, NOW + 86_400_000, ids), first);
  });

  it("never adds them again: reopening, or after every note was deleted", async () => {
    const { vault } = await freshInstall();
    await vault.enterCoverFromReal();
    const notes = await openCoverNotes(vault, SAMPLES, NOW, ids);
    assert.equal((await openCoverNotes(vault, SAMPLES, NOW, ids)).length, SAMPLES.length);
    let left = notes;
    for (const n of notes) left = await deleteCoverNote(vault, n.id);
    assert.deepEqual(left, []);
    vault.lock();
    await vault.unlock(COVER_PIN);
    assert.deepEqual(await openCoverNotes(vault, SAMPLES, NOW, ids), []);
  });

  it("an interrupted first open adds them on the next open, still only once", async () => {
    const { vault } = await freshInstall();
    await vault.enterCoverFromReal();
    let failNext = true;
    const flaky: Pick<Vault, "get" | "update"> = {
      get: (name) => vault.get(name),
      update: (name, fn) => {
        if (failNext) {
          failNext = false;
          return Promise.reject(new VaultError("LOCKED", "app closed mid-open"));
        }
        return vault.update(name, fn);
      },
    };
    await assert.rejects(openCoverNotes(flaky, SAMPLES, NOW, ids));
    assert.equal(await vault.get("notes"), null, "nothing half-written");
    assert.equal((await openCoverNotes(flaky, SAMPLES, NOW, ids)).length, SAMPLES.length);
    assert.equal((await openCoverNotes(flaky, SAMPLES, NOW, ids)).length, SAMPLES.length);
  });

  it("two opens racing still add one set", async () => {
    const { vault } = await freshInstall();
    await vault.enterCoverFromReal();
    const [a, b] = await Promise.all([
      openCoverNotes(vault, SAMPLES, NOW, ids),
      openCoverNotes(vault, SAMPLES, NOW, ids),
    ]);
    assert.equal(a.length, SAMPLES.length);
    assert.deepEqual(b, a);
  });

  it("the real vault can never hold them", async () => {
    const { vault } = await freshInstall();
    await assert.rejects(openCoverNotes(vault, SAMPLES, NOW, ids), (e) => e instanceof VaultError && e.code === "UNKNOWN_RECORD");
  });
});

describe("cover notes: editing", () => {
  it("create, edit and delete persist across cover sessions", async () => {
    const { vault } = await freshInstall();
    await vault.enterCoverFromReal();
    await openCoverNotes(vault, SAMPLES, NOW, ids);
    const note = { id: "mine", title: "Call", body: "Mum at 6", updatedAt: new Date(NOW + 1000).toISOString() };
    let notes = await saveCoverNote(vault, note);
    assert.equal(notes[0].id, "mine", "newest first");
    notes = await saveCoverNote(vault, { ...note, body: "Mum at 7", updatedAt: new Date(NOW + 2000).toISOString() });
    assert.equal(notes.filter((n) => n.id === "mine").length, 1, "edit replaces");
    vault.lock();
    await vault.unlock(COVER_PIN);
    notes = await openCoverNotes(vault, SAMPLES, NOW, ids);
    assert.equal(notes[0].body, "Mum at 7");
    notes = await deleteCoverNote(vault, "mine");
    assert.equal(notes.some((n) => n.id === "mine"), false);
    assert.equal(notes.length, SAMPLES.length);
  });
});
