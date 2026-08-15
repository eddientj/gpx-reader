import { Camera, GeoJSONSource, Layer, Map, Marker } from "@maplibre/maplibre-react-native";
import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { TrackPoint } from "../lib/types";
import { useTheme, type Theme } from "../theme/ThemeContext";

// Same free vector tile source as the static MapRoute.
const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
const FOLLOW_ZOOM = 16;

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
  const containerStyle = [
    styles.container,
    fullScreen && StyleSheet.absoluteFill,
    fullScreen && styles.fullScreen,
  ];

  if (points.length === 0) {
    return (
      <View style={[...containerStyle, styles.waiting]}>
        <Text style={styles.waitingText}>Waiting for GPS…</Text>
      </View>
    );
  }

  const coordinates: [number, number][] = points.map((p) => [p.lon, p.lat]);
  const last = coordinates[coordinates.length - 1];
  // A GeoJSON LineString needs at least 2 positions to be valid — with just
  // the first point in, there's nothing to draw a line between yet (this
  // was logging a real "Invalid geometry" warning from MapLibre otherwise).
  const hasLine = coordinates.length >= 2;

  const routeGeoJson: GeoJSON.Feature = {
    type: "Feature",
    properties: {},
    geometry: { type: "LineString", coordinates },
  };

  const referenceGeoJson: GeoJSON.Feature | null =
    referencePoints && referencePoints.length >= 2
      ? {
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: referencePoints.map((p) => [p.lon, p.lat]),
          },
        }
      : null;

  return (
    <View style={containerStyle}>
      <Map mapStyle={STYLE_URL} style={styles.map} logo={false}>
        <Camera center={last} zoom={FOLLOW_ZOOM} duration={500} />
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
