import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { formatDistance, formatElevation } from "../lib/format";
import { distanceAlongRouteMeters } from "../lib/stats";
import type { TrackPoint, Waypoint } from "../lib/types";
import { useTheme, type Theme } from "../theme/ThemeContext";

type Props = {
  waypoints: Waypoint[];
  /** The route's own dense track — used to work out how far into the ride
   * each waypoint actually falls, following the path rather than a
   * straight line from the start. */
  points: TrackPoint[];
};

export function WaypointsList({ waypoints, points }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  if (waypoints.length === 0) return null;

  return (
    <View>
      {waypoints.map((wpt, index) => (
        <View key={index} style={styles.row}>
          <View style={styles.marker} />
          <View style={styles.textColumn}>
            <Text style={styles.name} numberOfLines={2}>
              {wpt.name ?? `Waypoint ${index + 1}`}
            </Text>
            <Text style={styles.distance}>
              {formatDistance(distanceAlongRouteMeters(points, wpt))} into the route
            </Text>
          </View>
          {wpt.ele !== null && (
            <Text style={styles.elevation}>{formatElevation(wpt.ele)}</Text>
          )}
        </View>
      ))}
    </View>
  );
}

function makeStyles({ colors }: Theme) {
  return StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    marker: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.primary,
      marginRight: 10,
    },
    textColumn: {
      flex: 1,
    },
    name: {
      fontSize: 14,
      color: colors.text,
    },
    distance: {
      fontSize: 12,
      color: colors.textMuted,
      marginTop: 2,
    },
    elevation: {
      fontSize: 13,
      color: colors.textMuted,
      marginLeft: 8,
    },
  });
}
