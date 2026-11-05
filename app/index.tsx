import { useEffect, useState } from "react";
import { Text } from "react-native";
import { Redirect } from "expo-router";
import Screen from "../src/components/layout/Screen";
import { isDeviceConfigured } from "../src/state/device";
import { ensureLegacyDataWiped } from "../src/state/legacyWipe";
import { colors } from "../src/theme/colors";
import { poppins } from "../src/theme/fonts";

export default function IndexScreen() {
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(false);

  useEffect(() => {
    async function load() {
      // Silent one-time wipe of data from versions before the vault, BEFORE setup routing.
      await ensureLegacyDataWiped();
      const value = await isDeviceConfigured().catch(() => false);
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
