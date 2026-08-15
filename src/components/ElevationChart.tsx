import { useEffect, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { haversineMeters } from "../lib/stats";
import type { TrackPoint } from "../lib/types";
import { useTheme, type Theme } from "../theme/ThemeContext";

const VIEW_WIDTH = 320;
const VIEW_HEIGHT = 120;
const PADDING = 8;

type Props = {
  points: TrackPoint[];
};

export function ElevationChart({ points }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const chart = useMemo(() => {
    const valid = points.filter(
      (p): p is TrackPoint & { ele: number } => p.ele !== null
    );
    if (valid.length < 2) return null;

    let cumulative = 0;
    const distances = [0];
    for (let i = 1; i < valid.length; i++) {
      cumulative += haversineMeters(valid[i - 1], valid[i]);
      distances.push(cumulative);
    }
    const totalDistance = cumulative || 1;
    const elevations = valid.map((p) => p.ele);
    const minEle = Math.min(...elevations);
    const maxEle = Math.max(...elevations);
    const eleRange = maxEle - minEle || 1;

    const plotWidth = VIEW_WIDTH - PADDING * 2;
    const plotHeight = VIEW_HEIGHT - PADDING * 2;

    const coords = valid.map((_, i) => {
      const x = PADDING + (distances[i] / totalDistance) * plotWidth;
      const y =
        PADDING +
        plotHeight -
        ((elevations[i] - minEle) / eleRange) * plotHeight;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    const linePath = `M ${coords.join(" L ")}`;
    const fillPath = `${linePath} L ${PADDING + plotWidth},${
      PADDING + plotHeight
    } L ${PADDING},${PADDING + plotHeight} Z`;

    return { linePath, fillPath, minEle, maxEle };
  }, [points]);

  // Grows up from the baseline on mount instead of popping in fully drawn —
  // a true stroke-draw animation needs the SVG path's measured length,
  // which react-native-svg only exposes imperatively; this reads just as
  // well as the chart "filling in" without that complexity.
  const growth = useSharedValue(0);
  useEffect(() => {
    growth.value = 0;
    growth.value = withTiming(1, { duration: 450 });
  }, [chart]);
  const chartStyle = useAnimatedStyle(() => ({
    transform: [{ scaleY: growth.value }],
    opacity: growth.value,
  }));

  if (!chart) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No elevation data in this ride</Text>
      </View>
    );
  }

  return (
    <View>
      <Animated.View style={[styles.chartOrigin, chartStyle]}>
        <Svg
          width="100%"
          height={VIEW_HEIGHT}
          viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        >
          <Path d={chart.fillPath} fill={`${theme.colors.primary}22`} stroke="none" />
          <Path
            d={chart.linePath}
            fill="none"
            stroke={theme.colors.primary}
            strokeWidth={2}
          />
        </Svg>
      </Animated.View>
      <View style={styles.labels}>
        <Text style={styles.labelText}>Min {Math.round(chart.minEle)} m</Text>
        <Text style={styles.labelText}>Max {Math.round(chart.maxEle)} m</Text>
      </View>
    </View>
  );
}

function makeStyles({ colors }: Theme) {
  return StyleSheet.create({
    empty: { padding: 20, alignItems: "center" },
    emptyText: { color: colors.textMuted },
    chartOrigin: { transformOrigin: "bottom" },
    labels: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: 4,
    },
    labelText: { fontSize: 12, color: colors.textMuted },
  });
}
