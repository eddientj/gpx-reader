import Ionicons from "@expo/vector-icons/Ionicons";
import {
  Camera,
  GeoJSONSource,
  Layer,
  Map,
  Marker,
  type CameraRef,
} from "@maplibre/maplibre-react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import * as Location from "expo-location";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type NativeSyntheticEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AnimatedPressable } from "../components/AnimatedPressable";
import { formatDate, formatDistance } from "../lib/format";
import { searchPlaces, type PlaceResult } from "../lib/geocoding";
import { calculateRoute, type CalculatedRoute } from "../lib/routing";
import { savePlannedRoute } from "../lib/storage";
import type { Waypoint } from "../lib/types";
import { useTheme, type Theme } from "../theme/ThemeContext";
import type { RootStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "RoutePlanner">;

type PlannerWaypoint = { lat: number; lon: number; name: string | null };
type LngLatEvent = NativeSyntheticEvent<{ lngLat: [number, number] }>;

// A named place keeps its own name; an unnamed tap falls back to marking
// its role in the route (Start/End) rather than a generic "Waypoint N" —
// the whole point of asking for this was to make the start and end of the
// route identifiable at a glance, same as a finished ride's map already
// does with its green/red start/end markers.
function waypointLabel(w: PlannerWaypoint, index: number, total: number): string {
  if (w.name) return w.name;
  if (index === 0) return "Start";
  if (index === total - 1 && total > 1) return "End";
  return `Waypoint ${index + 1}`;
}

const SEARCH_DEBOUNCE_MS = 500;
const ROUTE_DEBOUNCE_MS = 600;

// OpenFreeMap's vector style covers "standard"; satellite needs a separate
// free raster source since OpenFreeMap only serves the one style. Esri's
// World Imagery tiles are free and keyless for this kind of hobby use.
const MAP_STYLES = [
  { name: "Standard", style: "https://tiles.openfreemap.org/styles/liberty" },
  {
    name: "Satellite",
    style: {
      version: 8 as const,
      sources: {
        satellite: {
          type: "raster" as const,
          tiles: [
            "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          ],
          tileSize: 256,
        },
      },
      layers: [{ id: "satellite", type: "raster" as const, source: "satellite" }],
    },
  },
];

export function RoutePlannerScreen({ navigation }: Props) {
  const theme = useTheme();
  const { colors, spacing } = theme;
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();

  const [waypoints, setWaypoints] = useState<PlannerWaypoint[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PlaceResult[]>([]);
  const [calculatedRoute, setCalculatedRoute] = useState<CalculatedRoute | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [styleIndex, setStyleIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [deviceLocation, setDeviceLocation] = useState<
    { lat: number; lon: number } | null
  >(null);
  const cameraRef = useRef<CameraRef>(null);

  // getLastKnownPositionAsync() only reads a cached fix and doesn't request
  // one — it resolves to null whenever there's no recent cache, which is
  // exactly the case right after installing the app or before Record has
  // ever run once. Falling back to an active getCurrentPositionAsync() call
  // covers that gap; it can prompt for permission if not already granted,
  // which is the right tradeoff since the alternative is a broken map.
  // Shared by the initial mount (below) and the Recenter button, so a
  // denied/failed first attempt gets another chance if location becomes
  // available later.
  function resolveDeviceLocation(): Promise<{ lat: number; lon: number } | null> {
    return Location.getLastKnownPositionAsync()
      .then((position) => position ?? Location.getCurrentPositionAsync())
      .then((position) =>
        position
          ? { lat: position.coords.latitude, lon: position.coords.longitude }
          : null
      )
      .catch(() => null);
  }

  // Without this, an empty map (no waypoints yet) falls back to whatever
  // default center/zoom is baked into the style JSON — the whole world, in
  // OpenFreeMap's case.
  useEffect(() => {
    resolveDeviceLocation().then((location) => {
      if (location) setDeviceLocation(location);
    });
  }, []);

  async function handleRecenter() {
    const location = deviceLocation ?? (await resolveDeviceLocation());
    if (!location) {
      Alert.alert(
        "Location unavailable",
        "Couldn't get your current location. Check that Location Services is turned on."
      );
      return;
    }
    setDeviceLocation(location);
    cameraRef.current?.flyTo({
      center: [location.lon, location.lat],
      zoom: 15,
      duration: 600,
    });
  }

  useEffect(() => {
    if (searchQuery.trim().length === 0) {
      setSearchResults([]);
      return;
    }
    const handle = setTimeout(() => {
      searchPlaces(searchQuery).then(setSearchResults);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [searchQuery]);

  useEffect(() => {
    if (waypoints.length < 2) {
      setCalculatedRoute(null);
      return;
    }
    setCalculating(true);
    const handle = setTimeout(() => {
      calculateRoute(waypoints).then((result) => {
        setCalculatedRoute(result);
        setCalculating(false);
      });
    }, ROUTE_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [waypoints]);

  function handleMapPress(event: LngLatEvent) {
    const [lon, lat] = event.nativeEvent.lngLat;
    if (selectedIndex !== null) {
      // A waypoint is selected — this tap relocates it instead of adding a
      // new one, since MapLibre's Marker has no built-in drag support here.
      setWaypoints((prev) =>
        prev.map((w, i) => (i === selectedIndex ? { lat, lon, name: null } : w))
      );
      setSelectedIndex(null);
    } else {
      setWaypoints((prev) => [...prev, { lat, lon, name: null }]);
    }
  }

  function handleMarkerPress(index: number) {
    setSelectedIndex((prev) => (prev === index ? null : index));
  }

  function handleRemoveWaypoint(index: number) {
    setWaypoints((prev) => prev.filter((_, i) => i !== index));
    setSelectedIndex(null);
  }

  function handleSelectSearchResult(result: PlaceResult) {
    setWaypoints((prev) => [
      ...prev,
      { lat: result.lat, lon: result.lon, name: result.name },
    ]);
    setSearchQuery("");
    setSearchResults([]);
  }

  async function handleSaveRoute() {
    if (!calculatedRoute) return;
    setSaving(true);
    try {
      const waypointList: Waypoint[] = waypoints.map((w) => ({
        name: w.name,
        lat: w.lat,
        lon: w.lon,
        ele: null,
      }));
      const name = `Planned route — ${formatDate(new Date().toISOString())}`;
      const summary = await savePlannedRoute(
        waypointList,
        calculatedRoute.points,
        name,
        calculatedRoute.steps
      );
      navigation.replace("RideDetail", { id: summary.id });
    } catch (err) {
      Alert.alert(
        "Couldn't save route",
        err instanceof Error ? err.message : "Unknown error"
      );
    } finally {
      setSaving(false);
    }
  }

  const camera = useMemo(() => {
    if (waypoints.length === 0) {
      return deviceLocation
        ? { center: [deviceLocation.lon, deviceLocation.lat] as [number, number], zoom: 13 }
        : null;
    }
    if (waypoints.length === 1) {
      return {
        center: [waypoints[0].lon, waypoints[0].lat] as [number, number],
        zoom: 15,
      };
    }
    const lats = waypoints.map((w) => w.lat);
    const lons = waypoints.map((w) => w.lon);
    return {
      bounds: [
        Math.min(...lons),
        Math.min(...lats),
        Math.max(...lons),
        Math.max(...lats),
      ] as [number, number, number, number],
      padding: { top: 120, right: 60, bottom: 280, left: 60 },
    };
  }, [waypoints, deviceLocation]);

  // OSRM can return a single-point "route" for two near-identical waypoints
  // (e.g. a waypoint dragged onto another) — a GeoJSON LineString needs at
  // least 2 positions, so skip the line rather than let MapLibre log an
  // "Invalid geometry" warning and drop it anyway.
  const routeGeoJson: GeoJSON.Feature | null =
    calculatedRoute && calculatedRoute.points.length >= 2
      ? {
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: calculatedRoute.points.map((p) => [p.lon, p.lat]),
          },
        }
      : null;

  const distanceLabel = calculating
    ? "Calculating…"
    : calculatedRoute
      ? formatDistance(calculatedRoute.distanceMeters)
      : waypoints.length < 2
        ? "Add at least 2 waypoints"
        : "No route found between these waypoints";

  return (
    <View style={styles.container}>
      <Map
        mapStyle={MAP_STYLES[styleIndex].style}
        style={StyleSheet.absoluteFill}
        logo={false}
        onPress={handleMapPress}
      >
        {camera && <Camera ref={cameraRef} {...camera} duration={500} />}
        {routeGeoJson && (
          <GeoJSONSource id="plannedRoute" data={routeGeoJson}>
            <Layer
              id="plannedRouteLine"
              type="line"
              layout={{ "line-cap": "round", "line-join": "round" }}
              paint={{ "line-color": colors.primary, "line-width": 4 }}
            />
          </GeoJSONSource>
        )}
        {waypoints.map((w, i) => {
          // Same convention a finished ride's map already uses: green start,
          // red end, so the two ends of the route are identifiable at a
          // glance instead of every stop looking the same.
          const isStart = i === 0;
          const isEnd = i === waypoints.length - 1 && waypoints.length > 1;
          const markerColor = selectedIndex === i
            ? colors.highlight
            : isStart
              ? colors.success
              : isEnd
                ? colors.danger
                : colors.secondary;
          return (
            <Marker
              key={i}
              id={`waypoint-${i}`}
              lngLat={[w.lon, w.lat]}
              onPress={() => handleMarkerPress(i)}
            >
              <View
                style={[styles.waypointMarker, { backgroundColor: markerColor }]}
              />
            </Marker>
          );
        })}
      </Map>

      {waypoints.length === 0 && (
        <View style={styles.hintContainer} pointerEvents="none">
          <Text style={styles.hintText}>
            Search for a place or tap the map to add a waypoint
          </Text>
        </View>
      )}

      <AnimatedPressable
        style={[styles.recenterButton, { top: insets.top + spacing.sm + 60 }]}
        onPress={handleRecenter}
      >
        <Ionicons name="locate" size={20} color={colors.text} />
      </AnimatedPressable>

      <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.searchRow}>
          <AnimatedPressable
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={20} color={colors.text} />
          </AnimatedPressable>
          <TextInput
            style={styles.searchInput}
            placeholder="Search for a place"
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          <AnimatedPressable
            style={styles.styleToggle}
            onPress={() => setStyleIndex((i) => (i + 1) % MAP_STYLES.length)}
          >
            <Text style={styles.styleToggleText}>
              {MAP_STYLES[(styleIndex + 1) % MAP_STYLES.length].name}
            </Text>
          </AnimatedPressable>
        </View>
        {searchResults.length > 0 && (
          <View style={styles.searchResults}>
            {searchResults.map((r) => (
              <Pressable
                key={`${r.lat},${r.lon}`}
                style={styles.searchResultRow}
                onPress={() => handleSelectSearchResult(r)}
              >
                <Text style={styles.searchResultText} numberOfLines={1}>
                  {r.name}
                </Text>
              </Pressable>
            ))}
            <Text style={styles.attribution}>© OpenStreetMap contributors</Text>
          </View>
        )}
      </View>

      <View
        style={[
          styles.floatingCard,
          { paddingBottom: insets.bottom + spacing.md },
        ]}
      >
        <Text style={styles.distanceText}>{distanceLabel}</Text>

        {waypoints.length > 0 && (
          <ScrollView
            horizontal
            style={styles.chipRow}
            showsHorizontalScrollIndicator={false}
          >
            {waypoints.map((w, i) => (
              <View
                key={i}
                style={[styles.chip, selectedIndex === i && styles.chipSelected]}
              >
                <Pressable onPress={() => handleMarkerPress(i)}>
                  <Text style={styles.chipText} numberOfLines={1}>
                    {waypointLabel(w, i, waypoints.length)}
                  </Text>
                </Pressable>
                <Pressable
                  style={styles.chipRemove}
                  onPress={() => handleRemoveWaypoint(i)}
                >
                  <Text style={styles.chipRemoveText}>×</Text>
                </Pressable>
              </View>
            ))}
          </ScrollView>
        )}

        <AnimatedPressable
          style={[
            styles.saveButton,
            (!calculatedRoute || saving) && styles.buttonDisabled,
          ]}
          onPress={handleSaveRoute}
          disabled={!calculatedRoute || saving}
        >
          <Text style={styles.saveButtonText}>
            {saving ? "Saving…" : "Save Route"}
          </Text>
        </AnimatedPressable>
      </View>
    </View>
  );
}

function makeStyles({ colors, spacing, radii }: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    hintContainer: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 60,
    },
    hintText: {
      color: colors.textMuted,
      fontSize: 15,
      textAlign: "center",
      backgroundColor: `${colors.background}CC`,
      padding: spacing.md,
      borderRadius: radii.md,
    },
    waypointMarker: {
      width: 18,
      height: 18,
      borderRadius: 9,
      borderWidth: 2,
      borderColor: colors.surface,
    },
    recenterButton: {
      position: "absolute",
      right: spacing.md,
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: `${colors.surface}F2`,
      alignItems: "center",
      justifyContent: "center",
    },
    topBar: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      paddingHorizontal: spacing.md,
    },
    searchRow: {
      flexDirection: "row",
      gap: spacing.sm,
    },
    backButton: {
      backgroundColor: `${colors.surface}F2`,
      borderRadius: radii.sm,
      paddingHorizontal: spacing.md,
      justifyContent: "center",
      alignItems: "center",
    },
    searchInput: {
      flex: 1,
      backgroundColor: `${colors.surface}F2`,
      borderRadius: radii.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: 10,
      color: colors.text,
      fontSize: 15,
    },
    styleToggle: {
      backgroundColor: `${colors.surface}F2`,
      borderRadius: radii.sm,
      paddingHorizontal: spacing.md,
      justifyContent: "center",
    },
    styleToggleText: { color: colors.text, fontWeight: "600", fontSize: 13 },
    searchResults: {
      backgroundColor: `${colors.surface}F2`,
      borderRadius: radii.sm,
      marginTop: spacing.xs,
      overflow: "hidden",
    },
    searchResultRow: {
      paddingVertical: 10,
      paddingHorizontal: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    searchResultText: { color: colors.text, fontSize: 14 },
    attribution: {
      color: colors.textMuted,
      fontSize: 10,
      padding: spacing.sm,
    },
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
    distanceText: {
      color: colors.text,
      fontSize: 16,
      fontWeight: "700",
    },
    chipRow: {
      marginTop: spacing.sm,
      maxHeight: 44,
    },
    chip: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surfaceAlt,
      borderRadius: radii.sm,
      paddingLeft: spacing.md,
      marginRight: spacing.sm,
      maxWidth: 160,
    },
    chipSelected: {
      backgroundColor: colors.highlight,
    },
    chipText: {
      color: colors.text,
      fontSize: 13,
      paddingVertical: 8,
    },
    chipRemove: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 8,
    },
    chipRemoveText: {
      color: colors.textMuted,
      fontSize: 16,
      fontWeight: "700",
    },
    saveButton: {
      backgroundColor: colors.primary,
      borderRadius: radii.sm,
      paddingVertical: 14,
      alignItems: "center",
      marginTop: spacing.md,
    },
    buttonDisabled: { opacity: 0.6 },
    saveButtonText: { color: colors.primaryText, fontWeight: "600" },
  });
}
