/**
 * Session state. No PIN is ever held here (or anywhere): the vault holds the unlocked
 * vault's data key in memory, and its presence IS the session. This module only adds the
 * inactivity clock and the document-picker guard.
 *
 * - "real"  : the real vault is open (drafts, queue, profile readable).
 * - "cover" : the cover vault is open; real data is cryptographically unreachable.
 * - null    : locked; no data key in memory.
 */
import { getVault } from "../lib/vault/expoStorage";
import type { VaultKind } from "../lib/vault/vault";

let unlockedAt: number | null = null;

/** True while system document picker is presented (transient inactive/background). */
let documentPickerTransientActive = false;
let documentPickerGuardTimeout: ReturnType<typeof setTimeout> | null = null;

const DOCUMENT_PICKER_GUARD_MAX_MS = 3 * 60 * 1000;

export const SESSION_TIMEOUT_MS = 2 * 60 * 1000;

let onUserInteractionHook: null | (() => void) = null;

/** Set by root layout to reset inactivity timers without importing UI code into state modules. */
export function setOnUserInteractionHook(fn: null | (() => void)) {
  onUserInteractionHook = fn;
}

/**
 * Call on any meaningful user activity (typing, scrolling, taps).
 * - Refreshes session timeout
 * - Resets inactivity lock timers
 */
export function notifyUserInteraction() {
  refreshSession();
  try {
    onUserInteractionHook?.();
  } catch {
    // ignore
  }
}

/** Call right after a successful vault unlock or createVaults. Starts the inactivity clock. */
export function markSessionStarted() {
  unlockedAt = Date.now();
}

export function getSessionKind(): VaultKind | null {
  return getVault().currentKind();
}

/** The real vault is open. Every read or write of drafts, queue or profile requires this. */
export function isRealSession() {
  return getSessionKind() === "real";
}

export function isDecoySession() {
  return getSessionKind() === "cover";
}

export function isSessionUnlocked() {
  return getSessionKind() !== null;
}

/**
 * Locks: overwrites the in-memory data key (vault.lock()) and stops the clock. Callers that
 * need to flush the working draft or clean up attachments must do so BEFORE this.
 */
export function endSession() {
  getVault().lock();
  unlockedAt = null;
  setDocumentPickerTransientActive(false);
}

/**
 * Panic: real session -> cover session without a PIN (vault.enterCoverFromReal). Callers flush
 * the working draft and clean up attachments BEFORE this, while the real vault is still open.
 * Throws if refused or failed; on failure the vault is locked, so callers route to /unlock.
 */
export async function switchToCoverSession() {
  try {
    await getVault().enterCoverFromReal();
  } catch (e) {
    endSession();
    throw e;
  }
  markSessionStarted();
  setDocumentPickerTransientActive(false);
}

export function hasSessionTimedOut() {
  if (!isSessionUnlocked() || !unlockedAt) return true;
  return Date.now() - unlockedAt > SESSION_TIMEOUT_MS;
}

/** Same clock for real and cover sessions, so the two behave identically. */
export function refreshSession() {
  if (isSessionUnlocked()) {
    unlockedAt = Date.now();
  }
}

export function isDocumentPickerTransientActive() {
  return documentPickerTransientActive;
}

/**
 * Marks that the OS document picker is about to cover the app. While true, AppState
 * inactive/background from that UI must not lock (false-positive lock).
 */
export function setDocumentPickerTransientActive(active: boolean) {
  if (documentPickerGuardTimeout) {
    clearTimeout(documentPickerGuardTimeout);
    documentPickerGuardTimeout = null;
  }

  documentPickerTransientActive = active;

  if (active) {
    documentPickerGuardTimeout = setTimeout(() => {
      documentPickerGuardTimeout = null;
      if (documentPickerTransientActive) {
        console.warn(
          "[session] document picker guard cleared by timeout (picker did not settle)"
        );
        documentPickerTransientActive = false;
      }
    }, DOCUMENT_PICKER_GUARD_MAX_MS);
  }
}
