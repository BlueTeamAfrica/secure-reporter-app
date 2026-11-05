/**
 * TEST-PHASE DIAGNOSTIC: review before wider release.
 *
 * Read-only "Storage check": shows counts of what is stored on this device so a phone can be
 * diagnosed remotely without clearing data. Shows no titles, bodies, file names, PINs or hashes.
 * Makes no writes and deletes nothing.
 *
 * Reachable by a 3 s hold on the Settings title and, in test builds only, by the visible
 * "Diagnostics" row in Settings. The root layout redirects locked sessions to /unlock and cover
 * sessions to /cover; this screen also refuses to load counts without a real session PIN.
 *
 * Test builds also get a speed test: it times scrypt with a random dummy PIN and salt, and
 * touches no storage, no vault, no device secret and no session.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { getRandomBytes } from "expo-crypto";
import Screen from "../../src/components/layout/Screen";
import { IS_TEST_BUILD } from "../../src/lib/env/testBuild";
import {
  BENCHMARK_LOG_N,
  describeJsEngine,
  runKdfBenchmark,
  type BenchmarkResult,
} from "../../src/lib/vault/kdfBenchmark";
import { getSessionPin } from "../../src/state/session";
import { getStorageDiagnostics, type StorageDiagnostics } from "../../src/state/storageDiagnostics";
import { colors } from "../../src/theme/colors";
import { poppins } from "../../src/theme/fonts";

const STRINGS = {
  back: "← Back",
  title: "Storage check",
  intro: "Counts only. Nothing is changed or deleted.",
  loading: "Checking…",
  unavailable: "Not available.",
  failed: "Check could not be completed.",
  refresh: "Check again",
  yes: "yes",
  no: "no",
  sectionReports: "Reports",
  listReadable: "List readable",
  stored: "Stored in draft_reports",
  visible: "Visible to the app",
  hiddenTombstoned: "Hidden: tombstoned",
  hiddenDecryptFailed: "Hidden: failed to decrypt",
  hiddenEmpty: "Hidden: empty title or body",
  hiddenUnknown: "Hidden: unknown shape",
  unexplained: "Unexplained difference",
  notShownOnHome: "Visible but not on Home (status)",
  attachmentListFailed: "Attachment list failed to decrypt",
  sectionStatus: "Status × submission (all stored)",
  none: "None",
  sectionTombstones: "Tombstones",
  tombstoneCount: "Count",
  newestTombstones: "Newest 5 (confirmed at · server id …last 4)",
  sectionWorking: "Working draft",
  workingExists: "Exists",
  workingDecrypts: "Decrypts",
  sectionFiles: "Attachment files",
  filesInFolder: "Files in folder",
  filesReferenced: "Referenced by readable items",
  filesUnreferenced: "Not referenced",
  filesMissing: "Referenced but missing",
  sectionSpeed: "Speed test",
  speedIntro: "Times one key derivation per level with dummy input. Nothing is read or changed.",
  speedEngine: "JS engine",
  speedRun: "Speed test",
  speedRunning: "Running…",
  speedPending: "—",
  speedFailed: "Speed test could not be completed.",
} as const;

type LoadState =
  | { kind: "loading" }
  | { kind: "unavailable" }
  | { kind: "failed" }
  | { kind: "ready"; data: StorageDiagnostics };

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 4 }}>
      <Text style={{ color: colors.textMuted, flex: 1, fontSize: 14, ...poppins("400") }}>{label}</Text>
      <Text style={{ color: colors.text, fontSize: 14, ...poppins("600") }}>{String(value)}</Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: 14,
        padding: 16,
        marginBottom: 12,
      }}
    >
      <Text style={{ color: colors.text, fontSize: 16, marginBottom: 6, ...poppins("600") }}>{title}</Text>
      {children}
    </View>
  );
}

function SpeedTest() {
  const [results, setResults] = useState<BenchmarkResult[]>([]);
  const [running, setRunning] = useState(false);
  const [failed, setFailed] = useState(false);
  const cancelled = useRef(false);
  const engine = useRef(describeJsEngine()).current;

  useEffect(() => {
    cancelled.current = false;
    return () => {
      cancelled.current = true; // stop after the current level if the screen goes away
    };
  }, []);

  const run = useCallback(async () => {
    setRunning(true);
    setFailed(false);
    setResults([]);
    try {
      await runKdfBenchmark({
        randomBytes: getRandomBytes,
        isCancelled: () => cancelled.current,
        onResult: (r) => {
          if (!cancelled.current) setResults((prev) => [...prev, r]);
        },
      });
    } catch {
      if (!cancelled.current) setFailed(true); // no error text shown or logged
    } finally {
      if (!cancelled.current) setRunning(false);
    }
  }, []);

  return (
    <Section title={STRINGS.sectionSpeed}>
      <Text style={{ color: colors.textMuted, fontSize: 13, marginBottom: 6, ...poppins("400") }}>
        {STRINGS.speedIntro}
      </Text>
      <Row label={STRINGS.speedEngine} value={engine} />
      {BENCHMARK_LOG_N.map((logN) => {
        const r = results.find((x) => x.logN === logN);
        const label = `N=2^${logN}, r=8, p=1 (${(128 * 8 * 2 ** logN) / 2 ** 20} MiB)`;
        const value = r ? `${r.seconds.toFixed(2)} s` : running ? STRINGS.speedRunning : STRINGS.speedPending;
        return <Row key={logN} label={label} value={value} />;
      })}
      {failed ? (
        <Text style={{ color: colors.error, marginTop: 6, ...poppins("500") }}>{STRINGS.speedFailed}</Text>
      ) : null}
      <Pressable
        onPress={() => void run()}
        disabled={running}
        style={{
          backgroundColor: colors.accent,
          opacity: running ? 0.5 : 1,
          paddingVertical: 12,
          borderRadius: 12,
          marginTop: 10,
        }}
      >
        <Text style={{ color: colors.onAccent, textAlign: "center", fontSize: 15, ...poppins("600") }}>
          {running ? STRINGS.speedRunning : STRINGS.speedRun}
        </Text>
      </Pressable>
    </Section>
  );
}

export default function StorageCheckScreen() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  const load = useCallback(async () => {
    if (!getSessionPin()) {
      setState({ kind: "unavailable" });
      return;
    }
    setState({ kind: "loading" });
    try {
      const data = await getStorageDiagnostics();
      setState(data ? { kind: "ready", data } : { kind: "unavailable" });
    } catch {
      // Don't show or log the error: its text could contain local paths.
      setState({ kind: "failed" });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const yesNo = (v: boolean) => (v ? STRINGS.yes : STRINGS.no);

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <Pressable
          onPress={() => router.back()}
          style={{ alignSelf: "flex-start", marginBottom: 16, paddingVertical: 6, paddingRight: 12 }}
        >
          <Text style={{ color: colors.accent, fontSize: 16, ...poppins("600") }}>{STRINGS.back}</Text>
        </Pressable>
        <Text style={{ color: colors.text, fontSize: 24, marginBottom: 6, ...poppins("700") }}>
          {STRINGS.title}
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: 14, marginBottom: 18, ...poppins("400") }}>
          {STRINGS.intro}
        </Text>

        {state.kind === "loading" ? (
          <Text style={{ color: colors.textMuted, ...poppins("400") }}>{STRINGS.loading}</Text>
        ) : null}
        {state.kind === "unavailable" ? (
          <Text style={{ color: colors.textMuted, ...poppins("400") }}>{STRINGS.unavailable}</Text>
        ) : null}
        {state.kind === "failed" ? (
          <Text style={{ color: colors.error, ...poppins("500") }}>{STRINGS.failed}</Text>
        ) : null}

        {state.kind === "ready" ? (
          <>
            <Section title={STRINGS.sectionReports}>
              <Row label={STRINGS.listReadable} value={yesNo(state.data.reports.listReadable)} />
              <Row label={STRINGS.stored} value={state.data.reports.stored} />
              <Row label={STRINGS.visible} value={state.data.reports.visibleToApp} />
              <Row label={STRINGS.hiddenTombstoned} value={state.data.reports.hiddenTombstoned} />
              <Row label={STRINGS.hiddenDecryptFailed} value={state.data.reports.hiddenDecryptFailed} />
              <Row label={STRINGS.hiddenEmpty} value={state.data.reports.hiddenEmptyTitleOrBody} />
              <Row label={STRINGS.hiddenUnknown} value={state.data.reports.hiddenUnknownShape} />
              <Row label={STRINGS.unexplained} value={state.data.reports.unexplained} />
              <Row label={STRINGS.notShownOnHome} value={state.data.reports.notShownOnHome} />
              <Row
                label={STRINGS.attachmentListFailed}
                value={state.data.reports.attachmentListDecryptFailed}
              />
            </Section>

            <Section title={STRINGS.sectionStatus}>
              {state.data.statusCounts.length === 0 ? (
                <Row label={STRINGS.none} value={0} />
              ) : (
                state.data.statusCounts.map((s) => (
                  <Row key={`${s.status}|${s.submissionStatus}`} label={`${s.status} × ${s.submissionStatus}`} value={s.count} />
                ))
              )}
            </Section>

            <Section title={STRINGS.sectionTombstones}>
              <Row label={STRINGS.listReadable} value={yesNo(state.data.tombstones.listReadable)} />
              <Row label={STRINGS.tombstoneCount} value={state.data.tombstones.count} />
              <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 6, ...poppins("500") }}>
                {STRINGS.newestTombstones}
              </Text>
              {state.data.tombstones.newest.length === 0 ? (
                <Row label={STRINGS.none} value="" />
              ) : (
                state.data.tombstones.newest.map((t, i) => (
                  <Row key={i} label={t.confirmedAt} value={`…${t.serverIdLast4}`} />
                ))
              )}
            </Section>

            <Section title={STRINGS.sectionWorking}>
              <Row label={STRINGS.workingExists} value={yesNo(state.data.workingDraft.exists)} />
              <Row label={STRINGS.workingDecrypts} value={state.data.workingDraft.decrypts} />
            </Section>

            <Section title={STRINGS.sectionFiles}>
              <Row label={STRINGS.filesInFolder} value={state.data.attachmentFiles.inFolder} />
              <Row label={STRINGS.filesReferenced} value={state.data.attachmentFiles.inFolderReferenced} />
              <Row label={STRINGS.filesUnreferenced} value={state.data.attachmentFiles.inFolderUnreferenced} />
              <Row label={STRINGS.filesMissing} value={state.data.attachmentFiles.referencedMissing} />
            </Section>

            <Pressable
              onPress={() => void load()}
              style={{ backgroundColor: colors.accent, paddingVertical: 14, borderRadius: 14, marginTop: 6 }}
            >
              <Text style={{ color: colors.onAccent, textAlign: "center", fontSize: 16, ...poppins("600") }}>
                {STRINGS.refresh}
              </Text>
            </Pressable>
          </>
        ) : null}

        {IS_TEST_BUILD ? (
          <View style={{ marginTop: 18 }}>
            <SpeedTest />
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
