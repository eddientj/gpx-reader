import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useFocusEffect } from "@react-navigation/native";
import { File } from "expo-file-system";
import { useCallback, useMemo, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { AnimatedPressable } from "../components/AnimatedPressable";
import { RidesList } from "../components/RidesList";
import { useIncomingGpx } from "../hooks/useIncomingGpx";
import { rideNameFromFileName } from "../lib/format";
import { pickGpxFile } from "../lib/picker";
import { deleteRide, listRides, saveRide } from "../lib/storage";
import type { RideSummary } from "../lib/types";
import { prefetchWeather } from "../lib/weather";
import { useTheme, type Theme } from "../theme/ThemeContext";
import type { RootStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "Home">;

export function HomeScreen({ navigation }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [rides, setRides] = useState<RideSummary[]>([]);
  const [importing, setImporting] = useState(false);

  const refresh = useCallback(() => {
    listRides()
      .then(setRides)
      .catch((err) => {
        Alert.alert(
          "Couldn't load your routes",
          err instanceof Error ? err.message : "Unknown error"
        );
      });
  }, []);

  useFocusEffect(refresh);

  async function importXml(fileName: string, xml: string) {
    setImporting(true);
    try {
      const summary = await saveRide(
        xml,
        rideNameFromFileName(fileName) ?? "Imported route",
        fileName
      );
      prefetchWeather(summary.id);
      refresh();
    } catch (err) {
      Alert.alert(
        "Couldn't import route",
        err instanceof Error ? err.message : "Unknown error"
      );
    } finally {
      setImporting(false);
    }
  }

  // Handles the app being opened via "Open with" on a GPX file elsewhere on
  // the device (WhatsApp, My Files, email attachment, …).
  useIncomingGpx(
    useCallback(async (url: string) => {
      try {
        const file = new File(url);
        await importXml(file.name, await file.text());
      } catch (err) {
        Alert.alert(
          "Couldn't open that file",
          err instanceof Error ? err.message : "Unknown error"
        );
      }
    }, [])
  );

  // Straight to the system file picker (ACTION_OPEN_DOCUMENT, opens to a
  // "Recent" view) — no instant-search step first. That search depended on
  // MediaStore having indexed the file already, which lagged behind files
  // just placed on the device (e.g. via adb, or some file managers copying
  // directly) often enough that it read as broken. The manual picker reads
  // the real filesystem through the OS directly, so it has no such lag, and
  // needs no storage permission either.
  async function handleImport() {
    try {
      const uri = await pickGpxFile();
      if (!uri) return;

      const file = new File(uri);
      await importXml(file.name, await file.text());
    } catch (err) {
      Alert.alert(
        "Couldn't open the file picker",
        err instanceof Error ? err.message : "Unknown error"
      );
    }
  }

  async function handleDelete(id: string) {
    await deleteRide(id);
    refresh();
  }

  // This tab is for anything you'd navigate but haven't ridden live yet
  // (imported from a file, or drawn in the planner) — actual GPS-tracked
  // rides live on the separate My Rides tab instead.
  const routes = rides.filter((r) => r.origin !== "recorded");

  return (
    <View style={styles.container}>
      <View style={styles.actions}>
        <AnimatedPressable
          style={[styles.button, importing && styles.buttonDisabled]}
          onPress={handleImport}
          disabled={importing}
        >
          <Text style={styles.buttonText}>
            {importing ? "Importing…" : "Import GPX"}
          </Text>
        </AnimatedPressable>
        <AnimatedPressable
          style={[styles.button, styles.secondaryButton]}
          onPress={() => navigation.navigate("RoutePlanner")}
        >
          <Text style={styles.buttonText}>Plan a Route</Text>
        </AnimatedPressable>
      </View>
      <RidesList
        rides={routes}
        emptyText="No routes yet. Import a GPX file or plan one to get started."
        onPress={(id) => navigation.navigate("RideDetail", { id })}
        onDelete={handleDelete}
      />
    </View>
  );
}

function makeStyles({ colors, radii }: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    actions: {
      flexDirection: "row",
      gap: 10,
      paddingHorizontal: 16,
      paddingTop: 16,
    },
    button: {
      flex: 1,
      backgroundColor: colors.primary,
      borderRadius: radii.sm,
      paddingVertical: 12,
      alignItems: "center",
    },
    secondaryButton: {
      backgroundColor: colors.secondary,
    },
    buttonDisabled: {
      opacity: 0.6,
    },
    buttonText: {
      color: colors.primaryText,
      fontWeight: "600",
    },
  });
}
