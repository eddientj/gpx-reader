import { Camera, GeoJSONSource, Layer, Map, Marker } from "@maplibre/maplibre-react-native";
import { useMemo, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import { bearingBetween } from "../lib/navigation";
import { haversineMeters } from "../lib/stats";
import type { TrackPoint } from "../lib/types";
import { useTheme, type Theme } from "../theme/ThemeContext";

// Same free vector tile source as the static MapRoute.
const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
const FOLLOW_ZOOM = 16;
// A tilted, heading-oriented camera reads as "navigation mode" the way
// Google/Apple Maps look while turn-by-turn is active, instead of the flat
// straight-down "sky view" a plain top-down camera gives.
const FOLLOW_PITCH = 55;
// Below this, consecutive GPS fixes are close enough that the bearing
// between them is mostly noise (a stationary rider's position jitters by a
// few meters) — recomputing it every poll would spin the camera pointlessly
// while not actually moving, so the last real heading is kept instead.
const MIN_BEARING_DISTANCE_METERS = 3;

type Props = {
  points: TrackPoint[];
  /** Fills its parent edge-to-edge (no rounded corners) instead of the
   * default fixed-height card — used for RecordScreen's full-screen map. */
  fullScreen?: boolean;
  /** The planned route being navigated, drawn as a muted reference line
   * behind the live traveled path so it's visible which way to go. */
  referencePoints?: TrackPoint[];
};

/**
 * A live-recording variant of MapRoute: instead of fitting the camera to the
 * route's full bounds (which only makes sense once a route is complete),
 * this follows the most recent point as the route grows.
 */
export function LiveMapRoute({ points, fullScreen, referencePoints }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const lastBearingRef = useRef(0);
  const containerStyle = [
    styles.container,
    fullScreen && StyleSheet.absoluteFill,
    fullScreen && styles.fullScreen,
  ];

  // The recording poll (src/screens/RecordScreen.tsx) re-fetches `points`
  // from storage every 2s, handing this component a brand-new array
  // reference each time even on ticks where nothing was actually appended —
  // and every recomputed GeoJSON.Feature gets pushed to MapLibre's native
  // layer as if it were new data, forcing a full re-parse. Points are
  // append-only during a recording, so `points.length` is a safe, cheap
  // proxy for "did this actually change" — this was silently re-parsing the
  // whole route on every tick regardless of route size, which is a much
  // more likely cause of a sluggish/blank map on a long route than the
  // route's size on its own.
  const coordinates = useMemo(
    () => points.map((p): [number, number] => [p.lon, p.lat]),
    [points.length]
  );
  const last = coordinates[coordinates.length - 1];
  // A GeoJSON LineString needs at least 2 positions to be valid — with just
  // the first point in, there's nothing to draw a line between yet (this
  // was logging a real "Invalid geometry" warning from MapLibre otherwise).
  const hasLine = coordinates.length >= 2;

  if (hasLine) {
    const prev = points[points.length - 2];
    const curr = points[points.length - 1];
    if (haversineMeters(prev, curr) > MIN_BEARING_DISTANCE_METERS) {
      lastBearingRef.current = bearingBetween(prev, curr);
    }
  }

  const routeGeoJson: GeoJSON.Feature = useMemo(
    () => ({
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates },
    }),
    [coordinates]
  );

  // Unlike `points`, `referencePoints` (the target route being navigated) is
  // only ever replaced wholesale — on load and on a reroute — so it's safe
  // to memo directly on its own reference rather than a length proxy.
  const referenceGeoJson: GeoJSON.Feature | null = useMemo(
    () =>
      referencePoints && referencePoints.length >= 2
        ? {
            type: "Feature",
            properties: {},
            geometry: {
              type: "LineString",
              coordinates: referencePoints.map((p) => [p.lon, p.lat]),
            },
          }
        : null,
    [referencePoints]
  );

  // This has to come after every hook above — calling hooks conditionally
  // (e.g. from an early return before them) would change how many hooks run
  // between the "no points yet" render and every render after, which breaks
  // React's rule that a component call the same hooks in the same order
  // every time.
  if (points.length === 0) {
    return (
      <View style={[...containerStyle, styles.waiting]}>
        <Text style={styles.waitingText}>Waiting for GPS…</Text>
      </View>
    );
  }

  return (
    <View style={containerStyle}>
      <Map mapStyle={STYLE_URL} style={styles.map} logo={false}>
        <Camera
          center={last}
          zoom={FOLLOW_ZOOM}
          pitch={FOLLOW_PITCH}
          bearing={lastBearingRef.current}
          duration={500}
        />
        {referenceGeoJson && (
          <GeoJSONSource id="referenceRoute" data={referenceGeoJson}>
            <Layer
              id="referenceRouteLine"
              type="line"
              layout={{ "line-cap": "round", "line-join": "round" }}
              paint={{
                "line-color": theme.colors.highlight,
                "line-width": 4,
                "line-dasharray": [2, 2],
              }}
            />
          </GeoJSONSource>
        )}
        {hasLine && (
          <GeoJSONSource id="liveRoute" data={routeGeoJson}>
            <Layer
              id="liveRouteLine"
              type="line"
              layout={{ "line-cap": "round", "line-join": "round" }}
              paint={{ "line-color": theme.colors.primary, "line-width": 4 }}
            />
          </GeoJSONSource>
        )}
        <Marker id="current" lngLat={last}>
          <View style={styles.currentMarker} />
        </Marker>
      </Map>
    </View>
  );
}

function makeStyles({ colors, radii }: Theme) {
  return StyleSheet.create({
    container: { height: 260, borderRadius: radii.md, overflow: "hidden" },
    fullScreen: { height: undefined, borderRadius: 0 },
    map: { flex: 1 },
    waiting: {
      backgroundColor: colors.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    waitingText: { color: colors.textMuted },
    currentMarker: {
      width: 16,
      height: 16,
      borderRadius: 8,
      borderWidth: 2,
      borderColor: colors.surface,
      backgroundColor: colors.primary,
    },
  });
}
