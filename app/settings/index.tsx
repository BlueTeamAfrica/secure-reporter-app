import { Text, Pressable, ScrollView, Switch, View } from "react-native";
import { router } from "expo-router";
import Constants from "expo-constants";
import { useEffect, useState } from "react";
import Screen from "../../src/components/layout/Screen";
import { getRandomizeKeypadEnabled, setRandomizeKeypad } from "../../src/state/device";
import { colors } from "../../src/theme/colors";
import { poppins } from "../../src/theme/fonts";

export default function SettingsScreen() {
  const [randomizeKeypad, setRandomizeKeypadState] = useState(false);

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
        {/* Hidden: 3 s hold on the title opens the read-only Storage check (test-phase). */}
        <Pressable
          onLongPress={() => router.push("/settings/storage-check")}
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

        <Pressable
          onLongPress={() => router.push("/settings/backup-code")}
          delayLongPress={3000}
          android_disableSound
          style={{ marginTop: 18, paddingVertical: 10 }}
        >
          <Text style={{ color: colors.textMuted, fontSize: 12, ...poppins("400") }}>
            Version {version}
          </Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}
