import { View, Text, Pressable } from "react-native";
import { router } from "expo-router";
import { markDeviceConfigured } from "../src/state/device";

export default function SetupScreen() {
  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#0b1020" }}>
      <Text style={{ color: "#ffffff", fontSize: 24, fontWeight: "700", marginBottom: 20 }}>
        Setup Screen
      </Text>

      <Pressable
        onPress={() => {
          markDeviceConfigured();
          router.replace("/unlock");
        }}
        style={{
          backgroundColor: "#2563eb",
          padding: 14,
          borderRadius: 10,
        }}
      >
        <Text style={{ color: "#fff" }}>Complete Setup</Text>
      </Pressable>
    </View>
  );
}
