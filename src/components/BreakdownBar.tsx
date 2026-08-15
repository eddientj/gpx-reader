import { useEffect, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import type { BreakdownEntry } from "../lib/types";
import { useTheme, type Theme } from "../theme/ThemeContext";

type Props = {
  entries: BreakdownEntry[];
};

export function BreakdownBar({ entries }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { chartRamp } = theme.colors;

  // Grows the whole bar in from the left on mount, rather than popping in
  // fully drawn — reads as the breakdown "filling in".
  const growth = useSharedValue(0);
  useEffect(() => {
    growth.value = withTiming(1, { duration: 500 });
  }, [entries]);
  const barStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: growth.value }],
  }));

  if (entries.length === 0) return null;

  return (
    <View>
      <Animated.View style={[styles.bar, styles.barOrigin, barStyle]}>
        {entries.map((entry, index) => (
          <View
            key={entry.label}
            style={{
              flex: entry.percent,
              backgroundColor: chartRamp[index % chartRamp.length],
            }}
          />
        ))}
      </Animated.View>
      <View style={styles.legend}>
        {entries.map((entry, index) => (
          <View key={entry.label} style={styles.legendRow}>
            <View
              style={[
                styles.legendDot,
                { backgroundColor: chartRamp[index % chartRamp.length] },
              ]}
            />
            <Text style={styles.legendLabel}>{entry.label}</Text>
            <Text style={styles.legendPercent}>{entry.percent}%</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function makeStyles({ colors }: Theme) {
  return StyleSheet.create({
    bar: {
      flexDirection: "row",
      height: 10,
      borderRadius: 5,
      overflow: "hidden",
    },
    barOrigin: {
      transformOrigin: "left",
    },
    legend: {
      marginTop: 10,
      gap: 6,
    },
    legendRow: {
      flexDirection: "row",
      alignItems: "center",
    },
    legendDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      marginRight: 8,
    },
    legendLabel: {
      flex: 1,
      fontSize: 13,
      color: colors.text,
    },
    legendPercent: {
      fontSize: 13,
      color: colors.textMuted,
    },
  });
}
