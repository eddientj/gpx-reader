import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { formatElevation } from "../lib/format";
import type { Waypoint } from "../lib/types";
import { useTheme, type Theme } from "../theme/ThemeContext";

type Props = {
  waypoints: Waypoint[];
};

export function WaypointsList({ waypoints }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  if (waypoints.length === 0) return null;

  return (
    <View>
      {waypoints.map((wpt, index) => (
        <View key={index} style={styles.row}>
          <View style={styles.marker} />
          <Text style={styles.name} numberOfLines={1}>
            {wpt.name ?? `Waypoint ${index + 1}`}
          </Text>
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
    name: {
      flex: 1,
      fontSize: 14,
      color: colors.text,
    },
    elevation: {
      fontSize: 13,
      color: colors.textMuted,
    },
  });
}
