import { I18nManager, Text, Pressable, ScrollView, Switch, View } from "react-native";
import { router } from "expo-router";
import Constants from "expo-constants";
import { useEffect, useState } from "react";
import Screen from "../../src/components/layout/Screen";
import { IS_TEST_BUILD } from "../../src/lib/env/testBuild";
import { getRandomizeKeypadEnabled, setRandomizeKeypad } from "../../src/state/device";
import { getStoredLanguage, switchLanguageAndReload } from "../../src/state/language";
import { otherLanguage, type Language } from "../../src/state/languagePlan";
import { isSessionUnlocked } from "../../src/state/session";
import { colors } from "../../src/theme/colors";
import { poppins } from "../../src/theme/fonts";

const LANGUAGE_NAMES: Record<Language, string> = { en: "English", ar: "Arabic" };

export default function SettingsScreen() {
  const [randomizeKeypad, setRandomizeKeypadState] = useState(false);
  const [storedLanguage, setStoredLanguage] = useState<Language | null>(null);
  const [languageBusy, setLanguageBusy] = useState(false);
  const [languageFailed, setLanguageFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getRandomizeKeypadEnabled()
      .then((v) => {
        if (!cancelled) setRandomizeKeypadState(v);
      })
      .catch(() => {});
    if (IS_TEST_BUILD) {
      getStoredLanguage()
        .then((v) => {
          if (!cancelled) setStoredLanguage(v);
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, []);

  const nextLanguage = otherLanguage(storedLanguage ?? (I18nManager.isRTL ? "ar" : "en"));

  async function onSwitchLanguage() {
    if (languageBusy) return;
    setLanguageBusy(true);
    setLanguageFailed(false);
    try {
      await switchLanguageAndReload(nextLanguage);
    } catch {
      // The data key may already be gone, and then the only safe screen is the PIN screen.
      if (!isSessionUnlocked()) {
        router.replace("/unlock");
        return;
      }
      setLanguageBusy(false);
      setLanguageFailed(true);
    }
  }

  const version =
    (Constants.expoConfig && Constants.expoConfig.version) ||
    (((Constants as any).manifest?.version as string | undefined) ?? "") ||
    "1.0.0";

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <Pressable
          onPress={() => router.back()}
          style={{ alignSelf: "flex-start", marginBottom: 16, paddingVertical: 6, paddingRight: 12 }}
        >
          <Text style={{ color: colors.accent, fontSize: 16, ...poppins("600") }}>← Back</Text>
        </Pressable>
        {/* Test builds only: 3 s hold on the title opens the Storage check (also reachable
            from the visible "Diagnostics" row). No hidden gestures in production builds. */}
        <Pressable
          onLongPress={IS_TEST_BUILD ? () => router.push("/settings/storage-check") : undefined}
          delayLongPress={3000}
          android_disableSound
          style={{ alignSelf: "flex-start" }}
        >
          <Text style={{ color: colors.text, fontSize: 28, marginBottom: 8, ...poppins("700") }}>
            Settings
          </Text>
        </Pressable>
        <Text
          style={{
            color: colors.textMuted,
            fontSize: 15,
            lineHeight: 22,
            marginBottom: 28,
            ...poppins("400"),
          }}
        >
          Manage your workspace profile.
        </Text>

        <Pressable
          onPress={() =>
            router.push({
              pathname: "/reporter-profile",
              params: { returnTo: "settings" },
            })
          }
          style={{
            backgroundColor: colors.surface,
            padding: 18,
            borderRadius: 14,
            marginBottom: 12,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Text style={{ color: colors.text, fontSize: 17, marginBottom: 4, ...poppins("600") }}>
            Workspace profile
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 14, lineHeight: 20, ...poppins("400") }}>
            Review or edit your name, region, and phone.
          </Text>
        </Pressable>

        <View
          style={{
            backgroundColor: colors.surface,
            padding: 18,
            borderRadius: 14,
            marginBottom: 12,
            borderWidth: 1,
            borderColor: colors.border,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 17, marginBottom: 4, ...poppins("600") }}>
              Randomize keypad
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 14, lineHeight: 20, ...poppins("400") }}>
              Shuffle key positions on the code screen.
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

        {IS_TEST_BUILD ? (
          <Pressable
            onPress={() => router.push("/settings/storage-check")}
            style={{
              backgroundColor: colors.surface,
              padding: 18,
              borderRadius: 14,
              marginBottom: 12,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text style={{ color: colors.text, fontSize: 17, marginBottom: 4, ...poppins("600") }}>
              Diagnostics
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 14, lineHeight: 20, ...poppins("400") }}>
              Storage counts and speed test. Test builds only.
            </Text>
          </Pressable>
        ) : null}

        {IS_TEST_BUILD ? (
          <Pressable
            onPress={() => void onSwitchLanguage()}
            disabled={languageBusy}
            style={{
              backgroundColor: colors.surface,
              padding: 18,
              borderRadius: 14,
              marginBottom: 12,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text style={{ color: colors.text, fontSize: 17, marginBottom: 4, ...poppins("600") }}>
              Switch to {LANGUAGE_NAMES[nextLanguage]}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 14, lineHeight: 20, ...poppins("400") }}>
              {languageFailed
                ? "Could not switch. Try again."
                : `Saved: ${storedLanguage ? LANGUAGE_NAMES[storedLanguage] : "not set"}. Layout: ${
                    I18nManager.isRTL ? "RTL" : "LTR"
                  }. The app reloads. Test builds only.`}
            </Text>
          </Pressable>
        ) : null}

        <View style={{ marginTop: 18, paddingVertical: 10 }}>
          <Text style={{ color: colors.textMuted, fontSize: 12, ...poppins("400") }}>
            Version {version}
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}
