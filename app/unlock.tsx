import { useEffect, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { router } from "expo-router";
import {
  verifyDevicePin,
  verifyDecoyPin,
  getRandomizeKeypadEnabled,
  resetFailedAttempts,
  recordFailedAttempt,
  getLockoutUntil,
  getRemainingLockSeconds,
} from "../src/state/device";
import { hasReporterProfileComplete } from "../src/state/reporterProfile";
import { setDecoySession, setSessionPin } from "../src/state/session";
import PinPad from "../src/components/PinPad";
import { colors } from "../src/theme/colors";
import { poppins } from "../src/theme/fonts";

export default function UnlockScreen() {
  const [pin, setPin] = useState("");
  const [message, setMessage] = useState("");
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [randomizeKeypad, setRandomizeKeypad] = useState(false);

  useEffect(() => {
    async function loadLockState() {
      const currentLockout = await getLockoutUntil();
      setLockedUntil(currentLockout);
      if (currentLockout) {
        setRemainingSeconds(getRemainingLockSeconds(currentLockout));
        setMessage("Please wait a moment.");
      }
    }
    loadLockState();
  }, []);

  useEffect(() => {
    let cancelled = false;
    getRandomizeKeypadEnabled()
      .then((enabled) => {
        if (!cancelled) setRandomizeKeypad(enabled);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!lockedUntil) return;
    const interval = setInterval(async () => {
      const currentLockout = await getLockoutUntil();
      if (!currentLockout) {
        setLockedUntil(null);
        setRemainingSeconds(0);
        setMessage("");
        return;
      }
      setRemainingSeconds(getRemainingLockSeconds(currentLockout));
    }, 1000);
    return () => clearInterval(interval);
  }, [lockedUntil]);

  async function handleUnlock() {
    if (lockedUntil) return;

    const validReal = await verifyDevicePin(pin);
    if (validReal) {
      await resetFailedAttempts();
      setSessionPin(pin);
      setMessage("");
      const hasProfile = await hasReporterProfileComplete();
      if (!hasProfile) {
        router.replace("/reporter-profile");
        return;
      }
      router.replace("/home");
      return;
    }

    // Decoy access: behaves identically to a normal unlock — never reveals dual-mode.
    const validDecoy = await verifyDecoyPin(pin);
    if (validDecoy) {
      await resetFailedAttempts();
      setDecoySession();
      setMessage("");
      router.replace("/cover");
      return;
    }

    const result = await recordFailedAttempt();
    if (result.locked && result.lockoutUntil) {
      setLockedUntil(result.lockoutUntil);
      setRemainingSeconds(getRemainingLockSeconds(result.lockoutUntil));
      setMessage("Please wait a moment.");
      return;
    }

    setMessage("Try again.");
    setPin("");
  }

  function handleValueChange(v: string) {
    if (lockedUntil) return;
    setPin(v);
    if (message && message !== "Please wait a moment.") setMessage("");
  }

  const padMessage = lockedUntil
    ? `Please wait ${remainingSeconds}s`
    : message || undefined;

  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        backgroundColor: colors.background,
        padding: 24,
      }}
    >
      <View style={{ width: "100%", maxWidth: 360, alignSelf: "center" }}>
        <Text
          style={{
            color: colors.text,
            fontSize: 28,
            marginBottom: 10,
            ...poppins("700"),
          }}
        >
          Continue
        </Text>

        <Text
          style={{
            color: colors.textMuted,
            fontSize: 15,
            lineHeight: 22,
            marginBottom: 28,
            ...poppins("400"),
          }}
        >
          Enter your code to continue.
        </Text>

        <PinPad
          value={pin}
          onValueChange={handleValueChange}
          onSubmit={handleUnlock}
          disabled={!!lockedUntil}
          randomize={randomizeKeypad}
          message={padMessage}
          messageIsError={!lockedUntil && !!message}
        />

        <Pressable
          onPress={handleUnlock}
          disabled={!!lockedUntil || pin.length < 4}
          style={{
            backgroundColor: lockedUntil || pin.length < 4 ? colors.accentSoft : colors.accent,
            paddingVertical: 15,
            borderRadius: 14,
            borderWidth: lockedUntil ? 1 : 0,
            borderColor: lockedUntil ? colors.border : "transparent",
          }}
        >
          <Text
            style={{
              color: lockedUntil ? colors.textMuted : colors.onAccent,
              textAlign: "center",
              fontSize: 16,
              ...poppins("600"),
            }}
          >
            Continue
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
