/**
 * One-off: POST a minimal submission and print top-level Firestore field keys + reporter values
 * from the create response.
 *
 * Run: `npx tsx scripts/verify-reporter-firestore-fields.mts`
 * Requires `.env.local` with EXPO_PUBLIC_FIREBASE_* and EXPO_PUBLIC_SUBMISSION_PAYLOAD_SECRET.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnvLocal() {
  const envPath = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) {
    console.error("Missing .env.local — skip live Firestore verification.");
    process.exit(2);
  }
  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

loadEnvLocal();

const { uploadEncryptedSubmission } = await import("../src/lib/submissions.ts");

const now = new Date().toISOString();
const submissionId = `verify-reporter-${Date.now()}`;
const reportId = "verify-local-report";

const payload = {
  schemaVersion: 2 as const,
  submissionId,
  reportId,
  title: "Verification submission",
  body: "Reporter metadata field smoke test.",
  workflowStatus: "queued" as const,
  createdAt: now,
  updatedAt: now,
  attachments: [],
};

const secret = process.env.EXPO_PUBLIC_SUBMISSION_PAYLOAD_SECRET ?? "";
if (!secret) {
  console.error("Missing EXPO_PUBLIC_SUBMISSION_PAYLOAD_SECRET");
  process.exit(1);
}

const reporter = {
  reporterName: "Verify Reporter",
  reporterRegion: "Test Region",
  reporterPhone: "+10000000000",
  reporterAlias: "",
};

const result = await uploadEncryptedSubmission(payload, secret, reporter);
console.log("Firestore document:", result.firestoreId ?? "(unknown)");
console.log("Top-level field keys:", result.createdFieldKeys.sort().join(", "));

for (const k of ["reporterName", "reporterRegion", "reporterPhone", "reporterAlias"] as const) {
  if (!result.createdFieldKeys.includes(k)) {
    console.error("Missing top-level field:", k);
    process.exit(1);
  }
}

console.log("Reporter metadata fields present on create response.");
