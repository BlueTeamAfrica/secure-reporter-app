import { View, Text, Pressable } from "react-native";
import { router } from "expo-router";

export default function UnlockScreen() {
  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "#0b1020",
        padding: 24,
      }}
    >
      <Text
        style={{
          color: "#ffffff",
          fontSize: 24,
          fontWeight: "700",
          marginBottom: 12,
        }}
      >
        Unlock Screen
      </Text>

      <Text
        style={{
          color: "#94a3b8",
          fontSize: 16,
          textAlign: "center",
          marginBottom: 24,
        }}
      >
        Temporary placeholder for the unlock flow.
      </Text>

      <Pressable
        onPress={() => router.replace("/home")}
        style={{
          backgroundColor: "#2563eb",
          paddingVertical: 14,
          paddingHorizontal: 18,
          borderRadius: 12,
          minWidth: 220,
        }}
      >
        <Text
          style={{
            color: "#ffffff",
            fontSize: 16,
            fontWeight: "600",
            textAlign: "center",
          }}
        >
          Continue to Home
        </Text>
      </Pressable>
    </View>
  );
}
