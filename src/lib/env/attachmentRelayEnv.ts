import { Platform } from "react-native";

let startupLogged = false;

function validateRelayBaseUrl(base: string): void {
  if (!/^https?:\/\//i.test(base)) {
    throw new Error(
      "EXPO_PUBLIC_ATTACHMENT_RELAY_BASE must start with http:// or https:// (e.g. http://192.168.1.10:5001/your-project-id/us-central1 for LAN + emulator)."
    );
  }

  if (/^https?:\/\/(127\.0\.0\.1|localhost)\b/i.test(base) && Platform.OS !== "web") {
    console.warn(
      "[relay:env] Base URL uses loopback (127.0.0.1/localhost). A physical device cannot reach your Mac that way. Use your machine's LAN IP, e.g. http://192.168.x.x:5001/<PROJECT_ID>/us-central1"
    );
  }
}

/**
 * Logs relay env once at startup (safe: does not print the full secret).
 * Call from root layout after the JS bundle loads.
 */
export function logAttachmentRelayEnvOnce(): void {
  if (startupLogged) return;
  startupLogged = true;

  const rawBase = process.env.EXPO_PUBLIC_ATTACHMENT_RELAY_BASE?.trim() ?? "";
  const rawKey = process.env.EXPO_PUBLIC_ATTACHMENT_RELAY_KEY?.trim() ?? "";

  console.log("[relay:env] startup check", {
    platform: Platform.OS,
    EXPO_PUBLIC_ATTACHMENT_RELAY_BASE: rawBase || "(missing)",
    EXPO_PUBLIC_ATTACHMENT_RELAY_KEY: rawKey ? "(set, hidden)" : "(missing)",
  });

  if (!rawBase) return;

  try {
    validateRelayBaseUrl(rawBase);
    const normalized = rawBase.replace(/\/+$/, "");
    console.log("[relay:env] base normalized for use", {
      length: normalized.length,
      prefix: normalized.slice(0, 96),
      trailingSlashStripped: normalized.length < rawBase.length,
    });
  } catch (e) {
    console.error("[relay:env] EXPO_PUBLIC_ATTACHMENT_RELAY_BASE invalid:", e);
  }
}

export function getValidatedAttachmentRelayBaseUrl(): string {
  const raw = process.env.EXPO_PUBLIC_ATTACHMENT_RELAY_BASE?.trim() ?? "";
  if (!raw) {
    throw new Error(
      "Missing EXPO_PUBLIC_ATTACHMENT_RELAY_BASE. For a phone hitting the Functions emulator, use http://<YOUR_LAN_IP>:5001/<FIREBASE_PROJECT_ID>/us-central1 (no trailing slash)."
    );
  }
  validateRelayBaseUrl(raw);
  return raw.replace(/\/+$/, "");
}

export function getAttachmentRelaySecret(): string {
  const key = process.env.EXPO_PUBLIC_ATTACHMENT_RELAY_KEY?.trim() ?? "";
  if (!key) {
    throw new Error(
      "Missing EXPO_PUBLIC_ATTACHMENT_RELAY_KEY (must match Cloud Function env REPORTER_ATTACHMENT_UPLOAD_SECRET)"
    );
  }
  return key;
}
