import { useCallback, useMemo, useRef, useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import NetInfo from "@react-native-community/netinfo";
import {
  ReportRecord,
  getReports,
  updateReportStatus,
  sendQueuedReport,
  syncPendingItems,
} from "../src/state/drafts";
import { WorkingReport, getWorkingReport } from "../src/state/editorDraft";
import { getVault } from "../src/lib/vault/expoStorage";
import { displaySendError } from "../src/i18n/sendError";
import { fmt, t, when } from "../src/i18n";
import { summarizeSent, syncOutcome, type SentSummary, type SyncOutcome } from "../src/state/sendStatus";
import { colors } from "../src/theme/colors";
import { poppins, lh } from "../src/theme/fonts";

function workflowLabel(status: ReportRecord["status"]) {
  const h = t().home;
  if (status === "draft") return h.statusDraft;
  if (status === "ready") return h.statusReady;
  return h.statusWaiting;
}

function workflowColor(status: ReportRecord["status"]) {
  if (status === "draft") return colors.textMuted;
  if (status === "ready") return colors.success;
  return colors.warning;
}

function submissionLabel(status: ReportRecord["submissionStatus"]) {
  const h = t().home;
  if (status === "syncing") return h.statusSending;
  if (status === "failed") return h.statusNotSent;
  return h.statusWaiting;
}

function submissionColor(status: ReportRecord["submissionStatus"]) {
  if (status === "syncing") return colors.accent;
  if (status === "failed") return colors.error;
  return colors.warning;
}

function outcomeMessage(o: SyncOutcome): string {
  const h = t().home;
  switch (o.kind) {
    case "offline":
      return h.resultOffline;
    case "nothing":
      return h.resultNothing;
    case "sent":
      return h.resultSent;
    case "failed":
      return fmt(h.resultFailed, { count: o.failed });
    case "partial":
      return fmt(h.resultPartial, { sent: o.sent, failed: o.failed });
  }
}

/** Count and time of confirmed sends, from the tombstones the real vault already keeps. */
async function readSentSummary(): Promise<SentSummary> {
  try {
    return summarizeSent(await getVault().get("tombstones"));
  } catch {
    return { count: 0, lastSentAt: null };
  }
}

const cardShell = {
  backgroundColor: colors.surface,
  padding: 16,
  borderRadius: 14,
  marginBottom: 12,
  borderWidth: 1,
  borderColor: colors.border,
};

/** Opens an item in the editor. Only the id travels: content is loaded from the vault. */
function openInEditor(report: ReportRecord) {
  router.push({ pathname: "/report/new", params: { id: report.id, status: report.status, resume: "1" } });
}

function CardBody({ report }: { report: ReportRecord }) {
  const attachmentCount = report.attachments?.length ?? 0;
  return (
    <>
      <Text numberOfLines={1} style={{ color: colors.text, fontSize: 16, marginBottom: 6, ...poppins("600") }}>
        {report.title.trim() || t().home.untitled}
      </Text>
      <Text numberOfLines={2} style={{ color: colors.textMuted, marginBottom: 8, lineHeight: lh(22), ...poppins("400") }}>
        {report.body}
      </Text>
      {attachmentCount > 0 ? (
        <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 4, ...poppins("500") }}>
          {fmt(t().home.files, { count: attachmentCount })}
        </Text>
      ) : null}
      <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 4, ...poppins("400") }}>
        {when(report.updatedAt)}
      </Text>
    </>
  );
}

function DraftCard({ report, onSend }: { report: ReportRecord; onSend: (id: string) => void }) {
  return (
    <View style={cardShell}>
      <Pressable onPress={() => openInEditor(report)}>
        <CardBody report={report} />
        <Text style={{ color: workflowColor(report.status), fontSize: 12, ...poppins("700") }}>
          {workflowLabel(report.status)}
        </Text>
      </Pressable>

      {report.status === "ready" ? (
        <Pressable
          onPress={() => onSend(report.id)}
          style={{ marginTop: 12, backgroundColor: colors.accent, paddingVertical: 12, borderRadius: 12 }}
        >
          <Text style={{ color: colors.onAccent, textAlign: "center", ...poppins("600") }}>{t().home.send}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function WaitingCard({
  report,
  onReturnToDrafts,
  onSendNow,
}: {
  report: ReportRecord;
  onReturnToDrafts: (id: string) => void;
  onSendNow: (id: string) => void;
}) {
  const canSend = report.submissionStatus === "queued" || report.submissionStatus === "failed";
  const canReturn =
    report.submissionStatus !== "confirmed" &&
    report.submissionStatus !== "syncing" &&
    report.submissionStatus !== "purged";

  return (
    <View style={cardShell}>
      <Pressable onPress={() => openInEditor(report)}>
        <CardBody report={report} />
        <Text style={{ color: submissionColor(report.submissionStatus), fontSize: 12, marginBottom: 6, ...poppins("700") }}>
          {submissionLabel(report.submissionStatus)}
        </Text>
        {report.submissionStatus === "failed" && report.lastSubmissionError ? (
          <Text style={{ color: colors.error, fontSize: 12, marginBottom: 12, lineHeight: lh(18), ...poppins("400") }}>
            {displaySendError(report.lastSubmissionError, report.attachments, t())}
          </Text>
        ) : (
          <View style={{ height: 8 }} />
        )}
      </Pressable>

      {canSend ? (
        <Pressable
          onPress={() => onSendNow(report.id)}
          style={{ backgroundColor: colors.accent, paddingVertical: 12, borderRadius: 12, marginBottom: canReturn ? 10 : 0 }}
        >
          <Text style={{ color: colors.onAccent, textAlign: "center", ...poppins("600") }}>{t().home.sendNow}</Text>
        </Pressable>
      ) : null}

      {canReturn ? (
        <Pressable
          onPress={() => onReturnToDrafts(report.id)}
          style={{
            backgroundColor: colors.surface,
            paddingVertical: 12,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Text style={{ color: colors.text, textAlign: "center", ...poppins("600") }}>{t().home.backToDrafts}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const isWaiting = (r: ReportRecord) =>
  r.status === "queued" &&
  (r.submissionStatus === "queued" || r.submissionStatus === "failed" || r.submissionStatus === "syncing");

export default function HomeScreen() {
  const h = t().home;
  // Set by the editor's Send button: run the sync now and show its result.
  const { send } = useLocalSearchParams<{ send?: string }>();
  const sendRequested = send === "1";

  const [reports, setReports] = useState<ReportRecord[]>([]);
  const [workingReport, setWorkingReport] = useState<WorkingReport | null>(null);
  const [sent, setSent] = useState<SentSummary>({ count: 0, lastSentAt: null });
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<{ text: string; error: boolean } | null>(null);
  const busyRef = useRef(false);
  const reloadSeq = useRef(0);
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reload = useCallback(async () => {
    const seq = ++reloadSeq.current;
    const [items, currentWorking, summary] = await Promise.all([getReports(), getWorkingReport(), readSentSummary()]);
    if (seq !== reloadSeq.current) return { items, summary }; // stale
    setReports(items);
    setWorkingReport(currentWorking);
    setSent(summary);
    return { items, summary };
  }, []);

  const showBanner = useCallback((text: string, error: boolean) => {
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    setBanner({ text, error });
    // A failure stays until the next attempt; other results clear after a few seconds.
    if (!error) bannerTimer.current = setTimeout(() => setBanner(null), 5000);
  }, []);

  /**
   * One sync attempt through the existing pipeline (syncPendingItems), with its real result.
   * "report": "all" shows every result (Sync button, Send); "sent" shows only a confirmation
   * (automatic syncs on focus and reconnect).
   */
  const runSync = useCallback(
    async (reason: "startup" | "network_reconnect" | "manual", report: "all" | "sent") => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      try {
        const before = await reload();
        const waitingBefore = before.items.filter(isWaiting).length;
        const online = !!(await NetInfo.fetch()).isConnected;
        // As before: always run when online (it also finishes receipts kept while locked).
        if (online) await syncPendingItems(reason);
        const after = await reload();
        const outcome = syncOutcome({
          online,
          waitingBefore,
          waitingAfter: after.items.filter(isWaiting).length,
          sentBefore: before.summary.count,
          sentAfter: after.summary.count,
        });
        if (report === "all") showBanner(outcomeMessage(outcome), outcome.kind !== "sent" && outcome.kind !== "nothing");
        else if (outcome.kind === "sent" || outcome.kind === "partial") showBanner(outcomeMessage(outcome), outcome.kind === "partial");
      } catch {
        if (report === "all") showBanner(t().common.genericError, true);
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [reload, showBanner],
  );

  // On focus: sync (sending happens with the app open here), and on reconnect.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void runSync(sendRequested ? "manual" : "startup", sendRequested ? "all" : "sent");
      if (sendRequested) router.setParams({ send: undefined });

      const unsub = NetInfo.addEventListener((state) => {
        if (!cancelled && state.isConnected) void runSync("network_reconnect", "sent");
      });
      return () => {
        cancelled = true;
        unsub();
      };
    }, [runSync, sendRequested])
  );

  const drafts = useMemo(
    () =>
      reports.filter(
        (r) =>
          r.status !== "queued" &&
          (r.submissionStatus === "not_submitted" || r.submissionStatus === "failed" || r.submissionStatus === "syncing")
      ),
    [reports]
  );
  const waiting = useMemo(() => reports.filter(isWaiting), [reports]);

  async function sendReadyItem(id: string) {
    if (busyRef.current) return;
    await updateReportStatus(id, "queued");
    await runSync("manual", "all");
  }

  async function sendOne(id: string) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const online = !!(await NetInfo.fetch()).isConnected;
      if (!online) {
        showBanner(h.resultOffline, true);
        return;
      }
      setReports((prev) => prev.map((r) => (r.id === id ? { ...r, submissionStatus: "syncing" } : r)));
      try {
        await sendQueuedReport(id);
        showBanner(h.resultSent, false);
      } catch {
        // The pipeline already saved the failure; the item stays waiting.
        showBanner(fmt(h.resultFailed, { count: 1 }), true);
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
      void reload().catch(() => {});
    }
  }

  const headerButton = {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  } as const;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, padding: 24 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <Text style={{ color: colors.text, fontSize: 28, ...poppins("700") }}>{h.title}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Pressable
            onPress={() => void runSync("manual", "all")}
            disabled={busy}
            style={{ ...headerButton, opacity: busy ? 0.6 : 1 }}
          >
            <Text style={{ color: colors.text, fontSize: 14, ...poppins("600") }}>{busy ? h.sending : h.sendNow}</Text>
          </Pressable>
          <Pressable onPress={() => router.push("/settings")} style={headerButton}>
            <Text style={{ color: colors.text, fontSize: 14, ...poppins("600") }}>{h.settings}</Text>
          </Pressable>
        </View>
      </View>

      {banner ? (
        <Text
          style={{
            color: banner.error ? colors.error : colors.success,
            marginBottom: 10,
            lineHeight: lh(20),
            ...poppins("600"),
          }}
        >
          {banner.text}
        </Text>
      ) : null}

      {waiting.length > 0 ? (
        <Text style={{ color: colors.warning, marginBottom: 6, lineHeight: lh(20), ...poppins("500") }}>
          {fmt(h.waitingLine, { count: waiting.length })}
        </Text>
      ) : null}
      {sent.lastSentAt ? (
        <Text style={{ color: colors.textMuted, fontSize: 13, marginBottom: 6, ...poppins("400") }}>
          {fmt(h.lastSent, { time: when(sent.lastSentAt) })}
        </Text>
      ) : null}
      <View style={{ height: 8 }} />

      <Pressable
        onPress={() => router.push("/report/new")}
        style={{ backgroundColor: colors.accent, padding: 16, borderRadius: 14, marginBottom: 16 }}
      >
        <Text style={{ color: colors.onAccent, textAlign: "center", fontSize: 16, ...poppins("600") }}>{h.newEntry}</Text>
      </Pressable>

      {workingReport ? (
        <Pressable
          onPress={() =>
            router.push({
              pathname: "/report/new",
              // Only the id: the editor loads the text from the vault (never via route params).
              params: { ...(workingReport.reportId ? { id: workingReport.reportId } : {}), resume: "1" },
            })
          }
          style={{ ...cardShell, marginBottom: 20 }}
        >
          <Text style={{ color: colors.text, fontSize: 15, marginBottom: 4, ...poppins("600") }}>{h.continueWriting}</Text>
          <Text numberOfLines={2} style={{ color: colors.textMuted, ...poppins("400") }}>
            {workingReport.title.trim() || h.untitled}
          </Text>
          {(workingReport.attachments?.length ?? 0) > 0 ? (
            <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 8, ...poppins("500") }}>
              {fmt(h.files, { count: workingReport.attachments.length })}
            </Text>
          ) : null}
        </Pressable>
      ) : null}

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {drafts.length === 0 && waiting.length === 0 && !workingReport ? (
          <Text style={{ color: colors.textMuted, lineHeight: lh(22), marginBottom: 24, ...poppins("400") }}>{h.empty}</Text>
        ) : null}

        {drafts.length > 0 ? (
          <>
            <Text style={{ color: colors.text, fontSize: 18, marginBottom: 12, ...poppins("600") }}>{h.myDrafts}</Text>
            <View style={{ marginBottom: 24 }}>
              {drafts.map((report) => (
                <DraftCard key={report.id} report={report} onSend={(id) => void sendReadyItem(id)} />
              ))}
            </View>
          </>
        ) : null}

        {waiting.length > 0 ? (
          <>
            <Text style={{ color: colors.text, fontSize: 18, marginBottom: 12, ...poppins("600") }}>{h.waitingHeading}</Text>
            <View style={{ marginBottom: 24 }}>
              {waiting.map((report) => (
                <WaitingCard
                  key={report.id}
                  report={report}
                  onReturnToDrafts={async (id) => {
                    if (busyRef.current) return;
                    await updateReportStatus(id, "ready");
                    await reload();
                  }}
                  onSendNow={(id) => void sendOne(id)}
                />
              ))}
            </View>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}
