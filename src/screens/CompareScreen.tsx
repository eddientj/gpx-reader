import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  formatDate,
  formatDistance,
  formatDuration,
  formatElevation,
  formatSpeed,
} from "../lib/format";
import { listRides } from "../lib/storage";
import type { RideStats, RideSummary } from "../lib/types";
import { useTheme, type Theme } from "../theme/ThemeContext";
import type { RootTabParamList } from "../navigation/types";

type Props = BottomTabScreenProps<RootTabParamList, "Compare">;

const STAT_ROWS: { key: string; label: string; format: (s: RideStats) => string }[] = [
  { key: "distance", label: "Distance", format: (s) => formatDistance(s.distanceMeters) },
  { key: "duration", label: "Duration", format: (s) => formatDuration(s.durationSeconds) },
  { key: "avgSpeed", label: "Avg Speed", format: (s) => formatSpeed(s.avgSpeedKmh) },
  { key: "maxSpeed", label: "Max Speed", format: (s) => formatSpeed(s.maxSpeedKmh) },
  { key: "gain", label: "Elevation Gain", format: (s) => formatElevation(s.elevationGainMeters) },
  { key: "loss", label: "Elevation Loss", format: (s) => formatElevation(s.elevationLossMeters) },
];

export function CompareScreen(_props: Props) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [rides, setRides] = useState<RideSummary[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useFocusEffect(
    useCallback(() => {
      listRides().then(setRides);
    }, [])
  );

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selected = rides.filter((r) => selectedIds.has(r.id));

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>Select routes to compare</Text>
      {rides.length === 0 && (
        <Text style={styles.empty}>No saved routes yet.</Text>
      )}
      {rides.map((ride) => {
        const isSelected = selectedIds.has(ride.id);
        return (
          <Pressable
            key={ride.id}
            style={[styles.rideRow, isSelected && styles.rideRowSelected]}
            onPress={() => toggle(ride.id)}
          >
            <View style={[styles.checkbox, isSelected && styles.checkboxChecked]} />
            <View style={styles.rideRowText}>
              <Text style={styles.rideName}>{ride.name}</Text>
              <Text style={styles.rideMeta}>{formatDate(ride.importedAt)}</Text>
            </View>
          </Pressable>
        );
      })}

      <Text style={styles.sectionTitle}>Comparison</Text>
      {selected.length < 2 ? (
        <Text style={styles.empty}>Select at least 2 routes above to compare.</Text>
      ) : (
        <ScrollView horizontal>
          <View>
            <View style={styles.row}>
              <View style={styles.labelCell} />
              {selected.map((r) => (
                <View key={r.id} style={styles.cell}>
                  <Text style={styles.headerText}>{r.name}</Text>
                </View>
              ))}
            </View>
            {STAT_ROWS.map((statRow) => (
              <View key={statRow.key} style={styles.row}>
                <View style={styles.labelCell}>
                  <Text style={styles.labelText}>{statRow.label}</Text>
                </View>
                {selected.map((r) => (
                  <View key={r.id} style={styles.cell}>
                    <Text style={styles.cellText}>{statRow.format(r.stats)}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </ScrollView>
  );
}

function makeStyles({ colors }: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: 16, paddingBottom: 32 },
    sectionTitle: {
      fontSize: 16,
      fontWeight: "700",
      marginTop: 20,
      marginBottom: 10,
      color: colors.text,
    },
    empty: { color: colors.textMuted },
    rideRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    rideRowSelected: { backgroundColor: colors.surfaceAlt },
    checkbox: {
      width: 20,
      height: 20,
      borderRadius: 4,
      borderWidth: 2,
      borderColor: colors.primary,
      marginRight: 12,
    },
    checkboxChecked: {
      backgroundColor: colors.primary,
    },
    rideRowText: { flex: 1 },
    rideName: { fontSize: 15, fontWeight: "600", color: colors.text },
    rideMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
    row: { flexDirection: "row" },
    labelCell: {
      width: 130,
      paddingVertical: 10,
      paddingRight: 8,
      justifyContent: "center",
    },
    cell: {
      width: 110,
      paddingVertical: 10,
      paddingHorizontal: 6,
      justifyContent: "center",
      borderLeftWidth: StyleSheet.hairlineWidth,
      borderLeftColor: colors.border,
    },
    headerText: { fontWeight: "700", fontSize: 13, color: colors.text },
    labelText: { fontSize: 13, color: colors.textMuted },
    cellText: { fontSize: 13, color: colors.text },
  });
}
