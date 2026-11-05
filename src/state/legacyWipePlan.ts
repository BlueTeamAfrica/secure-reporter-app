/**
 * One-time wipe of data written by app versions before the vault (decided: wipe on update,
 * no migration). Pure TypeScript, no React Native imports, so the decision is unit-tested.
 *
 * Rules:
 * - Runs only if a legacy MARKER exists (a key only the old app ever wrote).
 * - Never names a vault key, and never deletes the attachment folder once a vault exists
 *   (its files would then belong to the vault's drafts).
 * - Order makes it idempotent and crash-safe: folder first, then non-marker keys, markers last.
 *   If the app dies mid-wipe, a marker is still present and the next start finishes the job.
 * - randomize_keypad (a UI preference, not data) is kept.
 */

/** AsyncStorage keys written only by the pre-vault app. */
export const LEGACY_ASYNC_KEYS = [
  "draft_reports",
  "purge_tombstones",
  "working_report_buffer",
  "reporter_profile_v1",
] as const;

/** SecureStore keys written only by the pre-vault app. */
export const LEGACY_SECURE_MARKER_KEYS = [
  "device_configured",
  "device_pin_hash",
  "device_decoy_pin_hash",
  "reporter_profile_device_key",
] as const;

/**
 * SecureStore keys the old app wrote that the new app ALSO uses (lockout counters). They are
 * not markers (the new app writes them too), but they are reset as part of a legacy wipe.
 */
export const LEGACY_SECURE_SHARED_KEYS = ["device_failed_attempts", "device_lockout_until"] as const;

/** Kept across the wipe. */
export const PRESERVED_SECURE_KEYS = ["randomize_keypad"] as const;

export type LegacyProbe = {
  /** Legacy AsyncStorage keys that currently hold a value. */
  presentAsyncKeys: readonly string[];
  /** Legacy SecureStore marker keys that currently hold a value. */
  presentSecureMarkers: readonly string[];
  /** vault.isInitialized() */
  vaultInitialized: boolean;
};

export type LegacyWipeStep =
  | { kind: "deleteAttachmentFolder" }
  | { kind: "deleteAsync"; key: string }
  | { kind: "deleteSecure"; key: string };

/** Ordered steps; empty when there is nothing legacy on the device. */
export function planLegacyWipe(probe: LegacyProbe): LegacyWipeStep[] {
  const legacyPresent = probe.presentAsyncKeys.length > 0 || probe.presentSecureMarkers.length > 0;
  if (!legacyPresent) return [];

  const steps: LegacyWipeStep[] = [];
  if (!probe.vaultInitialized) steps.push({ kind: "deleteAttachmentFolder" });
  for (const key of LEGACY_SECURE_SHARED_KEYS) steps.push({ kind: "deleteSecure", key });
  // Markers last, AsyncStorage before SecureStore (device_configured is the final one).
  for (const key of LEGACY_ASYNC_KEYS) steps.push({ kind: "deleteAsync", key });
  for (const key of [...LEGACY_SECURE_MARKER_KEYS].reverse()) steps.push({ kind: "deleteSecure", key });
  return steps;
}
