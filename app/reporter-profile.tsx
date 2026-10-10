import { useCallback, useState } from "react";
import { Text, TextInput, Pressable, ScrollView } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import Screen from "../src/components/layout/Screen";
import {
  getReporterProfile,
  saveReporterProfile,
  type ReporterProfile,
} from "../src/state/reporterProfile";
import { colors } from "../src/theme/colors";
import { poppins } from "../src/theme/fonts";

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

export default function ReporterProfileScreen() {
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const fromSettings = returnTo === "settings";

  const [name, setName] = useState("");
  const [region, setRegion] = useState("");
  const [phone, setPhone] = useState("");
  const [alias, setAlias] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      async function load() {
        const existing = await getReporterProfile();
        if (cancelled || !existing) return;
        setName(existing.reporterName);
        setRegion(existing.reporterRegion);
        setPhone(existing.reporterPhone);
        setAlias(existing.reporterAlias);
      }
      load();
      return () => {
        cancelled = true;
      };
    }, [])
  );

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Full name is required.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      const next: ReporterProfile = {
        reporterName: trimmed,
        reporterRegion: region.trim(),
        reporterPhone: phone.trim(),
        reporterAlias: alias.trim(),
      };
      await saveReporterProfile(next);
      if (fromSettings) {
        router.back();
      } else {
        router.replace("/home");
      }
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
        <Text style={{ color: colors.text, fontSize: 24, marginBottom: 8, ...poppins("700") }}>
          Workspace profile
        </Text>
        <Text
          style={{
            color: colors.textMuted,
            fontSize: 15,
            lineHeight: 22,
            marginBottom: 24,
            ...poppins("400"),
          }}
        >
          Add a name to personalize this workspace. Region and phone are optional.
        </Text>

        <Text style={{ color: colors.text, marginBottom: 8, ...poppins("600") }}>
          Full name <Text style={{ color: colors.error }}>*</Text>
        </Text>
        <TextInput
          value={name}
          onChangeText={(t) => {
            setName(t);
            if (error) setError("");
          }}
          placeholder="Jane Doe"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="words"
          style={inputStyle}
        />

        <Text style={{ color: colors.text, marginBottom: 8, ...poppins("600") }}>Region</Text>
        <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 6, ...poppins("400") }}>
          Recommended (state, city, or area).
        </Text>
        <TextInput
          value={region}
          onChangeText={setRegion}
          placeholder="e.g. Khartoum"
          placeholderTextColor={colors.textMuted}
          style={inputStyle}
        />

        <Text style={{ color: colors.text, marginBottom: 8, ...poppins("600") }}>Phone</Text>
        <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 6, ...poppins("400") }}>
          Optional.
        </Text>
        <TextInput
          value={phone}
          onChangeText={setPhone}
          placeholder="Contact number"
          placeholderTextColor={colors.textMuted}
          keyboardType="phone-pad"
          style={inputStyle}
        />

        <Text style={{ color: colors.text, marginBottom: 8, ...poppins("600") }}>Display alias</Text>
        <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 6, ...poppins("400") }}>
          Optional. For a future release; real name is used for now.
        </Text>
        <TextInput
          value={alias}
          onChangeText={setAlias}
          placeholder="Leave blank"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          style={inputStyle}
        />

        {error ? (
          <Text style={{ color: colors.error, marginBottom: 12, ...poppins("500") }}>{error}</Text>
        ) : null}

        <Pressable
          onPress={handleSave}
          disabled={saving}
          style={{
            backgroundColor: saving ? colors.accentSoft : colors.accent,
            paddingVertical: 15,
            borderRadius: 14,
            marginBottom: 12,
          }}
        >
          <Text style={{ color: colors.onAccent, textAlign: "center", fontSize: 16, ...poppins("600") }}>
            {saving ? "Saving…" : "Save"}
          </Text>
        </Pressable>

        {fromSettings ? (
          <Pressable onPress={() => router.back()} style={{ paddingVertical: 12 }}>
            <Text style={{ color: colors.textMuted, textAlign: "center", ...poppins("500") }}>
              Cancel
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
