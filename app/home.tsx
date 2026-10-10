import { useCallback, useMemo, useRef, useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { router, useFocusEffect } from "expo-router";
import NetInfo from "@react-native-community/netinfo";
import {
  ReportRecord,
  getReports,
  updateReportStatus,
  sendQueuedReport,
  syncPendingItems,
} from "../src/state/drafts";
import { WorkingReport, getWorkingReport } from "../src/state/editorDraft";
import { colors } from "../src/theme/colors";
import { poppins } from "../src/theme/fonts";

function workflowLabel(status: ReportRecord["status"]) {
  if (status === "draft") return "SAVED";
  if (status === "ready") return "READY";
  return "PENDING";
}

function workflowColor(status: ReportRecord["status"]) {
  if (status === "draft") return colors.textMuted;
  if (status === "ready") return colors.success;
  return colors.warning;
}

function submissionLabel(status: ReportRecord["submissionStatus"]) {
  if (status === "not_submitted") return "NOT SYNCED";
  if (status === "queued") return "PENDING";
  if (status === "syncing") return "SYNCING";
  return "FAILED";
}

function submissionColor(status: ReportRecord["submissionStatus"]) {
  if (status === "not_submitted") return colors.textMuted;
  if (status === "queued") return colors.warning;
  if (status === "syncing") return colors.accent;
  return colors.error;
}

const cardShell = {
  backgroundColor: colors.surface,
  padding: 16,
  borderRadius: 14,
  marginBottom: 12,
  borderWidth: 1,
  borderColor: colors.border,
};

function BaseCard({
  report,
  onQueueReady,
}: {
  report: ReportRecord;
  onQueueReady: (id: string) => void;
}) {
  const attachmentCount = report.attachments?.length ?? 0;

  return (
    <View style={cardShell}>
      <Pressable
        onPress={() =>
          router.push({
            pathname: "/report/new",
            // Pass only the ID — content is loaded from the encrypted store.
            // Never pass title/body as URL params (navigation history, analytics exposure).
            params: {
              id: report.id,
              status: report.status,
              resume: "1",
            },
          })
        }
      >
      <Text
        numberOfLines={1}
        style={{ color: colors.text, fontSize: 16, marginBottom: 6, ...poppins("600") }}
      >
        {report.title}
      </Text>

      <Text
        numberOfLines={2}
        style={{ color: colors.textMuted, marginBottom: 8, lineHeight: 22, ...poppins("400") }}
      >
        {report.body}
      </Text>

      <Text style={{ color: workflowColor(report.status), fontSize: 12, ...poppins("700") }}>
        {workflowLabel(report.status)}
      </Text>

      {attachmentCount > 0 ? (
        <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4, ...poppins("500") }}>
          {attachmentCount} attachment{attachmentCount === 1 ? "" : "s"}
        </Text>
      ) : null}

      <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4, ...poppins("400") }}>
        {new Date(report.updatedAt).toLocaleString()}
      </Text>
      </Pressable>

      {report.status === "ready" ? (
        <Pressable
          onPress={() => onQueueReady(report.id)}
          style={{
            marginTop: 12,
            backgroundColor: colors.surface,
            paddingVertical: 12,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Text style={{ color: colors.text, textAlign: "center", ...poppins("600") }}>
            Add to pending
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function OutboxCard({
  report,
  onReturnToReady,
  onSendNow,
}: {
  report: ReportRecord;
  onReturnToReady: (id: string) => void;
  onSendNow: (id: string) => void;
}) {
  const canSend =
    report.submissionStatus === "queued" ||
    report.submissionStatus === "failed";

  const canReturnToReady =
    report.submissionStatus !== "confirmed" &&
    report.submissionStatus !== "syncing" &&
    report.submissionStatus !== "purged";

  const attachmentCount = report.attachments?.length ?? 0;

  return (
    <View style={cardShell}>
      <Pressable
        onPress={() =>
          router.push({
            pathname: "/report/new",
            // Pass only the ID — content is loaded from the encrypted store.
            // Never pass title/body as URL params (navigation history, analytics exposure).
            params: {
              id: report.id,
              status: report.status,
              resume: "1",
            },
          })
        }
      >
        <Text
          numberOfLines={1}
          style={{ color: colors.text, fontSize: 16, marginBottom: 6, ...poppins("600") }}
        >
          {report.title}
        </Text>

        <Text
          numberOfLines={2}
          style={{ color: colors.textMuted, marginBottom: 8, lineHeight: 22, ...poppins("400") }}
        >
          {report.body}
        </Text>

        <Text style={{ color: workflowColor(report.status), fontSize: 12, ...poppins("700") }}>
          {workflowLabel(report.status)}
        </Text>

        <Text
          style={{
            color: submissionColor(report.submissionStatus),
            fontSize: 12,
            marginTop: 4,
            ...poppins("700"),
          }}
        >
          {submissionLabel(report.submissionStatus)}
        </Text>

        {report.submissionStatus === "failed" && report.lastSubmissionError ? (
          <Text
            style={{
              color: colors.error,
              fontSize: 12,
              marginTop: 6,
              lineHeight: 18,
              ...poppins("400"),
            }}
          >
            {report.lastSubmissionError}
          </Text>
        ) : null}

        {attachmentCount > 0 ? (
          <Text
            style={{
              color: colors.textMuted,
              fontSize: 12,
              marginTop: 4,
              ...poppins("500"),
            }}
          >
            Includes {attachmentCount} file{attachmentCount === 1 ? "" : "s"}
          </Text>
        ) : null}

        <Text
          style={{
            color: colors.textMuted,
            fontSize: 12,
            marginTop: 4,
            marginBottom: 14,
            ...poppins("400"),
          }}
        >
          {new Date(report.updatedAt).toLocaleString()}
        </Text>
      </Pressable>

      {canSend ? (
        <Pressable
          onPress={() => onSendNow(report.id)}
          style={{
            backgroundColor: colors.accent,
            paddingVertical: 12,
            borderRadius: 12,
            marginBottom: canReturnToReady ? 10 : 0,
          }}
        >
          <Text style={{ color: colors.onAccent, textAlign: "center", ...poppins("600") }}>
            Sync Now
          </Text>
        </Pressable>
      ) : null}

      {canReturnToReady ? (
        <Pressable
          onPress={() => onReturnToReady(report.id)}
          style={{
            backgroundColor: colors.surface,
            paddingVertical: 12,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Text style={{ color: colors.text, textAlign: "center", ...poppins("600") }}>
            Mark Ready
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export default function HomeScreen() {
  const [reports, setReports] = useState<ReportRecord[]>([]);
  const [workingReport, setWorkingReport] = useState<WorkingReport | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [isBatchSyncing, setIsBatchSyncing] = useState(false);
  const [syncBanner, setSyncBanner] = useState<string>("");
  const reloadSeq = useRef(0);

  async function reload() {
    const seq = ++reloadSeq.current;
    const items = await getReports();
    const currentWorking = await getWorkingReport();
    if (seq !== reloadSeq.current) return; // stale
    setReports(items);
    setWorkingReport(currentWorking);
  }

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [])
  );

  // Auto sync: on startup and on network reconnect.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      NetInfo.fetch().then((state) => {
        if (cancelled) return;
        if (state.isConnected) {
          void syncPendingItems("startup").then(() => reload());
        }
      });

      const unsub = NetInfo.addEventListener((state) => {
        if (cancelled) return;
        if (state.isConnected) {
          void syncPendingItems("network_reconnect").then(() => reload());
        }
      });
      return () => {
        cancelled = true;
        unsub();
      };
    }, [])
  );

  const activeReports = useMemo(
    () =>
      reports.filter(
        (report) =>
          report.status !== "queued" &&
          (report.submissionStatus === "not_submitted" ||
            report.submissionStatus === "failed" ||
            report.submissionStatus === "syncing")
      ),
    [reports]
  );

  const outboxReports = useMemo(
    () =>
      reports.filter(
        (report) =>
          report.status === "queued" &&
          (report.submissionStatus === "queued" ||
            report.submissionStatus === "failed" ||
            report.submissionStatus === "syncing")
      ),
    [reports]
  );

  async function queueReadyAndMaybeSync(id: string) {
    if (sendingId) return;

    await updateReportStatus(id, "queued");
    await reload();

    const state = await NetInfo.fetch();
    if (!state.isConnected) {
      return;
    }

    setSendingId(id);
    setReports((prev) =>
      prev.map((r) => (r.id === id ? { ...r, submissionStatus: "syncing" } : r))
    );

    try {
      await sendQueuedReport(id);
      // After confirmed receipt, the local copy is intentionally removed.
      setReports((prev) => prev.filter((r) => r.id !== id));
    } catch {
      setReports((prev) =>
        prev.map((r) => (r.id === id ? { ...r, submissionStatus: "failed" } : r))
      );
    } finally {
      setSendingId(null);
      await reload();
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, padding: 24 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 20,
        }}
      >
        <Text style={{ color: colors.text, fontSize: 28, ...poppins("700") }}>Home</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Pressable
            onPress={async () => {
              if (isBatchSyncing || sendingId) return;

              if (outboxReports.length === 0) {
                setSyncBanner("Nothing pending");
                setTimeout(() => setSyncBanner(""), 1200);
                return;
              }

              setSyncBanner("Syncing…");
              setIsBatchSyncing(true);
              try {
                await syncPendingItems("manual");
                setSyncBanner("Up to date");
                setTimeout(() => setSyncBanner(""), 1200);
              } finally {
                setIsBatchSyncing(false);
                await reload();
              }
            }}
            style={{
              paddingVertical: 8,
              paddingHorizontal: 14,
              borderRadius: 999,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
              opacity: isBatchSyncing || sendingId ? 0.6 : 1,
            }}
          >
            <Text style={{ color: colors.text, fontSize: 14, ...poppins("600") }}>
              {isBatchSyncing ? "Syncing…" : "Sync"}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
              router.push("/settings");
            }}
            style={{
              paddingVertical: 8,
              paddingHorizontal: 14,
              borderRadius: 999,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text style={{ color: colors.text, fontSize: 14, ...poppins("600") }}>Settings</Text>
          </Pressable>
        </View>
      </View>

      {syncBanner ? (
        <Text style={{ color: colors.textMuted, marginBottom: 12, ...poppins("400") }}>
          {syncBanner}
        </Text>
      ) : (
        <View style={{ height: 12 }} />
      )}

      <Pressable
        onPress={() => router.push("/report/new")}
        style={{
          backgroundColor: colors.accent,
          padding: 16,
          borderRadius: 14,
          marginBottom: 16,
        }}
      >
        <Text style={{ color: colors.onAccent, textAlign: "center", fontSize: 16, ...poppins("500") }}>
          New Note
        </Text>
      </Pressable>

      {workingReport ? (
        <Pressable
          onPress={() =>
            router.push({
              pathname: "/report/new",
              params: {
                ...(workingReport.reportId ? { id: workingReport.reportId } : {}),
                title: workingReport.title,
                body: workingReport.body,
                resume: "1",
              },
            })
          }
          style={{
            backgroundColor: colors.surface,
            padding: 16,
            borderRadius: 14,
            marginBottom: 24,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Text style={{ color: colors.text, fontSize: 15, marginBottom: 4, ...poppins("600") }}>
            Resume Writing
          </Text>
          <Text numberOfLines={2} style={{ color: colors.textMuted, ...poppins("400") }}>
            {workingReport.title || "Untitled note"}
          </Text>
          {(workingReport.attachments?.length ?? 0) > 0 ? (
            <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 8, ...poppins("500") }}>
              {workingReport.attachments?.length ?? 0} attachment
              {(workingReport.attachments?.length ?? 0) === 1 ? "" : "s"} in buffer
            </Text>
          ) : null}
        </Pressable>
      ) : (
        <View style={{ height: 8 }} />
      )}

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <Text style={{ color: colors.text, fontSize: 18, marginBottom: 12, ...poppins("600") }}>
          Notes
        </Text>

        {activeReports.length === 0 && outboxReports.length === 0 ? (
          <View style={{ marginBottom: 24 }}>
            <Text style={{ color: colors.text, fontSize: 16, marginBottom: 6, ...poppins("600") }}>
              Nothing pending
            </Text>
            <Text style={{ color: colors.textMuted, lineHeight: 20, ...poppins("400") }}>
              You’re all caught up.
            </Text>
          </View>
        ) : activeReports.length === 0 ? (
          <Text style={{ color: colors.textMuted, marginBottom: 24, ...poppins("400") }}>
            No saved notes.
          </Text>
        ) : (
          <View style={{ marginBottom: 24 }}>
            {activeReports.map((report) => (
              <BaseCard key={report.id} report={report} onQueueReady={queueReadyAndMaybeSync} />
            ))}
          </View>
        )}

        <Text style={{ color: colors.text, fontSize: 18, marginBottom: 12, ...poppins("600") }}>Pending</Text>

        {outboxReports.length === 0 ? (
          <Text style={{ color: colors.textMuted, marginBottom: 24, ...poppins("400") }}>
            Nothing pending.
          </Text>
        ) : (
          <View style={{ marginBottom: 24 }}>
            {outboxReports.map((report) => (
              <OutboxCard
                key={report.id}
                report={report}
                onReturnToReady={async (id) => {
                  if (sendingId) return;
                  await updateReportStatus(id, "ready");
                  await reload();
                }}
                onSendNow={async (id) => {
                  if (sendingId) return;

                  setSendingId(id);
                  setReports((prev) =>
                    prev.map((r) => (r.id === id ? { ...r, submissionStatus: "syncing" } : r))
                  );
                  void reload().catch(() => {});

                  try {
                    await sendQueuedReport(id);
                    // After confirmed receipt, the local copy is intentionally removed.
                    setReports((prev) => prev.filter((r) => r.id !== id));
                  } catch (error) {
                    setReports((prev) =>
                      prev.map((r) => (r.id === id ? { ...r, submissionStatus: "failed" } : r))
                    );
                  } finally {
                    setSendingId(null);
                    void reload().catch(() => {});
                  }
                }}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
