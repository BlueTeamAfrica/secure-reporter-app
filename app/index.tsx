import { useEffect, useState } from "react";
import { Text } from "react-native";
import { Redirect } from "expo-router";
import Screen from "../src/components/layout/Screen";
import { isDeviceConfigured } from "../src/state/device";
import { colors } from "../src/theme/colors";
import { poppins } from "../src/theme/fonts";

export default function IndexScreen() {
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(false);

  useEffect(() => {
    async function load() {
      const value = await isDeviceConfigured();
      setConfigured(value);
      setLoading(false);
    }

    load();
  }, []);

  if (loading) {
    return (
      <Screen>
        <Text style={{ color: colors.text, ...poppins("400") }}>Loading...</Text>
      </Screen>
    );
  }

  if (configured) {
    return <Redirect href="/unlock" />;
  }

  return <Redirect href="/setup" />;
}
