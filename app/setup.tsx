import { useState } from "react";
import { View, Text } from "react-native";
import { router } from "expo-router";
import { markDeviceConfigured, setDevicePin } from "../src/state/device";
import PinPad from "../src/components/PinPad";
import { colors } from "../src/theme/colors";
import { poppins } from "../src/theme/fonts";

type Step = "create" | "confirm";

export default function SetupScreen() {
  const [step, setStep] = useState<Step>("create");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");

  async function handleConfirm() {
    if (confirmPin.length < 4) return;

    if (confirmPin !== pin) {
      setError("Codes do not match. Try again.");
      setStep("create");
      setPin("");
      setConfirmPin("");
      return;
    }

    await setDevicePin(pin);
    await markDeviceConfigured();
    router.replace("/unlock");
  }

  function handlePinSubmit() {
    if (pin.length < 4) return;
    setError("");
    setStep("confirm");
  }

  if (step === "confirm") {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          backgroundColor: colors.background,
          padding: 24,
        }}
      >
        <View style={{ width: "100%", maxWidth: 360, alignSelf: "center" }}>
          <Text
            style={{
              color: colors.text,
              fontSize: 28,
              marginBottom: 10,
              ...poppins("700"),
            }}
          >
            Confirm code
          </Text>
          <Text
            style={{
              color: colors.textMuted,
              fontSize: 15,
              lineHeight: 22,
              marginBottom: 28,
              ...poppins("400"),
            }}
          >
            Enter the same code again to confirm.
          </Text>

          <PinPad
            value={confirmPin}
            onValueChange={(v) => {
              setConfirmPin(v);
              if (error) setError("");
            }}
            onSubmit={handleConfirm}
            message={error || undefined}
            messageIsError={!!error}
          />
        </View>
      </View>
    );
  }

  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        backgroundColor: colors.background,
        padding: 24,
      }}
    >
      <View style={{ width: "100%", maxWidth: 360, alignSelf: "center" }}>
        <Text
          style={{
            color: colors.text,
            fontSize: 28,
            marginBottom: 10,
            ...poppins("700"),
          }}
        >
          Create a code
        </Text>
        <Text
          style={{
            color: colors.textMuted,
            fontSize: 15,
            lineHeight: 22,
            marginBottom: 28,
            ...poppins("400"),
          }}
        >
          You will use this code every time you open the app.
        </Text>

        <PinPad
          value={pin}
          onValueChange={setPin}
          onSubmit={handlePinSubmit}
          message={error || undefined}
          messageIsError={!!error}
        />
      </View>
    </View>
  );
}
