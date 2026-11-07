import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import PinPad from "../../src/components/PinPad";
import Screen from "../../src/components/layout/Screen";
import { useLockoutCountdown } from "../../src/components/useLockoutCountdown";
import { fmt, t } from "../../src/i18n";
import { changeDevicePin, checkPinInSession } from "../../src/state/device";
import { PIN_STRINGS, pinErrorMessage } from "../../src/state/pinMessages";
import { colors } from "../../src/theme/colors";
import { font, lh } from "../../src/theme/fonts";

type Step = "current" | "new" | "confirm" | "working" | "done";

/**
 * Change the real code or the second code: current code (checked, counted toward the lockout),
 * then the new one twice. The two codes must differ (the vault enforces it). No recovery.
 * Codes live only in this component's state; nothing is logged.
 */
export default function ChangeCodeScreen() {
  const { kind: kindParam } = useLocalSearchParams<{ kind?: string }>();
  const kind = kindParam === "cover" ? "cover" : "real";
  const s = t().changeCode;

  const [step, setStep] = useState<Step>("current");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const { lockedSeconds, start } = useLockoutCountdown();

  function clearAll() {
    setCurrent("");
    setNext("");
    setConfirm("");
  }

  async function submitCurrent() {
    if (busy || lockedSeconds > 0 || current.length < 4) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await checkPinInSession(kind, current);
      if (result.ok) {
        setStep("new");
      } else {
        setCurrent("");
        if (result.reason === "locked") start(result.lockoutUntil);
        else setMessage(s.wrong);
      }
    } catch (e) {
      setCurrent("");
      setMessage(pinErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function submitConfirm() {
    if (confirm.length < 4) return;
    if (confirm !== next) {
      setNext("");
      setConfirm("");
      setMessage(PIN_STRINGS.setupMismatch);
      setStep("new");
      return;
    }
    setStep("working");
    setMessage("");
    try {
      await changeDevicePin(kind, current, next);
      clearAll();
      setStep("done");
    } catch (e) {
      const code = e && typeof e === "object" && "code" in e ? (e as { code?: unknown }).code : undefined;
      setNext("");
      setConfirm("");
      if (code === "PINS_NOT_DISTINCT") {
        setMessage(s.mustDiffer);
        setStep("new");
      } else if (code === "WRONG_PIN") {
        clearAll();
        setMessage(s.wrong);
        setStep("current");
      } else {
        setMessage(pinErrorMessage(e));
        setStep("new");
      }
    }
  }

  const title =
    step === "current"
      ? kind === "cover"
        ? s.currentSecondTitle
        : s.currentTitle
      : step === "new"
        ? kind === "cover"
          ? s.newSecondTitle
          : s.newTitle
        : step === "confirm"
          ? s.confirmTitle
          : step === "done"
            ? s.done
            : s.working;

  const lockedMessage = lockedSeconds > 0 ? fmt(PIN_STRINGS.unlockWaitSeconds, { seconds: lockedSeconds }) : "";

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <Pressable
          onPress={() => {
            clearAll();
            router.back();
          }}
          style={{ alignSelf: "flex-start", marginBottom: 16, paddingVertical: 6, paddingEnd: 12 }}
        >
          <Text style={{ color: colors.accent, fontSize: 16, ...font("600") }}>{t().common.back}</Text>
        </Pressable>

        <Text style={{ color: colors.text, fontSize: 24, marginBottom: 8, ...font("700") }}>{title}</Text>
        {step === "new" || step === "confirm" ? (
          <Text style={{ color: colors.textMuted, fontSize: 15, lineHeight: lh(22), marginBottom: 20, ...font("400") }}>
            {s.digits} {s.noRecovery}
          </Text>
        ) : (
          <View style={{ height: 20 }} />
        )}

        {step === "current" ? (
          <PinPad
            value={current}
            onValueChange={(v) => {
              if (busy || lockedSeconds > 0) return;
              setCurrent(v);
              if (message) setMessage("");
            }}
            onSubmit={() => void submitCurrent()}
            disabled={busy || lockedSeconds > 0}
            message={lockedMessage || message || undefined}
            messageIsError={!lockedMessage && !!message}
          />
        ) : null}

        {step === "new" ? (
          <PinPad
            value={next}
            onValueChange={(v) => {
              setNext(v);
              if (message) setMessage("");
            }}
            onSubmit={() => {
              if (next.length < 4) return;
              setMessage("");
              setStep("confirm");
            }}
            message={message || undefined}
            messageIsError={!!message}
          />
        ) : null}

        {step === "confirm" ? (
          <PinPad value={confirm} onValueChange={setConfirm} onSubmit={() => void submitConfirm()} />
        ) : null}

        {step === "working" ? (
          <View style={{ alignItems: "center", paddingVertical: 40 }}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : null}

        {step === "done" ? (
          <Pressable
            onPress={() => router.back()}
            style={{ backgroundColor: colors.accent, paddingVertical: 15, borderRadius: 14, marginTop: 12 }}
          >
            <Text style={{ color: colors.onAccent, textAlign: "center", fontSize: 16, ...font("600") }}>
              {t().common.back}
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
