/**
 * The item's submission id: random, created once and stored with the item. Used as the
 * Firestore document id and the storage folder, so a re-send can never create a second copy.
 * 32 lower-case hex characters (128 random bits). Pure.
 */
export function makeSubmissionId(randomBytes: (n: number) => Uint8Array): string {
  const bytes = randomBytes(16);
  if (!(bytes instanceof Uint8Array) || bytes.length !== 16) throw new Error("bad random source");
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function isSubmissionId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{32}$/.test(value);
}
