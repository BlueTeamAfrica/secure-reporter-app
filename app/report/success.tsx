import { View, Text, Pressable } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { colors } from "../../src/theme/colors";
import { poppins } from "../../src/theme/fonts";

export default function SuccessScreen() {
  const { status } = useLocalSearchParams<{ status?: string }>();

  const label =
    status === "ready"
      ? "marked as ready"
      : status === "queued"
        ? "queued locally"
        : "saved";

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
        Saved
      </Text>

      <Text
        style={{
          color: colors.textMuted,
          marginBottom: 20,
          textAlign: "center",
          lineHeight: 22,
          ...poppins("400"),
        }}
      >
        Your note was {label}.
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
        <Text style={{ color: colors.onAccent, ...poppins("600") }}>Back to Home</Text>
      </Pressable>
    </View>
  );
}
