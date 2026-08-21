import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Svg, { Circle, Line, Path } from "react-native-svg";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { formatDistance, formatElevation } from "../lib/format";
import { haversineMeters } from "../lib/stats";
import type { RouteAnalysis, TrackPoint } from "../lib/types";
import { useTheme, type Theme } from "../theme/ThemeContext";

const VIEW_WIDTH = 320;
const VIEW_HEIGHT = 170;
// Just enough room for the touch marker's circle (radius 5) not to clip
// against the top/bottom edge when a point sits at the exact min/max.
const PADDING = 6;
// The floating tooltip's own footprint — fixed rather than measured, so its
// position can be computed and clamped in one pass instead of waiting a
// render for onLayout.
const TOOLTIP_WIDTH = 132;
const TOOLTIP_HEIGHT = 54;

type ColorMode = "surface" | "wayType";

type Props = {
  points: TrackPoint[];
  analysis?: RouteAnalysis;
};

// Finds the plotted point closest to a touch's x position — `xs` is the
// coords array's own x values, monotonically increasing by construction (one
// per point, left to right along the route), so a binary search is exact
// without needing to also carry the underlying distances around.
function nearestIndex(xs: number[], target: number): number {
  let low = 0;
  let high = xs.length - 1;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (xs[mid] < target) low = mid + 1;
    else high = mid;
  }
  if (low > 0 && Math.abs(xs[low - 1] - target) <= Math.abs(xs[low] - target)) {
    return low - 1;
  }
  return low;
}

// Maps each chart point (dense, from the ride's own track) to whichever
// classification sample (sparser, one every ~50m from the Overpass pass) is
// closest by distance along the route — a single forward walk since both
// lists are already ordered by increasing distance.
function nearestLabelPerPoint(
  chartDistances: number[],
  segments: { distanceMeters: number; wayType: string; surface: string }[],
  mode: ColorMode
): string[] {
  if (segments.length === 0) return chartDistances.map(() => "Unknown");
  let segIndex = 0;
  return chartDistances.map((d) => {
    while (
      segIndex < segments.length - 1 &&
      Math.abs(segments[segIndex + 1].distanceMeters - d) <=
        Math.abs(segments[segIndex].distanceMeters - d)
    ) {
      segIndex++;
    }
    return mode === "surface" ? segments[segIndex].surface : segments[segIndex].wayType;
  });
}

type Run = { startIndex: number; endIndex: number; label: string };

// Collapses a label-per-point array into contiguous runs, each extended to
// touch the next run's start point so the colored segments connect with no
// visible gap between them.
function buildRuns(labels: string[]): Run[] {
  const runs: Run[] = [];
  let start = 0;
  for (let i = 1; i <= labels.length; i++) {
    if (i === labels.length || labels[i] !== labels[start]) {
      runs.push({
        startIndex: start,
        endIndex: Math.min(i, labels.length - 1),
        label: labels[start],
      });
      start = i;
    }
  }
  return runs;
}

export function ElevationChart({ points, analysis }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [containerWidth, setContainerWidth] = useState(VIEW_WIDTH);
  const [touchedIndex, setTouchedIndex] = useState<number | null>(null);
  const [colorMode, setColorMode] = useState<ColorMode>("surface");

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

    const xs = valid.map((_, i) => PADDING + (distances[i] / totalDistance) * plotWidth);
    const ys = valid.map(
      (_, i) =>
        PADDING + plotHeight - ((elevations[i] - minEle) / eleRange) * plotHeight
    );

    const linePath = `M ${xs.map((x, i) => `${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" L ")}`;
    const fillPath = `${linePath} L ${PADDING + plotWidth},${
      PADDING + plotHeight
    } L ${PADDING},${PADDING + plotHeight} Z`;

    return { linePath, fillPath, minEle, maxEle, xs, ys, distances, elevations };
  }, [points]);

  // Only meaningful once a route has actually been analyzed against
  // OpenStreetMap — a null/stale-shaped analysis (e.g. cached from before
  // this feature existed) just means the chart falls back to a single
  // solid-color line, same as it always has.
  const segments = analysis?.segments ?? [];
  const breakdown = colorMode === "surface" ? analysis?.surfaces : analysis?.wayTypes;

  const colorRuns = useMemo(() => {
    if (!chart || segments.length === 0 || !breakdown || breakdown.length === 0) {
      return null;
    }
    // Matches BreakdownBar's own color assignment exactly (chartRamp indexed
    // by each entry's position in the sorted breakdown) so a run on this
    // chart and its legend dot below are always the same color.
    const colorByLabel = new Map(
      breakdown.map((entry, i) => [
        entry.label,
        theme.colors.chartRamp[i % theme.colors.chartRamp.length],
      ])
    );
    const labels = nearestLabelPerPoint(chart.distances, segments, colorMode);
    return buildRuns(labels).map((run) => ({
      ...run,
      color: colorByLabel.get(run.label) ?? theme.colors.primary,
    }));
  }, [chart, segments, breakdown, colorMode, theme.colors.chartRamp, theme.colors.primary]);

  // Grows up from the baseline on mount instead of popping in fully drawn —
  // a true stroke-draw animation needs the SVG path's measured length,
  // which react-native-svg only exposes imperatively; this reads just as
  // well as the chart "filling in" without that complexity.
  const growth = useSharedValue(0);
  useEffect(() => {
    growth.value = 0;
    growth.value = withTiming(1, { duration: 450 });
    setTouchedIndex(null);
  }, [chart]);
  const chartStyle = useAnimatedStyle(() => ({
    transform: [{ scaleY: growth.value }],
    opacity: growth.value,
  }));

  function handleTouch(screenX: number) {
    if (!chart) return;
    const viewBoxX = (screenX / containerWidth) * VIEW_WIDTH;
    setTouchedIndex(nearestIndex(chart.xs, viewBoxX));
  }

  // Runs on the UI thread (gesture worklet) — runOnJS hops back to JS for
  // the state update, since formatting/rendering the label isn't itself
  // worklet-safe.
  const pan = Gesture.Pan()
    .onBegin((e) => runOnJS(handleTouch)(e.x))
    .onUpdate((e) => runOnJS(handleTouch)(e.x))
    .onEnd(() => runOnJS(setTouchedIndex)(null));

  function handleLayout(e: LayoutChangeEvent) {
    setContainerWidth(e.nativeEvent.layout.width);
  }

  if (!chart) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No elevation data in this ride</Text>
      </View>
    );
  }

  // The SVG's height is a fixed pixel value (not "100%"), so the chart's own
  // y-coordinates already are screen pixels — only x needs rescaling, since
  // width="100%" stretches the SVG horizontally to whatever this container
  // actually measures.
  const touchedScreenX =
    touchedIndex !== null ? (chart.xs[touchedIndex] / VIEW_WIDTH) * containerWidth : 0;
  const tooltipLeft = Math.max(
    0,
    Math.min(containerWidth - TOOLTIP_WIDTH, touchedScreenX - TOOLTIP_WIDTH / 2)
  );
  const tooltipTop =
    touchedIndex !== null
      ? Math.max(0, chart.ys[touchedIndex] - TOOLTIP_HEIGHT - 10)
      : 0;

  return (
    <View>
      {colorRuns && (
        <View style={styles.modeToggle}>
          {(["surface", "wayType"] as const).map((mode) => (
            <Pressable
              key={mode}
              style={[styles.modeChip, colorMode === mode && styles.modeChipActive]}
              onPress={() => setColorMode(mode)}
            >
              <Text
                style={[
                  styles.modeChipText,
                  colorMode === mode && styles.modeChipTextActive,
                ]}
              >
                {mode === "surface" ? "Surface" : "Way type"}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
      <View style={styles.chartArea}>
        <GestureDetector gesture={pan}>
          <Animated.View
            style={[styles.chartOrigin, chartStyle]}
            onLayout={handleLayout}
          >
            <Svg
              width="100%"
              height={VIEW_HEIGHT}
              viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
              preserveAspectRatio="none"
            >
              <Path d={chart.fillPath} fill={`${theme.colors.primary}22`} stroke="none" />
              {colorRuns ? (
                colorRuns.map((run) => (
                  <Path
                    key={`${run.startIndex}-${run.label}`}
                    d={`M ${chart.xs
                      .slice(run.startIndex, run.endIndex + 1)
                      .map(
                        (x, i) =>
                          `${x.toFixed(1)},${chart.ys[run.startIndex + i].toFixed(1)}`
                      )
                      .join(" L ")}`}
                    fill="none"
                    stroke={run.color}
                    strokeWidth={2}
                    strokeLinecap="round"
                  />
                ))
              ) : (
                <Path
                  d={chart.linePath}
                  fill="none"
                  stroke={theme.colors.primary}
                  strokeWidth={2}
                />
              )}
              {touchedIndex !== null && (
                <>
                  <Line
                    x1={chart.xs[touchedIndex]}
                    x2={chart.xs[touchedIndex]}
                    y1={PADDING}
                    y2={VIEW_HEIGHT - PADDING}
                    stroke={theme.colors.textMuted}
                    strokeWidth={1}
                    strokeDasharray={[3, 3]}
                  />
                  <Circle
                    cx={chart.xs[touchedIndex]}
                    cy={chart.ys[touchedIndex]}
                    r={6}
                    fill={theme.colors.text}
                    stroke={theme.colors.background}
                    strokeWidth={2}
                  />
                </>
              )}
            </Svg>
          </Animated.View>
        </GestureDetector>
        {/* A plain View rather than SVG text — needs to be legible at a
            glance while dragging, which wants real font weight/contrast
            control that's simpler to get right outside the SVG. Deliberately
            neutral (surface + text tokens), not the theme's green primary —
            a floating label is exactly the kind of small, high-attention
            element where low-contrast green reads as "hard to see". */}
        {touchedIndex !== null && (
          <View
            style={[styles.tooltip, { left: tooltipLeft, top: tooltipTop }]}
            pointerEvents="none"
          >
            <Text style={styles.tooltipValue}>
              {formatElevation(chart.elevations[touchedIndex])}
            </Text>
            <Text style={styles.tooltipSubvalue}>
              {formatDistance(chart.distances[touchedIndex])}
            </Text>
          </View>
        )}
      </View>
      <View style={styles.statsRow}>
        <View style={styles.statCell}>
          <Text style={styles.statLabel}>Min</Text>
          <Text style={styles.statValue}>{Math.round(chart.minEle)} m</Text>
        </View>
        <View style={[styles.statCell, styles.statCellEnd]}>
          <Text style={styles.statLabel}>Max</Text>
          <Text style={styles.statValue}>{Math.round(chart.maxEle)} m</Text>
        </View>
      </View>
    </View>
  );
}

function makeStyles({ colors, radii }: Theme) {
  return StyleSheet.create({
    empty: { padding: 20, alignItems: "center" },
    emptyText: { color: colors.textMuted },
    chartArea: { position: "relative" },
    chartOrigin: { transformOrigin: "bottom" },
    modeToggle: {
      flexDirection: "row",
      gap: 8,
      marginBottom: 8,
    },
    modeChip: {
      paddingVertical: 4,
      paddingHorizontal: 10,
      borderRadius: radii.sm,
      backgroundColor: colors.surfaceAlt,
    },
    modeChipActive: {
      backgroundColor: colors.primary,
    },
    modeChipText: {
      fontSize: 12,
      color: colors.textMuted,
      fontWeight: "600",
    },
    modeChipTextActive: {
      color: colors.primaryText,
    },
    tooltip: {
      position: "absolute",
      width: TOOLTIP_WIDTH,
      height: TOOLTIP_HEIGHT,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.md,
      paddingVertical: 6,
      paddingHorizontal: 10,
      justifyContent: "center",
      alignItems: "center",
      shadowColor: "#000",
      shadowOpacity: 0.25,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: 6,
    },
    tooltipValue: {
      fontSize: 22,
      fontWeight: "800",
      color: colors.text,
      lineHeight: 26,
    },
    tooltipSubvalue: {
      fontSize: 13,
      color: colors.textMuted,
      fontWeight: "600",
    },
    statsRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: 10,
    },
    statCell: {
      flex: 1,
    },
    statCellEnd: {
      alignItems: "flex-end",
    },
    statLabel: {
      fontSize: 12,
      color: colors.textMuted,
      fontWeight: "600",
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    statValue: {
      fontSize: 18,
      fontWeight: "700",
      color: colors.text,
      marginTop: 2,
    },
  });
}
