import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, Text, View } from "react-native";
import { router } from "expo-router";

import { t } from "../i18n";
import { eraseEverythingAndRestart } from "../state/erase";
import { colors } from "../theme/colors";
import { font, lh } from "../theme/fonts";

/**
 * Shown only when the stored data can never be opened (offersRecoveryErase): the same warning
 * and the same erase as Settings, without a code, then back to first launch.
 */
export default function RecoveryErase() {
  const e = t().erase;
  const [erasing, setErasing] = useState(false);

  async function run() {
    setErasing(true);
    if (!(await eraseEverythingAndRestart())) {
      setErasing(false);
      router.replace("/");
    }
  }

  function confirm() {
    Alert.alert(e.title, e.warning, [
      { text: t().common.cancel, style: "cancel" },
      { text: e.button, style: "destructive", onPress: () => void run() },
    ]);
  }

  return (
    <View
      style={{
        marginTop: 20,
        backgroundColor: colors.surface,
        borderWidth: 2,
        borderColor: colors.error,
        borderRadius: 14,
        padding: 16,
      }}
    >
      <Text style={{ color: colors.text, fontSize: 14, lineHeight: lh(21), marginBottom: 14, ...font("500") }}>
        {e.warning}
      </Text>
      <Pressable
        onPress={confirm}
        disabled={erasing}
        style={{ backgroundColor: colors.error, paddingVertical: 14, borderRadius: 12, opacity: erasing ? 0.6 : 1 }}
      >
        {erasing ? (
          <ActivityIndicator color={colors.onAccent} />
        ) : (
          <Text style={{ color: colors.onAccent, textAlign: "center", fontSize: 16, ...font("700") }}>{e.button}</Text>
        )}
      </Pressable>
    </View>
  );
}
