import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from "@expo-google-fonts/poppins";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, View, Text, Pressable, Keyboard, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Stack, router, usePathname } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { usePreventScreenCapture } from "expo-screen-capture";
import { logSupabaseEnvOnce } from "../src/lib/env/supabaseEnv";
import { isDeviceConfigured } from "../src/state/device";
import {
  SESSION_TIMEOUT_MS,
  endSession,
  hasSessionTimedOut,
  isDocumentPickerTransientActive,
  isDecoySession,
  isRealSession,
  isSessionUnlocked,
  notifyUserInteraction,
  setOnUserInteractionHook,
  switchToCoverSession,
} from "../src/state/session";
import {
  clearRuntimeWorkingReportSnapshot,
  flushRuntimeWorkingReportSnapshotToStorage,
} from "../src/state/editorDraft";
import { cleanupOrphanImportedAttachments } from "../src/lib/attachments/persistLocal";
import NotesButton from "../src/components/NotesButton";
import { t } from "../src/i18n";
import { bandLayout } from "../src/ui/topBand";
import { colors } from "../src/theme/colors";
import { poppins } from "../src/theme/fonts";

SplashScreen.preventAutoHideAsync();

logSupabaseEnvOnce();

/**
 * Lock and unlock paths (threat-model note, Phase 2a):
 * - Locked: no data key in memory. Only the PIN screen is reachable.
 * - Real session: the real data key is in memory; every real screen is reachable.
 * - Cover session: only the cover key is in memory; real records are cryptographically
 *   unreachable, and routing keeps the session on /cover.
 * - Lock (background, inactivity): shield -> /unlock -> flush working draft -> attachment
 *   cleanup -> vault lock. Never /cover: a lock always asks for a code.
 * - Panic (real session): shield -> flush -> cleanup -> switch to the cover session without a
 *   PIN (the real vault stores the cover key; the real key is zeroed) -> /cover. If the switch
 *   fails, the vault is locked and the PIN screen is shown instead.
 */
function isPublicPath(pathname: string) {
  return pathname === "/" || pathname === "/setup" || pathname === "/unlock";
}

/** Where the current session may not be: null if the path is allowed. */
async function redirectFor(pathname: string): Promise<"/" | "/unlock" | "/cover" | null> {
  if (isPublicPath(pathname)) return null;
  if (!(await isDeviceConfigured())) return "/";
  if (!isSessionUnlocked() || hasSessionTimedOut()) return "/unlock";
  if (isDecoySession() && pathname !== "/cover") return "/cover";
  return null;
}

export default function RootLayout() {
  // usePreventScreenCapture(); // TODO: re-enable before release

  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const [appState, setAppState] = useState(AppState.currentState);
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lockNowRef = useRef<(reason: "background" | "inactivity") => Promise<void>>(
    async () => {}
  );

  const [panicShield, setPanicShield] = useState(false);

  // Triple-tap / long-press panic trigger — useRef to avoid useMemo mutation anti-pattern.
  const tapTimesRef = useRef<number[]>([]);

  const clearInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
  }, []);

  const scheduleInactivityLock = useCallback(() => {
    clearInactivityTimer();
    inactivityTimerRef.current = setTimeout(() => {
      void lockNowRef.current("inactivity");
    }, SESSION_TIMEOUT_MS);
  }, [clearInactivityTimer]);

  const onUserInteraction = useCallback(() => {
    scheduleInactivityLock();
    notifyUserInteraction();
  }, [scheduleInactivityLock]);

  /** Flush + cleanup while the real vault is still open. Both no-ops outside a real session. */
  const saveBeforeClosingRealSession = useCallback(async () => {
    await flushRuntimeWorkingReportSnapshotToStorage();
    clearRuntimeWorkingReportSnapshot();
    // Needs the open vault to read the referenced-file set; skips itself if it can't.
    await cleanupOrphanImportedAttachments().catch(() => {});
  }, []);

  const lockNow = useCallback(
    async (reason: "background" | "inactivity") => {
      // Shield and PIN screen first, for an instant visual response.
      setPanicShield(true);
      try {
        router.replace("/unlock");
      } catch {
        // ignore
      }
      try {
        await saveBeforeClosingRealSession();
      } finally {
        endSession(); // vault.lock(): overwrites the in-memory data key
        console.log("[lock] complete", { reason });
        setTimeout(() => setPanicShield(false), 350);
      }
    },
    [saveBeforeClosingRealSession]
  );

  const panicNow = useCallback(async () => {
    setPanicShield(true);
    try {
      if (isDecoySession()) {
        router.replace("/cover");
        return;
      }
      if (!isRealSession()) {
        endSession();
        router.replace("/unlock");
        return;
      }
      try {
        await saveBeforeClosingRealSession();
        await switchToCoverSession(); // zeroes the real key; locks on failure
        router.replace("/cover");
        console.log("[panic] complete");
      } catch {
        endSession();
        router.replace("/unlock");
        console.log("[panic] fell back to lock");
      }
    } finally {
      scheduleInactivityLock();
      setTimeout(() => setPanicShield(false), 350);
    }
  }, [saveBeforeClosingRealSession, scheduleInactivityLock]);

  useEffect(() => {
    lockNowRef.current = lockNow;
  }, [lockNow]);

  useEffect(() => {
    async function checkRouteAccess() {
      const target = await redirectFor(pathname);
      if (!target) return;
      if (target === "/unlock") endSession();
      router.replace(target);
    }

    void checkRouteAccess();
  }, [pathname]);

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", async (nextState) => {
      setAppState(nextState);

      const configured = await isDeviceConfigured();
      if (!configured) return;

      if (nextState === "background" || nextState === "inactive") {
        if (isDocumentPickerTransientActive()) {
          console.log(
            "[session] skip PIN clear: system document picker transient (state:",
            nextState,
            ")"
          );
          return;
        }
        await lockNow("background");
        return;
      }

      if (nextState === "active") {
        const target = await redirectFor(pathname);
        if (target) {
          if (target === "/unlock") endSession();
          router.replace(target);
          if (target !== "/cover") return;
        }
        scheduleInactivityLock();
      }
    });

    return () => subscription.remove();
  }, [pathname, lockNow, scheduleInactivityLock]);

  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", onUserInteraction);
    const hide = Keyboard.addListener("keyboardDidHide", onUserInteraction);
    return () => {
      show.remove();
      hide.remove();
    };
  }, [onUserInteraction]);

  useEffect(() => {
    setOnUserInteractionHook(() => {
      scheduleInactivityLock();
    });
    return () => setOnUserInteractionHook(null);
  }, [scheduleInactivityLock]);

  const showPrivacyShield = appState === "inactive" || appState === "background";
  // Real screens only: on /cover the panic has nowhere further to go.
  const showPanicTriggerZone = !isPublicPath(pathname) && pathname !== "/cover";
  // Top band (Phase 2b items 3-4): the Notes button and the gesture zone, and nothing else.
  // Screens render below it, so no screen control can sit under the zone.
  const band = bandLayout(screenWidth, insets.top);

  function handlePanicMode() {
    void panicNow();
  }

  /** Visible Notes button: the same panic path as the gesture (panicNow saves the draft first). */
  function handleNotesButton() {
    Keyboard.dismiss();
    handlePanicMode();
  }

  function registerHeaderTap() {
    const now = Date.now();
    const tapTimes = tapTimesRef.current;
    while (tapTimes.length && now - tapTimes[0] > 650) tapTimes.shift();
    tapTimes.push(now);
    if (tapTimes.length >= 3) {
      tapTimes.length = 0;
      handlePanicMode();
    }
  }

  if (!fontsLoaded) {
    return null;
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }} onTouchStart={onUserInteraction}>
      <View style={{ flex: 1, paddingTop: showPanicTriggerZone ? band.height : 0 }}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="setup" />
        <Stack.Screen name="unlock" />
        <Stack.Screen name="cover" />
        <Stack.Screen name="home" />
        <Stack.Screen name="reporter-profile" />
        <Stack.Screen name="report/new" />
        <Stack.Screen name="report/review" />
        <Stack.Screen name="report/upload" />
        <Stack.Screen name="report/success" />
        <Stack.Screen name="receipts" />
        <Stack.Screen name="settings" />
      </Stack>
      </View>

      {showPanicTriggerZone ? (
        <View
          pointerEvents="box-none"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: band.height,
            backgroundColor: colors.background,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          }}
        >
          <View style={{ position: "absolute", top: band.button.top, start: band.button.start }}>
            <NotesButton onPress={handleNotesButton} />
          </View>
          <Pressable
            onPress={registerHeaderTap}
            onLongPress={handlePanicMode}
            delayLongPress={2000}
            android_disableSound
            style={{
              position: "absolute",
              top: 0,
              left: band.zone.left,
              width: band.zone.width,
              height: band.zone.height,
            }}
          >
            <View style={{ flex: 1, backgroundColor: "transparent" }} />
          </Pressable>
        </View>
      ) : null}

      {showPrivacyShield || panicShield ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: colors.overlay,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            style={{
              color: colors.textMuted,
              fontSize: 18,
              letterSpacing: 0.4,
              ...poppins("600"),
            }}
          >
            {t().common.appName}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
