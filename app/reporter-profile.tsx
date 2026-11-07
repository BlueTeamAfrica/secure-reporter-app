import { useCallback, useState } from "react";
import { Text, TextInput, Pressable, ScrollView } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import Screen from "../src/components/layout/Screen";
import { t } from "../src/i18n";
import { getReporterProfile, saveReporterProfile } from "../src/state/reporterProfile";
import { colors } from "../src/theme/colors";
import { font, lh } from "../src/theme/fonts";

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
  ...font("400"),
};

/**
 * One plain "Name" field (D2). Region, phone and alias are no longer collected: they are saved
 * and sent as "" (the desk accepts blank values; the submission format is unchanged).
 */
export default function ReporterProfileScreen() {
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const fromSettings = returnTo === "settings";
  const p = t().profile;

  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      getReporterProfile().then((existing) => {
        if (!cancelled && existing) setName(existing.reporterName);
      });
      return () => {
        cancelled = true;
      };
    }, [])
  );

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError(p.required);
      return;
    }
    setError("");
    setSaving(true);
    try {
      await saveReporterProfile({ reporterName: trimmed, reporterRegion: "", reporterPhone: "", reporterAlias: "" });
      if (fromSettings) router.back();
      else router.replace("/guide"); // first run: the guide comes once, after the name
    } catch {
      setError(t().common.genericError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 32 }}>
        <Text style={{ color: colors.text, fontSize: 24, marginBottom: 8, ...font("700") }}>{p.title}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 15, lineHeight: lh(22), marginBottom: 24, ...font("400") }}>
          {p.body}
        </Text>

        <Text style={{ color: colors.text, marginBottom: 8, ...font("600") }}>{p.label}</Text>
        <TextInput
          value={name}
          onChangeText={(v) => {
            setName(v);
            if (error) setError("");
          }}
          placeholder={p.placeholder}
          placeholderTextColor={colors.textMuted}
          autoCapitalize="words"
          style={inputStyle}
        />

        {error ? <Text style={{ color: colors.error, marginBottom: 12, ...font("500") }}>{error}</Text> : null}

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
          <Text style={{ color: colors.onAccent, textAlign: "center", fontSize: 16, ...font("600") }}>
            {saving ? t().common.saving : t().common.save}
          </Text>
        </Pressable>

        {fromSettings ? (
          <Pressable onPress={() => router.back()} style={{ paddingVertical: 12 }}>
            <Text style={{ color: colors.textMuted, textAlign: "center", ...font("500") }}>{t().common.cancel}</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
