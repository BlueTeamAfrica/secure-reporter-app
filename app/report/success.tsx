import { View, Text, Pressable } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { t } from "../../src/i18n";
import { colors } from "../../src/theme/colors";
import { poppins, lh } from "../../src/theme/fonts";

export default function SuccessScreen() {
  useLocalSearchParams<{ status?: string }>();
  const s = t().legacy;

  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: colors.background,
        padding: 24,
      }}
    >
      <Text style={{ color: colors.text, fontSize: 24, marginBottom: 16, ...poppins("700") }}>
        {s.saved}
      </Text>

      <Text
        style={{
          color: colors.textMuted,
          marginBottom: 20,
          textAlign: "center",
          lineHeight: lh(22),
          ...poppins("400"),
        }}
      >
        {s.savedBody}
      </Text>

      <Pressable
        onPress={() => router.replace("/home")}
        style={{
          backgroundColor: colors.accent,
          paddingVertical: 16,
          paddingHorizontal: 28,
          borderRadius: 14,
        }}
      >
        <Text style={{ color: colors.onAccent, ...poppins("600") }}>{s.backHome}</Text>
      </Pressable>
    </View>
  );
}
