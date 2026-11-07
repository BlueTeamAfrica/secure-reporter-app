/**
 * Reads the answer to "create document submissions/<id>". Pure, so it is tested.
 * - 2xx with the document name: received.
 * - 409 ALREADY_EXISTS: an earlier attempt of this same item was received (the id is random
 *   and belongs to this item only), so it counts as received too.
 * - Anything else: not received (the caller marks the item not sent, and it stays waiting).
 */
export type FirestoreReceipt =
  | { received: true; serverSubmissionId: string; alreadyExisted: boolean }
  | { received: false; reason: string };

export function interpretCreateResponse(
  httpStatus: number,
  bodyText: string,
  expectedDocumentName: string,
  expectedClientSubmissionId: string,
): FirestoreReceipt {
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    parsed = null;
  }
  const p = (parsed ?? {}) as {
    name?: unknown;
    fields?: { clientSubmissionId?: { stringValue?: unknown } };
    error?: { status?: unknown };
  };

  if (httpStatus === 409 || p.error?.status === "ALREADY_EXISTS") {
    return { received: true, serverSubmissionId: expectedDocumentName, alreadyExisted: true };
  }
  if (httpStatus < 200 || httpStatus >= 300) {
    return { received: false, reason: `Firestore REST write failed (${httpStatus})` };
  }
  if (typeof p.name !== "string" || !p.name) {
    return { received: false, reason: "Server receipt missing (no Firestore document id returned)" };
  }
  if (!p.name.endsWith(`/${expectedDocumentName.split("/").pop()}`)) {
    return { received: false, reason: "Server receipt document id mismatch" };
  }
  const echoed = p.fields?.clientSubmissionId?.stringValue;
  if (typeof echoed === "string" && echoed !== expectedClientSubmissionId) {
    return { received: false, reason: "Server receipt clientSubmissionId mismatch" };
  }
  return { received: true, serverSubmissionId: p.name, alreadyExisted: false };
}
