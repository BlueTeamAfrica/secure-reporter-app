let sessionPin: string | null = null;
let unlockedAt: number | null = null;
let sessionMode: "real" | "decoy" | null = null;

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

export function setSessionPin(pin: string) {
  sessionPin = pin;
  unlockedAt = Date.now();
  sessionMode = "real";
}

export function getSessionPin() {
  return sessionMode === "real" ? sessionPin : null;
}

export function clearSessionPin() {
  sessionPin = null;
  unlockedAt = null;
  sessionMode = null;
  setDocumentPickerTransientActive(false);
}

export function isSessionUnlocked() {
  return sessionMode === "real" ? !!sessionPin : sessionMode === "decoy";
}

export function isDecoySession() {
  return sessionMode === "decoy";
}

export function setDecoySession() {
  sessionPin = null;
  unlockedAt = Date.now();
  sessionMode = "decoy";
}

export function hasSessionTimedOut() {
  if (!sessionMode || !unlockedAt) return true;
  if (sessionMode === "real" && !sessionPin) return true;
  return Date.now() - unlockedAt > SESSION_TIMEOUT_MS;
}

export function refreshSession() {
  if (sessionPin) {
    unlockedAt = Date.now();
  }
}

export function isDocumentPickerTransientActive() {
  return documentPickerTransientActive;
}

/**
 * Marks that the OS document picker is about to cover the app. While true, AppState
 * inactive/background from that UI must not clear the PIN (false-positive lock).
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
