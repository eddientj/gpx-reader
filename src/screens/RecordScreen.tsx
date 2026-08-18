import Ionicons from "@expo/vector-icons/Ionicons";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import * as Speech from "expo-speech";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AnimatedPressable } from "../components/AnimatedPressable";
import { LiveMapRoute } from "../components/LiveMapRoute";
import { StatCard } from "../components/StatCard";
import { formatDate, formatDistance, formatSpeed } from "../lib/format";
import {
  findStepToAnnounce,
  isOffRoute,
  speakableInstruction,
} from "../lib/navigation";
import { calculateRoute } from "../lib/routing";
import { computeStats } from "../lib/stats";
import { getRide, saveRecordedRide } from "../lib/storage";
import {
  discardRecording,
  elapsedMs,
  getActiveRecording,
  pauseRecording,
  requestLocationPermissions,
  resumeRecording,
  startRecording,
  stopRecording,
  type RecordingState,
} from "../lib/tracking";
import type { RideDetail, RouteStep } from "../lib/types";
import { ensureWeatherCached } from "../lib/weather";
import { useTheme, type Theme } from "../theme/ThemeContext";
import type { RootTabParamList } from "../navigation/types";

type Props = BottomTabScreenProps<RootTabParamList, "Record">;

const POLL_INTERVAL_MS = 2000;
const TICK_INTERVAL_MS = 1000;

export function RecordScreen({ navigation, route }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();

  const [recording, setRecording] = useState<RecordingState | null>(null);
  // Only used to force a re-render every second so the elapsed clock ticks —
  // the actual value is read fresh from elapsedMs() on each render.
  const [, forceTick] = useState(0);
  const [starting, setStarting] = useState(false);
  const [saving, setSaving] = useState(false);

  // Navigate mode: set when this screen was opened via a route's "Navigate"
  // button (src/screens/RideDetailScreen.tsx). targetRoute.points/navSteps
  // get replaced in place on a reroute, so the map/voice always reflect the
  // current plan rather than the one calculated at the start of the ride.
  const [targetRoute, setTargetRoute] = useState<RideDetail | null>(null);
  const [navSteps, setNavSteps] = useState<RouteStep[] | null>(null);
  const [lastAnnouncement, setLastAnnouncement] = useState<string | null>(null);
  const [voiceMuted, setVoiceMuted] = useState(false);
  const spokenIndicesRef = useRef<Set<number>>(new Set());
  const reroutingRef = useRef(false);

  useEffect(() => {
    const routeId = route.params?.navigateRouteId;
    if (!routeId) {
      // Reaching this screen without a target route (e.g. the Record tab
      // pressed directly rather than via a route's Navigate button) should
      // never leave a *previous* Navigate session's route/steps showing —
      // but only when nothing is actively being recorded, since switching
      // tabs mid-navigation shouldn't silently drop the ride in progress.
      if (!getActiveRecording()) resetNavigation();
      return;
    }
    getRide(routeId)
      .then((r) => {
        setTargetRoute(r);
        setNavSteps(r.navigationSteps);
      })
      .catch((err) => {
        Alert.alert(
          "Couldn't load that route",
          err instanceof Error ? err.message : "Unknown error"
        );
      });
  }, [route.params?.navigateRouteId]);

  // Polls the recording file rather than subscribing to location events
  // directly — the background TaskManager task (src/lib/tracking.ts) is the
  // single writer, whether the app is foregrounded or not, so reading its
  // output is simpler and avoids double-counting points. When navigating,
  // each tick also checks the live position against the target route: speak
  // the next maneuver once close enough, and reroute if too far off-path.
  useEffect(() => {
    function tick() {
      const current = getActiveRecording();
      setRecording(current);

      if (!targetRoute || !current || current.paused || current.points.length === 0) {
        return;
      }
      const last = current.points[current.points.length - 1];

      const toAnnounce = navSteps
        ? findStepToAnnounce(last, navSteps, spokenIndicesRef.current)
        : null;
      if (toAnnounce) {
        spokenIndicesRef.current.add(toAnnounce.index);
        for (const skipped of toAnnounce.skippedIndices) {
          spokenIndicesRef.current.add(skipped);
        }
        const text = speakableInstruction(toAnnounce.step);
        setLastAnnouncement(text);
        // The banner still shows the instruction either way — muting only
        // silences the spoken audio, not the visual cue.
        if (!voiceMuted) Speech.speak(text);
      }

      if (!reroutingRef.current && isOffRoute(last, targetRoute.points)) {
        reroutingRef.current = true;
        const destination = targetRoute.points[targetRoute.points.length - 1];
        calculateRoute([last, destination])
          .then((result) => {
            if (!result) return;
            setTargetRoute((prev) => (prev ? { ...prev, points: result.points } : prev));
            setNavSteps(result.steps);
            spokenIndicesRef.current = new Set();
          })
          .finally(() => {
            reroutingRef.current = false;
          });
      }
    }

    tick();
    const poll = setInterval(tick, POLL_INTERVAL_MS);
    return () => clearInterval(poll);
  }, [targetRoute, navSteps, voiceMuted]);

  useEffect(() => {
    if (!recording || recording.paused) return;
    const tick = setInterval(() => forceTick((t) => t + 1), TICK_INTERVAL_MS);
    return () => clearInterval(tick);
  }, [recording?.paused, recording !== null]);

  // Full-screen map only reads as "full screen" if the header and tab bar
  // get out of the way too — both come back once idle.
  useEffect(() => {
    navigation.setOptions({
      headerShown: recording === null,
      tabBarStyle: recording === null ? undefined : { display: "none" },
    });
  }, [recording !== null]);

  async function handleStart() {
    setStarting(true);
    try {
      const { foregroundGranted, backgroundGranted } =
        await requestLocationPermissions();
      if (!foregroundGranted) {
        Alert.alert(
          "Location permission needed",
          "gpx-reader needs location access to record your ride."
        );
        return;
      }
      if (!backgroundGranted) {
        Alert.alert(
          "Background location not granted",
          "Recording will stop if you leave the app or lock your screen. For uninterrupted recording, allow location access \"All the time\" in system settings."
        );
      }
      await startRecording("cycling");
      setRecording(getActiveRecording());
    } catch (err) {
      Alert.alert(
        "Couldn't start recording",
        err instanceof Error ? err.message : "Unknown error"
      );
    } finally {
      setStarting(false);
    }
  }

  // The tab bar/header are hidden by the effect above for as long as
  // `recording` is set — there's otherwise no way to switch tabs (e.g. to
  // check a route) without stopping the ride first. Revealing the tab bar
  // here doesn't touch `recording` at all, so the recording (and the live
  // map, if the user comes back to this tab) keeps running untouched.
  function handleMinimize() {
    navigation.setOptions({ tabBarStyle: undefined });
  }

  function handlePause() {
    pauseRecording();
    setRecording(getActiveRecording());
  }

  function handleResume() {
    resumeRecording();
    setRecording(getActiveRecording());
  }

  // Clears navigate-mode state so a later plain recording (started without
  // a target route) doesn't inherit a stale reference route/steps.
  function resetNavigation() {
    setTargetRoute(null);
    setNavSteps(null);
    setLastAnnouncement(null);
    spokenIndicesRef.current = new Set();
  }

  // No user-facing "discard" affordance here by design — Stop & Save always
  // keeps the ride (even a short/junk one); removing an unwanted one happens
  // afterward via the existing swipe-to-delete on the Routes list, so there's
  // one delete mechanism, not two. The only silent discard is the
  // zero-points case below, where there's nothing a ride could even consist
  // of yet.
  async function handleStopAndSave() {
    if (!recording) return;
    if (recording.points.length === 0) {
      await discardRecording();
      setRecording(null);
      resetNavigation();
      Alert.alert("Nothing recorded", "No GPS data was captured for this ride.");
      return;
    }
    setSaving(true);
    try {
      const stopped = await stopRecording();
      if (!stopped) return;
      const name = `Cycling ride — ${formatDate(stopped.startedAt)}`;
      const summary = await saveRecordedRide(
        stopped.points,
        stopped.activityType,
        name
      );
      ensureWeatherCached(summary.id).catch(() => {});
      setRecording(null);
      resetNavigation();
      // Every recorded ride belongs on the My Rides tab, whether this was a
      // plain recording or a Navigate session against a Routes-tab entry.
      // Navigating straight to a nested screen the My Rides tab has never
      // shown yet can initialize that tab's stack with *only* RideDetail —
      // no Home underneath it to go back to, so the header gets no back
      // button. Visiting Home first establishes it in that stack's history
      // before RideDetail is pushed on top of it.
      navigation.navigate("MyRides", { screen: "Home" });
      navigation.navigate("MyRides", {
        screen: "RideDetail",
        params: { id: summary.id },
      });
    } catch (err) {
      Alert.alert(
        "Couldn't save ride",
        err instanceof Error ? err.message : "Unknown error"
      );
    } finally {
      setSaving(false);
    }
  }

  if (!recording) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.idleTitle}>
          {targetRoute ? `Navigate: ${targetRoute.name}` : "Ready to ride"}
        </Text>
        <Text style={styles.idleSubtitle}>Cycling</Text>
        <AnimatedPressable
          style={[styles.startButton, starting && styles.buttonDisabled]}
          onPress={handleStart}
          disabled={starting}
        >
          <Text style={styles.startButtonText}>
            {starting
              ? "Starting…"
              : targetRoute
                ? "Start Navigating"
                : "Start Recording"}
          </Text>
        </AnimatedPressable>
      </View>
    );
  }

  const stats =
    recording.points.length >= 2 ? computeStats(recording.points) : null;

  return (
    <View style={styles.fullScreenContainer}>
      <LiveMapRoute
        points={recording.points}
        fullScreen
        referencePoints={targetRoute?.points}
      />

      <View style={[styles.topControls, { top: insets.top + theme.spacing.sm }]}>
        <AnimatedPressable style={styles.iconButton} onPress={handleMinimize}>
          <Ionicons name="chevron-down" size={22} color={theme.colors.text} />
        </AnimatedPressable>
        {targetRoute && (
          <AnimatedPressable
            style={styles.iconButton}
            onPress={() => setVoiceMuted((muted) => !muted)}
          >
            <Ionicons
              name={voiceMuted ? "volume-mute" : "volume-high"}
              size={22}
              color={theme.colors.text}
            />
          </AnimatedPressable>
        )}
      </View>

      {lastAnnouncement && (
        <View
          style={[
            styles.navBanner,
            { top: insets.top + theme.spacing.sm + 52 },
          ]}
        >
          <Text style={styles.navBannerText}>{lastAnnouncement}</Text>
        </View>
      )}

      <View
        style={[
          styles.floatingCard,
          { paddingBottom: insets.bottom + theme.spacing.md },
        ]}
      >
        <View style={styles.statsGrid}>
          <StatCard label="Elapsed" value={formatElapsed(elapsedMs(recording))} />
          <StatCard
            label="Distance"
            value={stats ? formatDistance(stats.distanceMeters) : "—"}
          />
          <StatCard
            label="Avg Speed"
            value={stats ? formatSpeed(stats.avgSpeedKmh) : "—"}
          />
        </View>

        <View style={styles.controls}>
          {recording.paused ? (
            <AnimatedPressable style={styles.controlButton} onPress={handleResume}>
              <Text style={styles.controlButtonText}>Resume</Text>
            </AnimatedPressable>
          ) : (
            <AnimatedPressable style={styles.controlButton} onPress={handlePause}>
              <Text style={styles.controlButtonText}>Pause</Text>
            </AnimatedPressable>
          )}
          <AnimatedPressable
            style={[
              styles.controlButton,
              styles.saveButton,
              saving && styles.buttonDisabled,
            ]}
            onPress={handleStopAndSave}
            disabled={saving}
          >
            <Text style={styles.controlButtonText}>
              {saving ? "Saving…" : "Stop & Save"}
            </Text>
          </AnimatedPressable>
        </View>
      </View>
    </View>
  );
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

function makeStyles({ colors, radii, spacing }: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    centered: { alignItems: "center", justifyContent: "center" },
    fullScreenContainer: { flex: 1 },
    floatingCard: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: `${colors.surface}F2`,
      borderTopLeftRadius: radii.lg,
      borderTopRightRadius: radii.lg,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
    },
    topControls: {
      position: "absolute",
      left: spacing.lg,
      right: spacing.lg,
      flexDirection: "row",
      justifyContent: "space-between",
    },
    iconButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: `${colors.surface}F2`,
      alignItems: "center",
      justifyContent: "center",
    },
    navBanner: {
      position: "absolute",
      left: spacing.lg,
      right: spacing.lg,
      backgroundColor: `${colors.primary}F2`,
      borderRadius: radii.md,
      padding: spacing.md,
    },
    navBannerText: {
      color: colors.primaryText,
      fontWeight: "700",
      fontSize: 15,
      textAlign: "center",
    },
    idleTitle: {
      fontSize: 22,
      fontWeight: "700",
      color: colors.text,
      marginBottom: 4,
    },
    idleSubtitle: { fontSize: 14, color: colors.textMuted, marginBottom: 32 },
    startButton: {
      backgroundColor: colors.primary,
      borderRadius: radii.lg,
      paddingVertical: 18,
      paddingHorizontal: 40,
      alignItems: "center",
    },
    startButtonText: {
      color: colors.primaryText,
      fontWeight: "700",
      fontSize: 16,
    },
    buttonDisabled: { opacity: 0.6 },
    statsGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
    },
    controls: {
      flexDirection: "row",
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    controlButton: {
      flex: 1,
      backgroundColor: colors.secondary,
      borderRadius: radii.sm,
      paddingVertical: 14,
      alignItems: "center",
    },
    saveButton: { backgroundColor: colors.primary },
    controlButtonText: { color: colors.primaryText, fontWeight: "600" },
  });
}
