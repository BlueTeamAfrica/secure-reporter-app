import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  LEGACY_ASYNC_KEYS,
  LEGACY_SECURE_MARKER_KEYS,
  LEGACY_SECURE_SHARED_KEYS,
  planLegacyWipe,
  type LegacyWipeStep,
} from "./legacyWipePlan.ts";

/** A fake device: legacy data, vault data, a preserved setting, and attachment files. */
function device(opts: { vault: boolean }) {
  const asyncStore = new Map<string, string>();
  const secure = new Map<string, string>();
  for (const k of LEGACY_ASYNC_KEYS) asyncStore.set(k, "old");
  for (const k of LEGACY_SECURE_MARKER_KEYS) secure.set(k, "old");
  for (const k of LEGACY_SECURE_SHARED_KEYS) secure.set(k, "1");
  secure.set("randomize_keypad", "true");
  if (opts.vault) {
    for (const k of ["vault_a", "vault_b", "vault_a_0", "vault_b_4"]) asyncStore.set(k, "vault-blob");
    secure.set("vault_s", "device-secret");
  }
  return { asyncStore, secure, folder: true, vault: opts.vault };
}

type Device = ReturnType<typeof device>;

function probe(d: Device) {
  return {
    presentAsyncKeys: LEGACY_ASYNC_KEYS.filter((k) => d.asyncStore.has(k)),
    presentSecureMarkers: LEGACY_SECURE_MARKER_KEYS.filter((k) => d.secure.has(k)),
    vaultInitialized: d.vault,
  };
}

function apply(d: Device, step: LegacyWipeStep) {
  if (step.kind === "deleteAttachmentFolder") d.folder = false;
  else if (step.kind === "deleteAsync") d.asyncStore.delete(step.key);
  else d.secure.delete(step.key);
}

describe("legacy wipe plan", () => {
  it("does nothing on a device without legacy data (fresh install or already wiped)", () => {
    assert.deepEqual(planLegacyWipe({ presentAsyncKeys: [], presentSecureMarkers: [], vaultInitialized: false }), []);
    assert.deepEqual(planLegacyWipe({ presentAsyncKeys: [], presentSecureMarkers: [], vaultInitialized: true }), []);
  });

  it("lockout counters alone are not legacy (the new app writes them too)", () => {
    // A new install with failed attempts has only the shared keys: no wipe.
    assert.deepEqual(planLegacyWipe({ presentAsyncKeys: [], presentSecureMarkers: [], vaultInitialized: true }), []);
    assert.ok(!LEGACY_SECURE_MARKER_KEYS.some((k) => (LEGACY_SECURE_SHARED_KEYS as readonly string[]).includes(k)));
  });

  it("wipes every legacy key and the folder, folder first and device_configured last", () => {
    const steps = planLegacyWipe({ presentAsyncKeys: ["draft_reports"], presentSecureMarkers: [], vaultInitialized: false });
    assert.deepEqual(steps[0], { kind: "deleteAttachmentFolder" });
    assert.deepEqual(steps.at(-1), { kind: "deleteSecure", key: "device_configured" });
    const keys = steps.flatMap((s) => (s.kind === "deleteAttachmentFolder" ? [] : [s.key]));
    for (const k of [...LEGACY_ASYNC_KEYS, ...LEGACY_SECURE_MARKER_KEYS, ...LEGACY_SECURE_SHARED_KEYS]) {
      assert.ok(keys.includes(k), `missing ${k}`);
    }
    // Markers come after every non-marker step.
    const firstMarker = steps.findIndex(
      (s) => s.kind !== "deleteAttachmentFolder" && [...LEGACY_ASYNC_KEYS, ...LEGACY_SECURE_MARKER_KEYS].includes(s.key as never),
    );
    const lastNonMarker = steps.findLastIndex(
      (s) => s.kind === "deleteAttachmentFolder" || (LEGACY_SECURE_SHARED_KEYS as readonly string[]).includes(s.key),
    );
    assert.ok(lastNonMarker < firstMarker);
  });

  it("never names a vault key or the preserved keypad setting", () => {
    for (const vaultInitialized of [false, true]) {
      const steps = planLegacyWipe({ presentAsyncKeys: [...LEGACY_ASYNC_KEYS], presentSecureMarkers: [...LEGACY_SECURE_MARKER_KEYS], vaultInitialized });
      for (const s of steps) {
        if (s.kind === "deleteAttachmentFolder") continue;
        assert.ok(!s.key.startsWith("vault_"), `vault key ${s.key}`);
        assert.notEqual(s.key, "randomize_keypad");
      }
    }
  });

  it("keeps the attachment folder once a vault exists (its files belong to the vault)", () => {
    const steps = planLegacyWipe({ presentAsyncKeys: ["draft_reports"], presentSecureMarkers: [], vaultInitialized: true });
    assert.ok(steps.length > 0);
    assert.ok(!steps.some((s) => s.kind === "deleteAttachmentFolder"));
  });

  it("is idempotent and crash-safe: a crash after any step is finished by the next start", () => {
    for (const vault of [false, true]) {
      const total = planLegacyWipe(probe(device({ vault }))).length;
      for (let crashAfter = 0; crashAfter <= total; crashAfter++) {
        const d = device({ vault });
        planLegacyWipe(probe(d)).slice(0, crashAfter).forEach((s) => apply(d, s));
        // Next start: plan again from what is left, run to completion, then a third start.
        planLegacyWipe(probe(d)).forEach((s) => apply(d, s));
        assert.deepEqual(planLegacyWipe(probe(d)), [], "nothing left to do");

        for (const k of LEGACY_ASYNC_KEYS) assert.ok(!d.asyncStore.has(k), `${k} survived (crash ${crashAfter})`);
        for (const k of LEGACY_SECURE_MARKER_KEYS) assert.ok(!d.secure.has(k));
        assert.equal(d.secure.get("randomize_keypad"), "true", "keypad setting kept");
        if (vault) {
          assert.equal(d.folder, true, "vault's attachment folder kept");
          assert.equal(d.secure.get("vault_s"), "device-secret");
          for (const k of ["vault_a", "vault_b", "vault_a_0", "vault_b_4"]) assert.equal(d.asyncStore.get(k), "vault-blob");
        } else if (crashAfter < total) {
          assert.equal(d.folder, false, "legacy attachment folder removed");
        }
      }
    }
  });
});
