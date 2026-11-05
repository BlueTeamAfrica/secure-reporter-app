import { useState } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { createDevicePins } from "../src/state/device";
import { PIN_STRINGS, pinErrorMessage } from "../src/state/pinMessages";
import PinPad from "../src/components/PinPad";
import { colors } from "../src/theme/colors";
import { poppins } from "../src/theme/fonts";

/**
 * First-run setup: real code (twice) → second code (twice, must differ) → acknowledgment →
 * create both vaults (leaves a real session open) → existing profile step.
 * Codes live only in this component's state until createDevicePins; nothing is logged.
 */
type Step = "realCreate" | "realConfirm" | "coverCreate" | "coverConfirm" | "ack" | "working";

function Header({ title, body }: { title: string; body: string }) {
  return (
    <>
      <Text style={{ color: colors.text, fontSize: 28, marginBottom: 10, ...poppins("700") }}>{title}</Text>
      <Text
        style={{ color: colors.textMuted, fontSize: 15, lineHeight: 22, marginBottom: 28, ...poppins("400") }}
      >
        {body}
      </Text>
    </>
  );
}

export default function SetupScreen() {
  const [step, setStep] = useState<Step>("realCreate");
  const [realPin, setRealPin] = useState("");
  const [realConfirm, setRealConfirm] = useState("");
  const [coverPin, setCoverPin] = useState("");
  const [coverConfirm, setCoverConfirm] = useState("");
  const [error, setError] = useState("");

  function restartReal(message: string) {
    setError(message);
    setRealPin("");
    setRealConfirm("");
    setCoverPin("");
    setCoverConfirm("");
    setStep("realCreate");
  }

  function restartCover(message: string) {
    setError(message);
    setCoverPin("");
    setCoverConfirm("");
    setStep("coverCreate");
  }

  async function finish() {
    setStep("working");
    setError("");
    try {
      await createDevicePins(realPin, coverPin);
      setRealPin("");
      setRealConfirm("");
      setCoverPin("");
      setCoverConfirm("");
      router.replace("/reporter-profile");
    } catch (e) {
      const message = pinErrorMessage(e);
      if (message === PIN_STRINGS.setupSameAsFirst) restartCover(message);
      else if (message === PIN_STRINGS.errInvalidPin) restartReal(message);
      else {
        // KDF_UNAVAILABLE and other failures: stay on the acknowledgment step with the message.
        setError(message);
        setStep("ack");
      }
    }
  }

  let content: React.ReactNode;
  switch (step) {
    case "realCreate":
      content = (
        <>
          <Header title={PIN_STRINGS.setupCreateTitle} body={PIN_STRINGS.setupCreateBody} />
          <PinPad
            value={realPin}
            onValueChange={(v) => {
              setRealPin(v);
              if (error) setError("");
            }}
            onSubmit={() => {
              if (realPin.length < 4) return;
              setError("");
              setStep("realConfirm");
            }}
            message={error || undefined}
            messageIsError={!!error}
          />
        </>
      );
      break;
    case "realConfirm":
      content = (
        <>
          <Header title={PIN_STRINGS.setupConfirmTitle} body={PIN_STRINGS.setupConfirmBody} />
          <PinPad
            value={realConfirm}
            onValueChange={setRealConfirm}
            onSubmit={() => {
              if (realConfirm.length < 4) return;
              if (realConfirm !== realPin) return restartReal(PIN_STRINGS.setupMismatch);
              setStep("coverCreate");
            }}
          />
        </>
      );
      break;
    case "coverCreate":
      content = (
        <>
          <Header title={PIN_STRINGS.setupSecondTitle} body={PIN_STRINGS.setupSecondBody} />
          <PinPad
            value={coverPin}
            onValueChange={(v) => {
              setCoverPin(v);
              if (error) setError("");
            }}
            onSubmit={() => {
              if (coverPin.length < 4) return;
              // The vault also rejects equal codes (after digit normalisation) at creation.
              if (coverPin === realPin) return restartCover(PIN_STRINGS.setupSameAsFirst);
              setError("");
              setStep("coverConfirm");
            }}
            message={error || undefined}
            messageIsError={!!error}
          />
        </>
      );
      break;
    case "coverConfirm":
      content = (
        <>
          <Header title={PIN_STRINGS.setupSecondConfirmTitle} body={PIN_STRINGS.setupConfirmBody} />
          <PinPad
            value={coverConfirm}
            onValueChange={setCoverConfirm}
            onSubmit={() => {
              if (coverConfirm.length < 4) return;
              if (coverConfirm !== coverPin) return restartCover(PIN_STRINGS.setupMismatch);
              setStep("ack");
            }}
          />
        </>
      );
      break;
    case "ack":
      content = (
        <>
          <Header title={PIN_STRINGS.setupAckTitle} body={PIN_STRINGS.setupAckBody} />
          {error ? (
            <Text style={{ color: colors.error, marginBottom: 16, ...poppins("500") }}>{error}</Text>
          ) : null}
          <Pressable
            onPress={() => void finish()}
            style={{ backgroundColor: colors.accent, paddingVertical: 15, borderRadius: 14 }}
          >
            <Text style={{ color: colors.onAccent, textAlign: "center", fontSize: 16, ...poppins("600") }}>
              {PIN_STRINGS.setupAckButton}
            </Text>
          </Pressable>
        </>
      );
      break;
    case "working":
      content = (
        <View style={{ alignItems: "center", paddingVertical: 40 }}>
          <ActivityIndicator color={colors.accent} />
          <Text style={{ color: colors.textMuted, marginTop: 14, fontSize: 15, ...poppins("500") }}>
            {PIN_STRINGS.setupWorking}
          </Text>
        </View>
      );
      break;
  }

  return (
    <View style={{ flex: 1, justifyContent: "center", backgroundColor: colors.background, padding: 24 }}>
      <View style={{ width: "100%", maxWidth: 360, alignSelf: "center" }}>{content}</View>
    </View>
  );
}
