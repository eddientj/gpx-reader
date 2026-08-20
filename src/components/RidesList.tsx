import { useMemo } from "react";
import { FlatList, Pressable, StyleSheet, Text } from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
} from "react-native-reanimated";
import {
  formatDate,
  formatDistance,
  formatDurationOrEstimate,
  formatElevation,
} from "../lib/format";
import type { RideSummary } from "../lib/types";
import { useTheme, type Theme } from "../theme/ThemeContext";
import { SwipeableRow } from "./SwipeableRow";

type Props = {
  rides: RideSummary[];
  emptyText: string;
  onPress: (id: string) => void;
  onDelete: (id: string) => void;
};

/** The swipeable, animated ride/route list shared by the Routes and My
 * Rides tabs — each screen just filters `rides` by origin before handing
 * it here, so the row rendering and delete gesture only exist once. */
export function RidesList({ rides, emptyText, onPress, onDelete }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  return (
    <FlatList
      data={rides}
      keyExtractor={(r) => r.id}
      contentContainerStyle={styles.list}
      ListHeaderComponent={
        // Swipe-to-delete has no other visual affordance — a real tester
        // missed it entirely and asked for a "delete" feature that already
        // existed. Only worth showing once there's something to delete.
        rides.length > 0 ? (
          <Text style={styles.hint}>Swipe a row left to delete it</Text>
        ) : null
      }
      ListEmptyComponent={<Text style={styles.empty}>{emptyText}</Text>}
      renderItem={({ item }) => (
        <Animated.View entering={FadeIn} exiting={FadeOut} layout={LinearTransition}>
          <SwipeableRow onDelete={() => onDelete(item.id)}>
            <Pressable style={styles.rideRow} onPress={() => onPress(item.id)}>
              <Text style={styles.rideName}>{item.name}</Text>
              <Text style={styles.rideMeta}>{formatDate(item.importedAt)}</Text>
              <Text style={styles.rideStats}>
                {formatDistance(item.stats.distanceMeters)} ·{" "}
                {formatDurationOrEstimate(
                  item.stats.durationSeconds,
                  item.stats.distanceMeters
                )}{" "}
                · ↑{formatElevation(item.stats.elevationGainMeters)} ↓
                {formatElevation(item.stats.elevationLossMeters)}
              </Text>
            </Pressable>
          </SwipeableRow>
        </Animated.View>
      )}
    />
  );
}

function makeStyles({ colors }: Theme) {
  return StyleSheet.create({
    list: {
      paddingBottom: 24,
    },
    empty: {
      textAlign: "center",
      color: colors.textMuted,
      marginTop: 40,
      marginHorizontal: 16,
    },
    hint: {
      fontSize: 12,
      color: colors.textMuted,
      textAlign: "center",
      paddingVertical: 8,
    },
    rideRow: {
      backgroundColor: colors.background,
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    rideName: {
      fontSize: 16,
      fontWeight: "600",
      color: colors.text,
    },
    rideMeta: {
      fontSize: 13,
      color: colors.textMuted,
      marginTop: 4,
    },
    rideStats: {
      fontSize: 13,
      color: colors.textMuted,
      marginTop: 2,
    },
  });
}
