import { Camera, GeoJSONSource, Layer, Map, Marker } from "@maplibre/maplibre-react-native";
import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import type { TrackPoint } from "../lib/types";
import { useTheme, type Theme } from "../theme/ThemeContext";

// OpenFreeMap: free vector tiles, no API key, no usage limits.
const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

type Props = {
  points: TrackPoint[];
};

export function MapRoute({ points }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { colors } = theme;

  const coordinates: [number, number][] = points.map((p) => [p.lon, p.lat]);
  const lats = points.map((p) => p.lat);
  const lons = points.map((p) => p.lon);
  const bounds: [number, number, number, number] = [
    Math.min(...lons),
    Math.min(...lats),
    Math.max(...lons),
    Math.max(...lats),
  ];

  const routeGeoJson: GeoJSON.Feature = {
    type: "Feature",
    properties: {},
    geometry: { type: "LineString", coordinates },
  };

  return (
    <View style={styles.container}>
      <Map mapStyle={STYLE_URL} style={styles.map} logo={false}>
        <Camera
          initialViewState={{
            bounds,
            padding: { top: 40, right: 40, bottom: 40, left: 40 },
          }}
        />
        <GeoJSONSource id="route" data={routeGeoJson}>
          <Layer
            id="routeLine"
            type="line"
            layout={{ "line-cap": "round", "line-join": "round" }}
            paint={{ "line-color": colors.primary, "line-width": 4 }}
          />
        </GeoJSONSource>
        <Marker id="start" lngLat={coordinates[0]}>
          <View style={[styles.marker, styles.startMarker]} />
        </Marker>
        <Marker id="end" lngLat={coordinates[coordinates.length - 1]}>
          <View style={[styles.marker, styles.endMarker]} />
        </Marker>
      </Map>
    </View>
  );
}

function makeStyles({ colors, radii }: Theme) {
  return StyleSheet.create({
    container: { height: 260, borderRadius: radii.md, overflow: "hidden" },
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
