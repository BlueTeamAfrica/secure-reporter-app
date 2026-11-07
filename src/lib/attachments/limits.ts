/**
 * Largest file that can be added (M3): 20 MB. Checked when the file is added.
 *
 * Why 20 MB: sending reads the whole file into JS as base64 (~1.33x), decodes it (1x), and
 * React Native converts the bytes back to base64 for the native request (~1.33x), then Java
 * holds that string and the bytes. For 20 MB that peaks around 95 MB in JS and ~75 MB on the
 * Java heap: within what Android phones allow one app. Larger files risk an out-of-memory crash
 * that would repeat on every Home open (Home sends automatically). Estimate; device test pending.
 */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_FILE_MB = 20;

/** Unknown size (0 or missing) is not "too large" here; the copied file is measured instead. */
export function isTooLarge(sizeBytes: number | null | undefined): boolean {
  return typeof sizeBytes === "number" && sizeBytes > MAX_FILE_BYTES;
}
