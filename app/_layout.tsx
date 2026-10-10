import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from "@expo-google-fonts/poppins";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, View, Text, Pressable, Keyboard } from "react-native";
import { Stack, router, usePathname } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { usePreventScreenCapture } from "expo-screen-capture";
import { logSupabaseEnvOnce } from "../src/lib/env/supabaseEnv";
import { isDeviceConfigured } from "../src/state/device";
import {
  SESSION_TIMEOUT_MS,
  clearSessionPin,
  hasSessionTimedOut,
  isDocumentPickerTransientActive,
  isDecoySession,
  isSessionUnlocked,
  notifyUserInteraction,
  setOnUserInteractionHook,
} from "../src/state/session";
import {
  clearRuntimeWorkingReportSnapshot,
  flushRuntimeWorkingReportSnapshotToStorage,
} from "../src/state/editorDraft";
import { cleanupOrphanImportedAttachments } from "../src/lib/attachments/persistLocal";
import { colors } from "../src/theme/colors";
import { poppins } from "../src/theme/fonts";

SplashScreen.preventAutoHideAsync();

logSupabaseEnvOnce();

function isPublicPath(pathname: string) {
  return (
    pathname === "/" ||
    pathname === "/setup" ||
    pathname === "/unlock" ||
    pathname === "/cover"
  );
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
  const [appState, setAppState] = useState(AppState.currentState);
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lockNowRef = useRef<(reason: "background" | "inactivity" | "panic") => Promise<void>>(
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

  const lockNow = useCallback(async (reason: "background" | "inactivity" | "panic") => {
    // Show cover and panic shield immediately for fast visual response.
    setPanicShield(true);
    try {
      router.replace("/cover");
    } catch {
      // ignore
    }

    // Flush any active editor autosave before clearing the PIN.
    await flushRuntimeWorkingReportSnapshotToStorage();
    clearRuntimeWorkingReportSnapshot();

    // Cleanup orphaned attachment files while the PIN is still in memory.
    // Must run before clearSessionPin — the cleanup needs the PIN to build the referenced-file set.
    await cleanupOrphanImportedAttachments().catch(() => {});

    // Clear the in-memory session PIN.
    clearSessionPin();

    console.log("[lock] complete", { reason });
    setTimeout(() => setPanicShield(false), 350);
  }, []);

  useEffect(() => {
    lockNowRef.current = lockNow;
  }, [lockNow]);

  useEffect(() => {
    async function checkRouteAccess() {
      const configured = await isDeviceConfigured();
      if (!configured) return;
      if (isPublicPath(pathname)) return;

      if (isDecoySession()) {
        router.replace("/cover");
        return;
      }

      if (!isSessionUnlocked() || hasSessionTimedOut()) {
        clearSessionPin();
        router.replace("/unlock");
      }
    }

    checkRouteAccess();
  }, [pathname, lockNow]);

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
        if (!isPublicPath(pathname) && isDecoySession()) {
          router.replace("/cover");
          return;
        }
        if (!isPublicPath(pathname) && (!isSessionUnlocked() || hasSessionTimedOut())) {
          clearSessionPin();
          router.replace("/unlock");
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
  const showPanicTriggerZone = !isPublicPath(pathname);

  async function handlePanicMode() {
    await lockNow("panic");
  }

  function registerHeaderTap() {
    const now = Date.now();
    const tapTimes = tapTimesRef.current;
    while (tapTimes.length && now - tapTimes[0] > 650) tapTimes.shift();
    tapTimes.push(now);
    if (tapTimes.length >= 3) {
      tapTimes.length = 0;
      void handlePanicMode();
    }
  }

  if (!fontsLoaded) {
    return null;
  }

  return (
    <View style={{ flex: 1 }} onTouchStart={onUserInteraction}>
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
        <Stack.Screen name="settings/backup-code" />
      </Stack>

      {showPanicTriggerZone ? (
        <View
          pointerEvents="box-none"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 72,
            alignItems: "center",
          }}
        >
          <Pressable
            onPress={registerHeaderTap}
            onLongPress={() => void handlePanicMode()}
            delayLongPress={2000}
            android_disableSound
            style={{ width: 220, height: 72 }}
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
            Protected
          </Text>
        </View>
      ) : null}
    </View>
  );
}
