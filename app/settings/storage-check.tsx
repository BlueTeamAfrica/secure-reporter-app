/**
 * TEST-PHASE DIAGNOSTIC: review before wider release.
 *
 * Read-only "Storage check": shows counts of what is stored on this device so a phone can be
 * diagnosed remotely without clearing data. Shows no titles, bodies, file names, PINs or hashes.
 * Makes no writes and deletes nothing.
 *
 * Test builds only: reachable from the "Diagnostics" row in Settings and a 3 s hold on the
 * Settings title (both gated on IS_TEST_BUILD). The root layout redirects locked sessions to
 * /unlock and cover sessions to /cover; this screen also refuses to load counts without an
 * open real vault.
 *
 * Test builds also get a speed test: a JS-vs-native self-test on fixed vectors, and scrypt
 * timings (JS and native) with random dummy PINs and salts. It touches no storage, no vault,
 * no device secret and no session.
 *
 * Test builds also get "Simulate interrupted erase" (src/diagnostics/): after a confirmation it
 * deletes the device secret, which breaks this phone's data for good, so the recovery erase
 * on the PIN screen can be tested. The only Diagnostics action that changes anything.
 * Removed with this screen before the reporter's APK.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
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
import { expoVaultStorage, getVaultScryptChoice } from "../../src/lib/vault/expoStorage";
import { isNativeScryptAvailable, nativeVaultScrypt } from "../../src/lib/vault/nativeScrypt";
import { compareImplementations, type ScryptChoice } from "../../src/lib/vault/scryptSelect";
import { defaultScrypt } from "../../src/lib/vault/vault";
import { simulateInterruptedErase } from "../../src/diagnostics/simulateInterruptedErase";
import { endSession, isRealSession } from "../../src/state/session";
import { getLastUnlockDurationMs } from "../../src/state/device";
import { getStorageDiagnostics, type StorageDiagnostics } from "../../src/state/storageDiagnostics";
import { colors } from "../../src/theme/colors";
import { poppins } from "../../src/theme/fonts";

const STRINGS = {
  sectionBreak: "Recovery test",
  breakIntro:
    "Leaves the state of an erase that stopped after its first step. Then the code screen can only offer Erase everything.",
  breakButton: "Simulate interrupted erase",
  breakConfirmTitle: "Break this app's data?",
  breakConfirmBody:
    "This deletes the key that opens everything stored in this app on this phone. Drafts, items waiting to send and notes become unreadable for good. Only Erase everything will work afterwards.",
  breakConfirmAction: "Break the data",
  breakFailed: "Could not run the simulation.",
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
  stored: "Stored items",
  visible: "Visible to the app",
  hiddenTombstoned: "Hidden: tombstoned",
  hiddenEmpty: "Hidden: empty title or body",
  hiddenUnknown: "Hidden: unknown shape",
  unexplained: "Unexplained difference",
  notShownOnHome: "Visible but not on Home (status)",
  sectionStatus: "Status × submission (all stored)",
  none: "None",
  sectionTombstones: "Tombstones",
  tombstoneCount: "Count",
  newestTombstones: "Newest 5 (confirmed at · server id …last 4)",
  sectionWorking: "Working draft",
  workingExists: "Exists",
  workingReadable: "Readable",
  sectionFiles: "Attachment files",
  filesInFolder: "Files in folder",
  filesReferenced: "Referenced by readable items",
  filesUnreferenced: "Not referenced",
  filesMissing: "Referenced but missing",
  sectionSpeed: "Speed test",
  speedIntro: "Fixed test vectors and dummy input only. Nothing stored is read or changed.",
  speedEngine: "JS engine",
  speedRun: "Speed test",
  speedRunning: "Running…",
  speedPending: "—",
  speedFailed: "Speed test could not be completed.",
  nativeAvailable: "Native module",
  inUse: "Key derivation in use",
  inUseNative: "native",
  inUseUnavailable: "unavailable (can't set up or unlock)",
  inUseJs: "JS",
  lastUnlock: "Last unlock took",
  selfTitle: "Self-test (fixed vectors, JS vs native)",
  selfMatch: "Outputs match",
  selfRun: "Run self-test",
  jsTitle: "JS (noble)",
  nativeTitle: "Native",
  nativeRun: "Native speed test",
} as const;

const NATIVE_LOG_N = [14, 15, 16] as const;

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

type Busy = null | "selftest" | "noble" | "native";

/** Test builds only: breaks the data on purpose, after a confirmation. */
function SimulateInterruptedErase() {
  const [failed, setFailed] = useState(false);

  async function run() {
    setFailed(false);
    try {
      endSession(); // as the erase does first
      await simulateInterruptedErase(expoVaultStorage, IS_TEST_BUILD);
      router.replace("/unlock");
    } catch {
      setFailed(true);
    }
  }

  function confirm() {
    Alert.alert(STRINGS.breakConfirmTitle, STRINGS.breakConfirmBody, [
      { text: "Cancel", style: "cancel" },
      { text: STRINGS.breakConfirmAction, style: "destructive", onPress: () => void run() },
    ]);
  }

  return (
    <Section title={STRINGS.sectionBreak}>
      <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 19, ...poppins("400") }}>{STRINGS.breakIntro}</Text>
      <Pressable
        onPress={confirm}
        style={{ backgroundColor: colors.error, paddingVertical: 12, borderRadius: 12, marginTop: 10 }}
      >
        <Text style={{ color: colors.onAccent, textAlign: "center", fontSize: 15, ...poppins("600") }}>
          {STRINGS.breakButton}
        </Text>
      </Pressable>
      {failed ? <Text style={{ color: colors.error, marginTop: 8, ...poppins("500") }}>{STRINGS.breakFailed}</Text> : null}
    </Section>
  );
}

function ActionButton({ label, busy, onPress }: { label: string; busy: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={{
        backgroundColor: colors.accent,
        opacity: busy ? 0.5 : 1,
        paddingVertical: 12,
        borderRadius: 12,
        marginTop: 10,
      }}
    >
      <Text style={{ color: colors.onAccent, textAlign: "center", fontSize: 15, ...poppins("600") }}>{label}</Text>
    </Pressable>
  );
}

function SubTitle({ children }: { children: ReactNode }) {
  return <Text style={{ color: colors.text, fontSize: 14, marginTop: 14, ...poppins("600") }}>{children}</Text>;
}

/**
 * Test builds only. Everything here uses fixed test vectors or random dummy PINs and salts:
 * no storage, vault, device secret or session is read or written, and nothing is logged.
 * One run at a time (shared busy flag) so timings don't compete for the CPU.
 */
function SpeedTest() {
  const [busy, setBusy] = useState<Busy>(null);
  const [failed, setFailed] = useState(false);
  const [noble, setNoble] = useState<BenchmarkResult[]>([]);
  const [native, setNative] = useState<BenchmarkResult[]>([]);
  const [selfTest, setSelfTest] = useState<Awaited<ReturnType<typeof compareImplementations>> | null>(null);
  const [choice, setChoice] = useState<ScryptChoice | null>(null);
  const cancelled = useRef(false);
  const engine = useRef(describeJsEngine()).current;
  const nativeAvailable = useRef(isNativeScryptAvailable()).current;
  const lastUnlockMs = useRef(getLastUnlockDurationMs()).current;

  useEffect(() => {
    cancelled.current = false;
    getVaultScryptChoice()
      .then((c) => {
        if (!cancelled.current) setChoice(c);
      })
      .catch(() => {});
    return () => {
      cancelled.current = true; // stop after the current level if the screen goes away
    };
  }, []);

  const run = useCallback(async (kind: Exclude<Busy, null>) => {
    setBusy(kind);
    setFailed(false);
    try {
      if (kind === "selftest") {
        setSelfTest(null);
        const result = await compareImplementations(defaultScrypt, nativeAvailable ? nativeVaultScrypt : null);
        if (!cancelled.current) setSelfTest(result);
      } else {
        const setResults = kind === "noble" ? setNoble : setNative;
        setResults([]);
        await runKdfBenchmark({
          randomBytes: getRandomBytes,
          levels: kind === "noble" ? BENCHMARK_LOG_N : NATIVE_LOG_N,
          scrypt: kind === "noble" ? defaultScrypt : nativeVaultScrypt,
          isCancelled: () => cancelled.current,
          onResult: (r) => {
            if (!cancelled.current) setResults((prev) => [...prev, r]);
          },
        });
      }
    } catch {
      if (!cancelled.current) setFailed(true); // no error text shown or logged
    } finally {
      if (!cancelled.current) setBusy(null);
    }
  }, [nativeAvailable]);

  const timingRows = (levels: readonly number[], results: BenchmarkResult[], running: boolean) =>
    levels.map((logN) => {
      const r = results.find((x) => x.logN === logN);
      const label = `N=2^${logN}, r=8, p=1 (${(128 * 8 * 2 ** logN) / 2 ** 20} MiB)`;
      const value = r ? `${r.seconds.toFixed(2)} s` : running ? STRINGS.speedRunning : STRINGS.speedPending;
      return <Row key={logN} label={label} value={value} />;
    });

  const yesNo = (v: boolean) => (v ? STRINGS.yes : STRINGS.no);

  return (
    <Section title={STRINGS.sectionSpeed}>
      <Text style={{ color: colors.textMuted, fontSize: 13, marginBottom: 6, ...poppins("400") }}>
        {STRINGS.speedIntro}
      </Text>
      <Row label={STRINGS.speedEngine} value={engine} />
      <Row label={STRINGS.nativeAvailable} value={yesNo(nativeAvailable)} />
      <Row
        label={STRINGS.inUse}
        value={
          choice === null
            ? STRINGS.speedPending
            : choice === "native"
              ? STRINGS.inUseNative
              : choice === "unavailable"
                ? STRINGS.inUseUnavailable
                : STRINGS.inUseJs
        }
      />
      <Row
        label={STRINGS.lastUnlock}
        value={lastUnlockMs === null ? STRINGS.speedPending : `${(lastUnlockMs / 1000).toFixed(2)} s`}
      />

      <SubTitle>{STRINGS.selfTitle}</SubTitle>
      <Row
        label={STRINGS.selfMatch}
        value={selfTest ? yesNo(selfTest.allMatch) : busy === "selftest" ? STRINGS.speedRunning : STRINGS.speedPending}
      />
      {selfTest?.vectors.map((v) => (
        <Row key={v.name} label={v.name} value={`JS ${v.nobleOk ? "ok" : "✗"} · native ${v.nativeOk ? "ok" : "✗"}`} />
      ))}
      <ActionButton label={STRINGS.selfRun} busy={busy !== null} onPress={() => void run("selftest")} />

      <SubTitle>{STRINGS.jsTitle}</SubTitle>
      {timingRows(BENCHMARK_LOG_N, noble, busy === "noble")}
      <ActionButton label={STRINGS.speedRun} busy={busy !== null} onPress={() => void run("noble")} />

      <SubTitle>{STRINGS.nativeTitle}</SubTitle>
      {nativeAvailable ? (
        <>
          {timingRows(NATIVE_LOG_N, native, busy === "native")}
          <ActionButton label={STRINGS.nativeRun} busy={busy !== null} onPress={() => void run("native")} />
        </>
      ) : (
        <Row label={STRINGS.nativeAvailable} value={STRINGS.no} />
      )}

      {failed ? (
        <Text style={{ color: colors.error, marginTop: 8, ...poppins("500") }}>{STRINGS.speedFailed}</Text>
      ) : null}
    </Section>
  );
}

export default function StorageCheckScreen() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  const load = useCallback(async () => {
    // Also blocks a deep link to this route in production builds.
    if (!IS_TEST_BUILD || !isRealSession()) {
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
              <Row label={STRINGS.hiddenEmpty} value={state.data.reports.hiddenEmptyTitleOrBody} />
              <Row label={STRINGS.hiddenUnknown} value={state.data.reports.hiddenUnknownShape} />
              <Row label={STRINGS.unexplained} value={state.data.reports.unexplained} />
              <Row label={STRINGS.notShownOnHome} value={state.data.reports.notShownOnHome} />
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
              <Row label={STRINGS.workingReadable} value={state.data.workingDraft.readable} />
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
            <SimulateInterruptedErase />
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
