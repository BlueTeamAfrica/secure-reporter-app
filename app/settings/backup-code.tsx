import { useState } from "react";
import { Text, TextInput, Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import Screen from "../../src/components/layout/Screen";
import { verifyDevicePin, setDecoyPin } from "../../src/state/device";
import { colors } from "../../src/theme/colors";
import { poppins } from "../../src/theme/fonts";

const inputStyle = {
  width: "100%" as const,
  backgroundColor: colors.surface,
  color: colors.text,
  paddingVertical: 14,
  paddingHorizontal: 16,
  borderRadius: 14,
  marginBottom: 14,
  fontSize: 16,
  borderWidth: 1,
  borderColor: colors.border,
  ...poppins("400"),
};

export default function BackupCodeScreen() {
  const [step, setStep] = useState<"verify" | "set">("verify");
  const [currentCode, setCurrentCode] = useState("");
  const [newCode, setNewCode] = useState("");
  const [confirmCode, setConfirmCode] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleVerify() {
    setError("");
    setStatus("");
    if (currentCode.trim().length < 4) return;

    const ok = await verifyDevicePin(currentCode.trim());
    if (!ok) {
      setError("Try again.");
      return;
    }

    setStep("set");
    setStatus("");
  }

  async function handleSave() {
    const real = currentCode.trim();
    const next = newCode.trim();
    const confirm = confirmCode.trim();

    setError("");
    setStatus("");

    if (next.length < 4) return;
    if (next !== confirm) {
      setError("Codes do not match");
      return;
    }
    if (next === real) {
      setError("Choose a different code");
      return;
    }

    setSaving(true);
    try {
      await setDecoyPin(next);
      setStatus("Backup code updated");
      setTimeout(() => {
        router.back();
      }, 500);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          onPress={() => router.back()}
          style={{ alignSelf: "flex-start", marginBottom: 16, paddingVertical: 6, paddingRight: 12 }}
        >
          <Text style={{ color: colors.accent, fontSize: 16, ...poppins("600") }}>← Back</Text>
        </Pressable>

        <Text style={{ color: colors.text, fontSize: 24, marginBottom: 8, ...poppins("700") }}>
          Change backup code
        </Text>
        <Text
          style={{
            color: colors.textMuted,
            fontSize: 14,
            lineHeight: 20,
            marginBottom: 18,
            ...poppins("400"),
          }}
        >
          Update your backup code.
        </Text>

        {step === "verify" ? (
          <>
            <Text style={{ color: colors.text, marginBottom: 8, ...poppins("600") }}>
              Current code
            </Text>
            <TextInput
              value={currentCode}
              onChangeText={(t) => {
                setCurrentCode(t);
                if (error) setError("");
                if (status) setStatus("");
              }}
              placeholder="Code"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={6}
              style={inputStyle}
            />

            {error ? (
              <Text style={{ color: colors.error, marginBottom: 10, ...poppins("500") }}>{error}</Text>
            ) : null}

            <Pressable
              onPress={handleVerify}
              style={{
                backgroundColor: colors.accent,
                paddingVertical: 15,
                borderRadius: 14,
                marginTop: 6,
              }}
            >
              <Text style={{ color: colors.onAccent, textAlign: "center", fontSize: 16, ...poppins("600") }}>
                Continue
              </Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={{ color: colors.text, marginBottom: 8, ...poppins("600") }}>
              New backup code
            </Text>
            <TextInput
              value={newCode}
              onChangeText={(t) => {
                setNewCode(t);
                if (error) setError("");
                if (status) setStatus("");
              }}
              placeholder="New code"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={6}
              style={inputStyle}
            />

            <Text style={{ color: colors.text, marginBottom: 8, ...poppins("600") }}>
              Confirm new backup code
            </Text>
            <TextInput
              value={confirmCode}
              onChangeText={(t) => {
                setConfirmCode(t);
                if (error) setError("");
                if (status) setStatus("");
              }}
              placeholder="Confirm code"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={6}
              style={inputStyle}
            />

            {error ? (
              <Text style={{ color: colors.error, marginBottom: 10, ...poppins("500") }}>{error}</Text>
            ) : null}
            {status ? (
              <Text style={{ color: colors.success, marginBottom: 10, ...poppins("500") }}>{status}</Text>
            ) : null}

            <Pressable
              onPress={handleSave}
              disabled={saving}
              style={{
                backgroundColor: saving ? colors.accentSoft : colors.accent,
                paddingVertical: 15,
                borderRadius: 14,
                marginTop: 6,
              }}
            >
              <Text style={{ color: colors.onAccent, textAlign: "center", fontSize: 16, ...poppins("600") }}>
                {saving ? "Saving…" : "Save"}
              </Text>
            </Pressable>

            <View style={{ height: 12 }} />
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

