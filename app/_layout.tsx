import { Stack } from "expo-router";

export default function RootLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="setup" />
      <Stack.Screen name="unlock" />
      <Stack.Screen name="home" />
      <Stack.Screen name="report/new" />
      <Stack.Screen name="report/review" />
      <Stack.Screen name="report/upload" />
      <Stack.Screen name="report/success" />
      <Stack.Screen name="receipts/index" />
      <Stack.Screen name="settings/index" />
    </Stack>
  );
}
