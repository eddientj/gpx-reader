import Ionicons from "@expo/vector-icons/Ionicons";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { CompositeScreenProps } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { AnimatedPressable } from "../components/AnimatedPressable";
import { BreakdownBar } from "../components/BreakdownBar";
import { ElevationChart } from "../components/ElevationChart";
import { MapRoute } from "../components/MapRoute";
import { StatCard } from "../components/StatCard";
import { WaypointsList } from "../components/WaypointsList";
import { WeatherCard } from "../components/WeatherCard";
import {
  formatDistance,
  formatDurationOrEstimate,
  formatElevation,
  formatSpeed,
} from "../lib/format";
import { exportRideGpx } from "../lib/export";
import { reverseGeocode } from "../lib/geocoding";
import { getRide, saveRouteAnalysis, saveWaypoints, saveWeather } from "../lib/storage";
import type { RideDetail, RouteAnalysis, Waypoint, WeatherSummary } from "../lib/types";
import { analyzeRoute } from "../lib/waytypes";
import { fetchHistoricalWeather } from "../lib/weather";
import { useTheme, type Theme } from "../theme/ThemeContext";
import type { RootStackParamList, RootTabParamList } from "../navigation/types";

// Nested inside the Routes tab's own stack, but needs to hand off to the
// sibling Record tab to start navigation — CompositeScreenProps merges both
// navigators' `navigate` signatures so that cross-tab call typechecks.
type Props = CompositeScreenProps<
  NativeStackScreenProps<RootStackParamList, "RideDetail">,
  BottomTabScreenProps<RootTabParamList>
>;

// Turn-by-turn navigation cues ("Turn left", "At roundabout take exit 3")
// get exported as GPX waypoints by route-planning tools just as often as
// real points of interest are — and a route can have dozens to hundreds of
// them. There's no reliable way to tell them apart from a POI by content
// alone, but volume is a decent signal: a curated set of interesting stops
// is normally a handful, not fifty. Past this many, showing them as a list
// would just be a wall of driving directions, not useful waypoints.
const MAX_MEANINGFUL_WAYPOINTS = 20;
const NOMINATIM_RATE_LIMIT_MS = 1100;

export function RideDetailScreen({ route, navigation }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [ride, setRide] = useState<RideDetail | null>(null);
  const [analysis, setAnalysis] = useState<RouteAnalysis>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [weather, setWeather] = useState<WeatherSummary | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  // This screen is shared by both the Routes and My Rides stacks, and
  // `RecordScreen` reaches it via a cross-tab navigate after Stop & Save —
  // which, if that tab's stack already had a *different* RideDetail open
  // from earlier, updates that existing instance in place rather than
  // pushing a new one on top of a fresh Home, leaving nothing to go back
  // to. Rather than depend on getting that cross-navigator dispatch exactly
  // right, this always has a working way out: back up if there's somewhere
  // to go back to, otherwise return to this stack's own Home.
  useEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <Pressable
          style={styles.headerBackButton}
          onPress={() =>
            navigation.canGoBack()
              ? navigation.goBack()
              : navigation.navigate("Home")
          }
          hitSlop={12}
        >
          <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
        </Pressable>
      ),
    });
  }, [theme]);

  // Available regardless of origin — a recorded ride, an import, or a
  // never-ridden plan can all be handed off as a normal GPX file (to Strava,
  // Komoot, Drive, ...). Kept as its own effect (rather than folded into the
  // headerLeft one above) since it depends on `ride` having loaded, which
  // the back button doesn't need to wait for.
  useEffect(() => {
    navigation.setOptions({
      headerRight: () =>
        ride && (
          <Pressable
            style={styles.headerBackButton}
            onPress={handleExport}
            disabled={exporting}
            hitSlop={12}
          >
            <Ionicons
              name="share-outline"
              size={22}
              color={theme.colors.text}
            />
          </Pressable>
        ),
    });
  }, [theme, ride, exporting]);

  async function handleExport() {
    if (!ride) return;
    setExporting(true);
    try {
      await exportRideGpx(ride);
    } catch (err) {
      Alert.alert(
        "Couldn't export route",
        err instanceof Error ? err.message : "Unknown error"
      );
    } finally {
      setExporting(false);
    }
  }

  useEffect(() => {
    getRide(route.params.id).then((r) => {
      setRide(r);
      setAnalysis(r.routeAnalysis);
      setWeather(r.weather);
      navigation.setOptions({ title: r.name });

      // Way-type/surface analysis hits Overpass, so it's only ever computed
      // once per ride and cached — skip if we already have a saved result.
      if (r.routeAnalysis === null) {
        setAnalysisLoading(true);
        analyzeRoute(r.points)
          .then((result) => {
            setAnalysis(result);
            if (result) saveRouteAnalysis(r.id, result);
          })
          .finally(() => setAnalysisLoading(false));
      }

      // Same idea — a ride's date and location never change, so its weather
      // never changes either. Re-fetching on every visit was the actual
      // cause of "weather feels slow," not the API itself. A planned route
      // has no ride date yet (it hasn't been ridden), so there's nothing to
      // fetch historical weather for.
      if (r.weather === null && r.origin !== "planned") {
        const first = r.points[0];
        const dateIso = first.time ?? r.importedAt;
        setWeatherLoading(true);
        fetchHistoricalWeather(first.lat, first.lon, dateIso)
          .then((result) => {
            setWeather(result);
            if (result) saveWeather(r.id, result);
          })
          .finally(() => setWeatherLoading(false));
      }

      // A waypoint dropped by tapping the map (rather than picked from
      // search) has no name — resolve it to a real address once and cache
      // it permanently, the same "fetch once, persist forever" pattern as
      // the way-type analysis and weather above. Only within the same cap
      // the list itself uses, so a huge turn-by-turn waypoint dump doesn't
      // trigger dozens of geocoding requests for cues that won't even show.
      const unresolved = r.waypoints
        .map((w, index) => (w.name === null ? index : -1))
        .filter((index) => index !== -1);
      if (unresolved.length > 0 && r.waypoints.length <= MAX_MEANINGFUL_WAYPOINTS) {
        resolveWaypointAddresses(r.id, r.waypoints, unresolved);
      }
    });
  }, [route.params.id]);

  // Resolves each unnamed waypoint in turn (not in parallel — Nominatim's
  // usage policy caps requests at 1/second), updating the screen as each
  // one comes in rather than waiting for the whole list to finish.
  async function resolveWaypointAddresses(
    rideId: string,
    waypoints: Waypoint[],
    indices: number[]
  ): Promise<void> {
    const resolved = [...waypoints];
    for (const index of indices) {
      const address = await reverseGeocode(resolved[index].lat, resolved[index].lon);
      if (address) {
        resolved[index] = { ...resolved[index], name: address };
        setRide((prev) => (prev ? { ...prev, waypoints: [...resolved] } : prev));
      }
      await new Promise((resolve) => setTimeout(resolve, NOMINATIM_RATE_LIMIT_MS));
    }
    saveWaypoints(rideId, resolved);
  }

  if (!ride) {
    return (
      <View style={styles.centered}>
        <Text style={styles.mutedText}>Loading…</Text>
      </View>
    );
  }

  const { stats } = ride;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <MapRoute points={ride.points} />

      {/* Navigating (or editing) a route you've already ridden doesn't make
          much sense — only offer either for routes you haven't done live
          yet. */}
      {ride.origin !== "recorded" && (
        <View style={styles.actionRow}>
          <AnimatedPressable
            style={[styles.navigateButton, styles.actionButton]}
            onPress={() =>
              navigation.navigate("Record", { navigateRouteId: ride.id })
            }
          >
            <Text style={styles.navigateButtonText}>Navigate</Text>
          </AnimatedPressable>
          <AnimatedPressable
            style={[styles.editButton, styles.actionButton]}
            onPress={() =>
              navigation.navigate("RoutePlanner", { editRideId: ride.id })
            }
          >
            <Text style={styles.editButtonText}>Edit Route</Text>
          </AnimatedPressable>
        </View>
      )}

      <Text style={styles.sectionTitle}>Stats</Text>
      <View style={styles.statsGrid}>
        <StatCard label="Distance" value={formatDistance(stats.distanceMeters)} />
        <StatCard
          label="Duration"
          value={formatDurationOrEstimate(stats.durationSeconds, stats.distanceMeters)}
        />
        {/* Avg/Max Speed only makes sense for a ride actually tracked live —
            an imported route's timestamps (if any) reflect however the file
            was exported, not a ride you took, and a planned route has no
            timestamps at all, so speed isn't shown for either. */}
        {ride.origin === "recorded" && (
          <>
            <StatCard label="Avg Speed" value={formatSpeed(stats.avgSpeedKmh)} />
            <StatCard label="Max Speed" value={formatSpeed(stats.maxSpeedKmh)} />
          </>
        )}
        <StatCard label="Elevation Gain" value={formatElevation(stats.elevationGainMeters)} />
        <StatCard label="Elevation Loss" value={formatElevation(stats.elevationLossMeters)} />
      </View>

      {ride.waypoints.length > 0 &&
        ride.waypoints.length <= MAX_MEANINGFUL_WAYPOINTS && (
          <>
            <Text style={styles.sectionTitle}>Waypoints</Text>
            <WaypointsList waypoints={ride.waypoints} points={ride.points} />
          </>
        )}

      {ride.description && (
        <>
          <Text style={styles.sectionTitle}>Info</Text>
          <Text style={styles.infoText}>{ride.description}</Text>
        </>
      )}

      <Text style={styles.sectionTitle}>Elevation</Text>
      <ElevationChart points={ride.points} />

      <Text style={styles.sectionTitle}>Way types</Text>
      {analysisLoading ? (
        <Text style={styles.mutedText}>Checking OpenStreetMap…</Text>
      ) : analysis ? (
        <BreakdownBar entries={analysis.wayTypes} />
      ) : (
        <Text style={styles.mutedText}>Not available</Text>
      )}

      <Text style={styles.sectionTitle}>Surfaces</Text>
      {analysisLoading ? (
        <Text style={styles.mutedText}>Checking OpenStreetMap…</Text>
      ) : analysis ? (
        <BreakdownBar entries={analysis.surfaces} />
      ) : (
        <Text style={styles.mutedText}>Not available</Text>
      )}

      {ride.origin !== "planned" && (
        <>
          <Text style={styles.sectionTitle}>Weather</Text>
          {weatherLoading ? (
            <Text style={styles.mutedText}>Loading…</Text>
          ) : weather ? (
            <WeatherCard weather={weather} />
          ) : (
            <Text style={styles.mutedText}>Not available</Text>
          )}
        </>
      )}
    </ScrollView>
  );
}

function makeStyles({ colors, radii }: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: 16, paddingBottom: 32 },
    headerBackButton: { paddingHorizontal: 12, paddingVertical: 4 },
    centered: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.background,
    },
    actionRow: {
      flexDirection: "row",
      gap: 10,
      marginTop: 16,
    },
    actionButton: { flex: 1 },
    navigateButton: {
      backgroundColor: colors.primary,
      borderRadius: radii.sm,
      paddingVertical: 14,
      alignItems: "center",
    },
    navigateButtonText: {
      color: colors.primaryText,
      fontWeight: "700",
      fontSize: 16,
    },
    editButton: {
      backgroundColor: colors.secondary,
      borderRadius: radii.sm,
      paddingVertical: 14,
      alignItems: "center",
    },
    editButtonText: {
      color: colors.primaryText,
      fontWeight: "700",
      fontSize: 16,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: "700",
      marginTop: 20,
      marginBottom: 10,
      color: colors.text,
    },
    statsGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
    },
    infoText: {
      fontSize: 14,
      color: colors.text,
      lineHeight: 20,
    },
    mutedText: {
      fontSize: 14,
      color: colors.textMuted,
    },
  });
}
