import { useEffect, useState } from "react";
import { AppState, View, Text, Pressable, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import {
  unlockWithPin,
  getRandomizeKeypadEnabled,
  resetFailedAttempts,
  recordFailedAttempt,
  getLockoutUntil,
  getRemainingLockSeconds,
} from "../src/state/device";
import { applyPendingServerReceipts } from "../src/state/drafts";
import { endSession } from "../src/state/session";
import { hasReporterProfileComplete } from "../src/state/reporterProfile";
import { PIN_STRINGS, isPermanentUnlockError, pinErrorMessage } from "../src/state/pinMessages";
import PinPad from "../src/components/PinPad";
import { colors } from "../src/theme/colors";
import { poppins } from "../src/theme/fonts";

/**
 * The only way into a session. The PIN is tried against both vaults (always both); a real PIN
 * continues to the app, the second code opens /cover, anything else counts as a failed attempt.
 * The same screen, wording and timing apply to both codes.
 */
export default function UnlockScreen() {
  const [pin, setPin] = useState("");
  const [message, setMessage] = useState("");
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [randomizeKeypad, setRandomizeKeypad] = useState(false);
  const [working, setWorking] = useState(false);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    async function loadLockState() {
      const currentLockout = await getLockoutUntil();
      setLockedUntil(currentLockout);
      if (currentLockout) {
        setRemainingSeconds(getRemainingLockSeconds(currentLockout));
        setMessage(PIN_STRINGS.unlockWait);
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
    if (lockedUntil || working || blocked || pin.length < 4) return;

    setWorking(true);
    setMessage("");
    let kind: "real" | "cover" | null;
    try {
      kind = await unlockWithPin(pin);
    } catch (e) {
      setWorking(false);
      setPin("");
      setMessage(pinErrorMessage(e));
      if (isPermanentUnlockError(e)) setBlocked(true);
      return;
    }

    if (kind) {
      setPin("");
      await resetFailedAttempts();
      // Backgrounded while the code was being checked: the background lock already ran, so
      // don't leave a session open behind it. Close it; the user types the code again.
      if (AppState.currentState !== "active") {
        endSession();
        setWorking(false);
        return;
      }
      if (kind === "cover") {
        router.replace("/cover");
        return;
      }
      // Receipts that arrived while locked mid-send: finish their local purge now.
      void applyPendingServerReceipts();
      const hasProfile = await hasReporterProfileComplete();
      router.replace(hasProfile ? "/home" : "/reporter-profile");
      return;
    }

    setWorking(false);
    const result = await recordFailedAttempt();
    if (result.locked && result.lockoutUntil) {
      setLockedUntil(result.lockoutUntil);
      setRemainingSeconds(getRemainingLockSeconds(result.lockoutUntil));
      setMessage(PIN_STRINGS.unlockWait);
      setPin("");
      return;
    }

    setMessage(PIN_STRINGS.unlockTryAgain);
    setPin("");
  }

  function handleValueChange(v: string) {
    if (lockedUntil || working || blocked) return;
    setPin(v);
    if (message && message !== PIN_STRINGS.unlockWait) setMessage("");
  }

  const padMessage = lockedUntil ? `Please wait ${remainingSeconds}s` : message || undefined;
  const disabled = !!lockedUntil || working || blocked;

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
        <Text style={{ color: colors.text, fontSize: 28, marginBottom: 10, ...poppins("700") }}>
          {PIN_STRINGS.unlockTitle}
        </Text>

        <Text
          style={{ color: colors.textMuted, fontSize: 15, lineHeight: 22, marginBottom: 28, ...poppins("400") }}
        >
          {PIN_STRINGS.unlockBody}
        </Text>

        <PinPad
          value={pin}
          onValueChange={handleValueChange}
          onSubmit={handleUnlock}
          disabled={disabled}
          randomize={randomizeKeypad}
          message={padMessage}
          messageIsError={!lockedUntil && !!message}
        />

        <Pressable
          onPress={handleUnlock}
          disabled={disabled || pin.length < 4}
          style={{
            backgroundColor: disabled || pin.length < 4 ? colors.accentSoft : colors.accent,
            paddingVertical: 15,
            borderRadius: 14,
            borderWidth: lockedUntil ? 1 : 0,
            borderColor: lockedUntil ? colors.border : "transparent",
            flexDirection: "row",
            justifyContent: "center",
            gap: 10,
          }}
        >
          {working ? <ActivityIndicator color={colors.textMuted} /> : null}
          <Text
            style={{
              color: disabled ? colors.textMuted : colors.onAccent,
              textAlign: "center",
              fontSize: 16,
              ...poppins("600"),
            }}
          >
            {working ? PIN_STRINGS.unlockWorking : PIN_STRINGS.unlockButton}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
