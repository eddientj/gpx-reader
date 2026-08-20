import { Camera, GeoJSONSource, Layer, Map, Marker } from "@maplibre/maplibre-react-native";
import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { TrackPoint } from "../lib/types";
import { useTheme, type Theme } from "../theme/ThemeContext";

// OpenFreeMap: free vector tiles, no API key, no usage limits.
const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
const SINGLE_POINT_ZOOM = 15;
// A bounds-fit camera on a near-zero-size box (e.g. a near-stationary
// recording where every point sits within a few meters of the others)
// pushes MapLibre toward an extreme zoom level outside the style's valid
// range — the markers/line still draw fine since they're plain vector
// overlays, but the base map tiles silently fail to load, leaving a blank
// gray/white square that looks broken. Below this span, fall back to a
// fixed-zoom center camera the same way a true single-point route already
// does, rather than fitting to a degenerate box.
const MIN_BOUNDS_SPAN_DEGREES = 0.001; // roughly 100m

type Props = {
  points: TrackPoint[];
};

export function MapRoute({ points }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { colors } = theme;

  if (points.length === 0) {
    return (
      <View style={[styles.container, styles.empty]}>
        <Text style={styles.emptyText}>No route data available</Text>
      </View>
    );
  }

  const coordinates: [number, number][] = points.map((p) => [p.lon, p.lat]);
  const start = coordinates[0];
  const end = coordinates[coordinates.length - 1];
  // A GeoJSON LineString needs at least 2 positions to be valid — a
  // single-point route (e.g. a near-instant recording) can still show its
  // one marker, just without a line (this used to log a real "Invalid
  // geometry" warning from MapLibre and skip rendering the marker below it).
  const hasLine = coordinates.length >= 2;

  const routeGeoJson: GeoJSON.Feature = {
    type: "Feature",
    properties: {},
    geometry: { type: "LineString", coordinates },
  };

  const lats = points.map((p) => p.lat);
  const lons = points.map((p) => p.lon);
  const minLon = Math.min(...lons);
  const minLat = Math.min(...lats);
  const maxLon = Math.max(...lons);
  const maxLat = Math.max(...lats);
  const bounds: [number, number, number, number] = [minLon, minLat, maxLon, maxLat];
  const boundsTooSmall =
    maxLon - minLon < MIN_BOUNDS_SPAN_DEGREES &&
    maxLat - minLat < MIN_BOUNDS_SPAN_DEGREES;

  return (
    <View style={styles.container}>
      <Map
        mapStyle={STYLE_URL}
        style={styles.map}
        logo={false}
        compass={false}
      >
        {hasLine && !boundsTooSmall ? (
          <Camera
            initialViewState={{
              bounds,
              padding: { top: 40, right: 40, bottom: 40, left: 40 },
            }}
          />
        ) : (
          <Camera initialViewState={{ center: start, zoom: SINGLE_POINT_ZOOM }} />
        )}
        {hasLine && (
          <GeoJSONSource id="route" data={routeGeoJson}>
            <Layer
              id="routeLine"
              type="line"
              layout={{ "line-cap": "round", "line-join": "round" }}
              paint={{ "line-color": colors.primary, "line-width": 4 }}
            />
          </GeoJSONSource>
        )}
        <Marker id="start" lngLat={start}>
          <View style={[styles.marker, styles.startMarker]} />
        </Marker>
        {hasLine && (
          <Marker id="end" lngLat={end}>
            <View style={[styles.marker, styles.endMarker]} />
          </Marker>
        )}
      </Map>
    </View>
  );
}

function makeStyles({ colors, radii }: Theme) {
  return StyleSheet.create({
    container: { height: 260, borderRadius: radii.md, overflow: "hidden" },
    empty: {
      backgroundColor: colors.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    emptyText: { color: colors.textMuted },
    map: { flex: 1 },
    marker: {
      width: 14,
      height: 14,
      borderRadius: 7,
      borderWidth: 2,
      borderColor: colors.surface,
    },
    startMarker: { backgroundColor: colors.success },
    endMarker: { backgroundColor: colors.danger },
  });
}
