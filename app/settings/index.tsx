import { Alert, Text, Pressable, ScrollView, Switch, View } from "react-native";
import { router, type Href } from "expo-router";
import * as Application from "expo-application";
import Constants from "expo-constants";
import { versionLabel } from "../../src/ui/versionLabel";
import { useEffect, useState } from "react";
import Screen from "../../src/components/layout/Screen";
import { IS_TEST_BUILD } from "../../src/lib/env/testBuild";
import { fmt, LANGUAGE, t } from "../../src/i18n";
import { getRandomizeKeypadEnabled, setRandomizeKeypad } from "../../src/state/device";
import { switchLanguageAndReload } from "../../src/state/language";
import { otherLanguage } from "../../src/state/languagePlan";
import { isSessionUnlocked } from "../../src/state/session";
import { colors } from "../../src/theme/colors";
import { font, lh } from "../../src/theme/fonts";

const rowStyle = {
  backgroundColor: colors.surface,
  padding: 18,
  borderRadius: 14,
  marginBottom: 12,
  borderWidth: 1,
  borderColor: colors.border,
} as const;

function Row({
  title,
  hint,
  onPress,
  danger,
}: {
  title: string;
  hint: string;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <Pressable onPress={onPress} style={rowStyle}>
      <Text style={{ color: danger ? colors.error : colors.text, fontSize: 17, marginBottom: 4, ...font("600") }}>
        {title}
      </Text>
      <Text style={{ color: colors.textMuted, fontSize: 14, lineHeight: lh(20), ...font("400") }}>{hint}</Text>
    </Pressable>
  );
}

export default function SettingsScreen() {
  const s = t().settings;
  const [randomizeKeypad, setRandomizeKeypadState] = useState(false);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getRandomizeKeypadEnabled()
      .then((v) => {
        if (!cancelled) setRandomizeKeypadState(v);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // "1.0.0 (versionCode)": the build number tells test builds apart on the phone.
  const version = versionLabel(
    Application.nativeApplicationVersion ?? Constants.expoConfig?.version,
    Application.nativeBuildVersion
  );

  const next = otherLanguage(LANGUAGE);
  const nextName = next === "ar" ? t().language.arabic : t().language.english;

  async function switchLanguage() {
    if (switching) return;
    setSwitching(true);
    try {
      // Saves the working draft (same path as lock), closes the session, reloads to the PIN screen.
      await switchLanguageAndReload(next);
    } catch {
      setSwitching(false);
      if (!isSessionUnlocked()) {
        router.replace("/unlock");
        return;
      }
      Alert.alert(s.languageSwitchFailed);
    }
  }

  function confirmLanguage() {
    Alert.alert(s.languageSwitchTitle, s.languageSwitchBody, [
      { text: t().common.cancel, style: "cancel" },
      { text: `${s.languageSwitchConfirm}: ${nextName}`, onPress: () => void switchLanguage() },
    ]);
  }

  const go = (href: Href) => () => router.push(href);

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <Pressable
          onPress={() => router.back()}
          style={{ alignSelf: "flex-start", marginBottom: 16, paddingVertical: 6, paddingEnd: 12 }}
        >
          <Text style={{ color: colors.accent, fontSize: 16, ...font("600") }}>{t().common.back}</Text>
        </Pressable>
        {/* Test builds only: 3 s hold on the title opens the Storage check (also reachable
            from the visible "Diagnostics" row). No hidden gestures in production builds. */}
        <Pressable
          onLongPress={IS_TEST_BUILD ? () => router.push("/settings/storage-check") : undefined}
          delayLongPress={3000}
          android_disableSound
          style={{ alignSelf: "flex-start" }}
        >
          <Text style={{ color: colors.text, fontSize: 28, marginBottom: 20, ...font("700") }}>{s.title}</Text>
        </Pressable>

        <Row title={s.language} hint={`${s.languageCurrent} · ${nextName}`} onPress={confirmLanguage} />
        <Row
          title={s.changeCode}
          hint={s.changeCodeHint}
          onPress={go({ pathname: "/settings/change-code", params: { kind: "real" } })}
        />
        <Row
          title={s.changeSecondCode}
          hint={s.changeSecondCodeHint}
          onPress={go({ pathname: "/settings/change-code", params: { kind: "cover" } })}
        />
        <Row
          title={s.name}
          hint={s.nameHint}
          onPress={go({ pathname: "/reporter-profile", params: { returnTo: "settings" } })}
        />

        <View
          style={{
            ...rowStyle,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 17, marginBottom: 4, ...font("600") }}>{s.keypad}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 14, lineHeight: lh(20), ...font("400") }}>
              {s.keypadHint}
            </Text>
          </View>
          <Switch
            value={randomizeKeypad}
            onValueChange={(value) => {
              setRandomizeKeypadState(value);
              void setRandomizeKeypad(value).catch(() => {});
            }}
          />
        </View>

        <Row title={s.erase} hint={s.eraseHint} onPress={go("/settings/erase")} danger />

        {IS_TEST_BUILD ? (
          <Row title={s.diagnostics} hint={s.diagnosticsHint} onPress={go("/settings/storage-check")} />
        ) : null}

        <View style={{ marginTop: 18, paddingVertical: 10 }}>
          <Text style={{ color: colors.textMuted, fontSize: 12, ...font("400") }}>
            {fmt(s.version, { version })}
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}
