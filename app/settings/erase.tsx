import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";

import PinPad from "../../src/components/PinPad";
import Screen from "../../src/components/layout/Screen";
import { useLockoutCountdown } from "../../src/components/useLockoutCountdown";
import { fmt, t } from "../../src/i18n";
import { checkPinInSession } from "../../src/state/device";
import { eraseEverythingAndRestart } from "../../src/state/erase";
import { PIN_STRINGS, pinErrorMessage } from "../../src/state/pinMessages";
import { colors } from "../../src/theme/colors";
import { font, lh } from "../../src/theme/fonts";

/**
 * Erase everything (src/state/erase.ts): clear warning, then the real code. The second code (or any other code)
 * erases nothing and counts as a wrong try. Removes both vaults, the queue, all local files,
 * the counters, keypad and language settings, then reloads to first launch.
 */
export default function EraseScreen() {
  const s = t().erase;
  const [pin, setPin] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [erasing, setErasing] = useState(false);
  const { lockedSeconds, start } = useLockoutCountdown();

  async function erase() {
    if (busy || erasing || lockedSeconds > 0 || pin.length < 4) return;
    setBusy(true);
    setMessage("");
    let ok = false;
    try {
      const result = await checkPinInSession("real", pin);
      ok = result.ok;
      if (!result.ok) {
        if (result.reason === "locked") start(result.lockoutUntil);
        else setMessage(s.wrong);
      }
    } catch (e) {
      setMessage(pinErrorMessage(e));
    } finally {
      setPin("");
      setBusy(false);
    }
    if (!ok) return;

    setErasing(true);
    if (!(await eraseEverythingAndRestart())) router.replace("/");
  }

  const lockedMessage = lockedSeconds > 0 ? fmt(PIN_STRINGS.unlockWaitSeconds, { seconds: lockedSeconds }) : "";

  if (erasing) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.accent} />
          <Text style={{ color: colors.textMuted, marginTop: 14, fontSize: 15, ...font("500") }}>{s.working}</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <Pressable
          onPress={() => {
            setPin("");
            router.back();
          }}
          style={{ alignSelf: "flex-start", marginBottom: 16, paddingVertical: 6, paddingEnd: 12 }}
        >
          <Text style={{ color: colors.accent, fontSize: 16, ...font("600") }}>{t().common.back}</Text>
        </Pressable>

        <Text style={{ color: colors.error, fontSize: 24, marginBottom: 12, ...font("700") }}>{s.title}</Text>
        <View
          style={{
            backgroundColor: colors.surface,
            borderWidth: 2,
            borderColor: colors.error,
            borderRadius: 14,
            padding: 16,
            marginBottom: 20,
          }}
        >
          <Text style={{ color: colors.text, fontSize: 15, lineHeight: lh(23), ...font("500") }}>{s.warning}</Text>
        </View>
        <Text style={{ color: colors.text, fontSize: 15, marginBottom: 12, ...font("600") }}>{s.prompt}</Text>

        <PinPad
          value={pin}
          onValueChange={(v) => {
            if (busy || lockedSeconds > 0) return;
            setPin(v);
            if (message) setMessage("");
          }}
          onSubmit={() => void erase()}
          disabled={busy || lockedSeconds > 0}
          message={lockedMessage || message || undefined}
          messageIsError={!lockedMessage && !!message}
        />

        <Pressable
          onPress={() => void erase()}
          disabled={busy || lockedSeconds > 0 || pin.length < 4}
          style={{
            backgroundColor: busy || lockedSeconds > 0 || pin.length < 4 ? colors.accentSoft : colors.error,
            paddingVertical: 15,
            borderRadius: 14,
          }}
        >
          <Text style={{ color: colors.onAccent, textAlign: "center", fontSize: 16, ...font("700") }}>{s.button}</Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}
