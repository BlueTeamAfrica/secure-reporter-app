import { randomUUID } from "crypto";
import * as logger from "firebase-functions/logger";
import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

admin.initializeApp();

const UPLOAD_KEY_HEADERS = ["x-upload-key", "x-reporter-upload-key"] as const;

type RelayStage =
  | "request_received"
  | "auth_validated"
  | "body_parse_start"
  | "body_parsed"
  | "fields_validated"
  | "decode_start"
  | "decode_done"
  | "bucket_resolved"
  | "file_ref_created"
  | "upload_start"
  | "upload_complete"
  | "download_url_start"
  | "download_url_complete"
  | "response_sent";

function getUploadSecret(): string {
  const s = process.env.REPORTER_ATTACHMENT_UPLOAD_SECRET?.trim();
  return s ?? "";
}

function getUploadKeyFromHeaders(req: {
  headers: Record<string, string | string[] | undefined>;
}): string | undefined {
  for (const key of UPLOAD_KEY_HEADERS) {
    const raw = req.headers[key];
    const got = Array.isArray(raw) ? raw[0] : raw;
    if (typeof got === "string" && got.trim()) return got.trim();
  }
  return undefined;
}

function assertAuthorized(req: { headers: Record<string, string | string[] | undefined> }): boolean {
  const got = getUploadKeyFromHeaders(req);
  const want = getUploadSecret();
  if (!want || !got) return false;
  return got === want;
}

function isValidClientStoragePath(p: string): boolean {
  if (!p || p.includes("..")) return false;
  return /^submissions\/[^/]+\/attachments\/[^/]+$/.test(p);
}

function readFirebaseConfig(): Record<string, unknown> {
  const raw = process.env.FIREBASE_CONFIG;
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function normalizeBucketName(name: string): string {
  const t = name.trim();
  if (!t) return "";
  if (t.startsWith("gs://")) return t.slice("gs://".length);
  return t;
}

function resolveProjectId(): string {
  const fromEnv = process.env.GCLOUD_PROJECT?.trim() || process.env.GCP_PROJECT?.trim() || "";
  if (fromEnv) return fromEnv;
  const cfg = readFirebaseConfig();
  const fromCfg = typeof cfg.projectId === "string" ? cfg.projectId.trim() : "";
  if (fromCfg) return fromCfg;
  const fromAdmin = (admin.app().options as { projectId?: string }).projectId?.trim() ?? "";
  return fromAdmin;
}

function resolveStorageBucketName(): string {
  // Order matters: explicit env override first, then FIREBASE_CONFIG, then admin app options,
  // and finally a conservative fallback for this repo (based on Expo config).
  const envBucket = normalizeBucketName(process.env.FIREBASE_STORAGE_BUCKET ?? "");
  if (envBucket) return envBucket;

  const cfg = readFirebaseConfig();
  const cfgBucket =
    typeof cfg.storageBucket === "string" ? normalizeBucketName(cfg.storageBucket) : "";
  if (cfgBucket) return cfgBucket;

  const fromAdmin = normalizeBucketName(
    (admin.app().options as { storageBucket?: string }).storageBucket ?? ""
  );
  if (fromAdmin) return fromAdmin;

  // Repo-known bucket (from `.env.local` used by the app). This keeps local dev unblocked
  // if the emulator isn't injecting FIREBASE_CONFIG properly.
  return "sudanfcts-reporting.firebasestorage.app";
}

/**
 * Firebase Functions HTTPS handlers run on an Express-style `req/res`.
 * In the emulator/framework, the request stream may already be consumed and
 * `req.body` / `req.rawBody` is the reliable source of truth.
 */
function readJsonBodyExpress(req: {
  body?: unknown;
  rawBody?: Buffer;
}): unknown {
  if (req.body != null) return req.body;
  const raw = req.rawBody ? req.rawBody.toString("utf8") : "";
  if (!raw.trim()) return null;
  return JSON.parse(raw);
}

type RelayJsonBody = {
  storagePath?: unknown;
  fileName?: unknown;
  mimeType?: unknown;
  base64?: unknown;
};

function nowMs() {
  return Date.now();
}

function logStage(
  stage: RelayStage,
  t0: number,
  meta?: Record<string, unknown>
): void {
  logger.info("attachmentRelay: stage", {
    stage,
    elapsedMs: nowMs() - t0,
    ...meta,
  });
}

async function withTimeout<T>(label: string, ms: number, p: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      p,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label}_timeout_${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * JSON + base64 relay: app sends base64 file bytes; server writes to Firebase Storage (Admin SDK).
 */
export const attachmentRelay = onRequest(
  {
    cors: true,
    memory: "512MiB",
    timeoutSeconds: 120,
  },
  async (req, res) => {
    const t0 = nowMs();
    logStage("request_received", t0, {
      method: req.method,
      contentType: req.headers["content-type"],
      contentLength: req.headers["content-length"],
    });

    if (req.method !== "POST") {
      res.status(405).json({ error: "method_not_allowed" });
      return;
    }

    if (!assertAuthorized(req)) {
      logger.warn("attachmentRelay: unauthorized");
      res.status(401).json({ error: "unauthorized", stage: "auth" });
      return;
    }
    logStage("auth_validated", t0);

    let stage: "parse" | "storage" | "metadata" = "parse";

    try {
      const debug = typeof req.query.debug === "string" ? req.query.debug : "";
      // Debug checkpoints:
      // - debug=parse: parse + validate only; no decode, no storage write
      // - debug=decode: parse + validate + base64 decode; no storage write
      // - debug=nostore: full parse + decode, but skip storage write

      logStage("body_parse_start", t0, { debug: debug || undefined });
      const rawBody = readJsonBodyExpress(req) as RelayJsonBody | null;
      logStage("body_parsed", t0, {
        hasBody: !!rawBody,
        bodyType: rawBody === null ? "null" : typeof rawBody,
        bodyKeys: rawBody && typeof rawBody === "object" ? Object.keys(rawBody as Record<string, unknown>) : [],
      });
      const storagePath =
        typeof rawBody?.storagePath === "string" ? rawBody.storagePath.trim() : "";
      const fileName = typeof rawBody?.fileName === "string" ? rawBody.fileName.trim() : "";
      const mimeTypeRaw = typeof rawBody?.mimeType === "string" ? rawBody.mimeType.trim() : "";
      const base64Raw = typeof rawBody?.base64 === "string" ? rawBody.base64.trim() : "";

      if (!storagePath || !fileName || !mimeTypeRaw || !base64Raw) {
        res.status(400).json({
          error: "missing_fields",
          stage: "parse",
          need: ["storagePath", "fileName", "mimeType", "base64"],
        });
        return;
      }

      if (!isValidClientStoragePath(storagePath)) {
        res.status(400).json({ error: "invalid_storage_path", stage: "parse" });
        return;
      }

      const mimeType = mimeTypeRaw.slice(0, 200) || "application/octet-stream";
      logStage("fields_validated", t0, {
        fileName,
        mimeType,
        base64Length: base64Raw.length,
        storagePath,
      });

      if (debug === "parse") {
        const uploadedAt = new Date().toISOString();
        res.status(200).json({
          id: "",
          name: fileName,
          mimeType,
          size: 0,
          storagePath,
          downloadUrl: "",
          uploadedAt,
          debug: "parse",
        });
        logStage("response_sent", t0, { debug: "parse" });
        return;
      }

      let fileBuffer: Buffer;
      try {
        logStage("decode_start", t0);
        fileBuffer = Buffer.from(base64Raw, "base64");
      } catch {
        res.status(400).json({ error: "invalid_base64", stage: "parse" });
        return;
      }
      logStage("decode_done", t0, { decodedByteLength: fileBuffer.length });

      if (!fileBuffer.length) {
        res.status(400).json({ error: "empty_decoded_file", stage: "parse" });
        return;
      }

      if (debug === "decode") {
        const uploadedAt = new Date().toISOString();
        res.status(200).json({
          id: "",
          name: fileName,
          mimeType,
          size: fileBuffer.length,
          storagePath,
          downloadUrl: "",
          uploadedAt,
          debug: "decode",
        });
        logStage("response_sent", t0, { debug: "decode" });
        return;
      }

      stage = "storage";
      const projectId = resolveProjectId();
      const bucketName = resolveStorageBucketName();
      const bucket = admin.storage().bucket(bucketName);
      logStage("bucket_resolved", t0, {
        projectId: projectId || "(unknown)",
        bucketName,
        storagePath,
      });
      const file = bucket.file(storagePath);
      logStage("file_ref_created", t0, { storagePath });
      const downloadToken = randomUUID();

      if (debug === "nostore") {
        const uploadedAt = new Date().toISOString();
        res.status(200).json({
          id: "",
          name: fileName,
          mimeType,
          size: fileBuffer.length,
          storagePath,
          downloadUrl: "",
          uploadedAt,
          debug: "nostore",
        });
        logStage("response_sent", t0, { debug: "nostore" });
        return;
      }

      logStage("upload_start", t0, { bytes: fileBuffer.length });
      await withTimeout(
        "storage_file_save",
        60_000,
        file.save(fileBuffer, {
          resumable: false,
          metadata: {
            contentType: mimeType,
            metadata: {
              firebaseStorageDownloadTokens: downloadToken,
            },
          },
        })
      );
      logStage("upload_complete", t0);

      stage = "metadata";
      logStage("download_url_start", t0);
      const encodedPath = encodeURIComponent(storagePath);
      const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}?alt=media&token=${downloadToken}`;
      const uploadedAt = new Date().toISOString();
      logStage("download_url_complete", t0);

      logger.info("attachmentRelay: uploaded", { storagePath, size: fileBuffer.length });

      res.status(200).json({
        id: "",
        name: fileName,
        mimeType,
        size: fileBuffer.length,
        storagePath,
        downloadUrl,
        uploadedAt,
      });
      logStage("response_sent", t0);
    } catch (err) {
      logger.error("attachmentRelay: failed", { stage, err });
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message, stage });
    }
  }
);

/**
 * Deletes Storage objects after a partial client-side send failure (best-effort).
 */
export const attachmentRollback = onRequest({ cors: true, timeoutSeconds: 60 }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  if (!assertAuthorized(req)) {
    res.status(401).json({ error: "unauthorized", stage: "auth" });
    return;
  }

  const stage = "storage_delete";

  try {
    const body = readJsonBodyExpress(req) as { paths?: string[] } | null;
    const paths = Array.isArray(body?.paths) ? body!.paths!.filter((p) => typeof p === "string") : [];
    if (!paths.length) {
      res.status(400).json({ error: "missing_paths", stage: "parse" });
      return;
    }

    const bucket = admin.storage().bucket();
    await Promise.all(
      paths.map(async (path) => {
        try {
          await bucket.file(path).delete({ ignoreNotFound: true });
        } catch (e) {
          logger.warn("attachmentRollback: delete failed", path, e);
        }
      })
    );

    logger.info("attachmentRollback: ok", { count: paths.length });
    res.status(200).json({ ok: true, deleted: paths.length });
  } catch (err) {
    logger.error("attachmentRollback: failed", { stage, err });
    res.status(500).json({ error: err instanceof Error ? err.message : String(err), stage });
  }
});

// New-submission alert (bell + email to desk owners/admins). See newSubmissionAlert.ts.
export { notifyNewSubmission } from "./newSubmissionAlert";
