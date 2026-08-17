import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useFocusEffect } from "@react-navigation/native";
import { File } from "expo-file-system";
import { useCallback, useMemo, useState } from "react";
import { Alert, FlatList, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { AnimatedPressable } from "../components/AnimatedPressable";
import { RidesList } from "../components/RidesList";
import { useIncomingGpx } from "../hooks/useIncomingGpx";
import { formatDate, rideNameFromFileName } from "../lib/format";
import type { GpxFileEntry } from "../lib/picker";
import {
  hasAllFilesAccess,
  openAllFilesAccessSettings,
  pickGpxFile,
  searchGpxFiles,
} from "../lib/picker";
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
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<GpxFileEntry[] | null>(
    null
  );

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

  // Primary import path: an instant MediaStore lookup, so the user lands on
  // a flat list of every GPX file on the device immediately — no folder
  // navigation, which Android's system picker can't do reliably (its MIME
  // filter is well-documented as inconsistent while browsing folders,
  // sometimes hiding real matches that only its own search finds).
  async function handleImport() {
    setSearching(true);
    try {
      const found = await searchGpxFiles();
      // Already-imported files stay in the search index forever — without
      // this, re-scanning just offers the same routes to import again.
      const alreadyImported = new Set(
        rides
          .map((r) => r.sourceFileName?.toLowerCase())
          .filter((name): name is string => !!name)
      );
      const results = found.filter(
        (entry) => !alreadyImported.has(entry.name.toLowerCase())
      );

      if (results.length > 0) {
        setSearchResults(results);
      } else if (found.length > 0) {
        Alert.alert(
          "Nothing new to import",
          "Every GPX file found is already in your route list."
        );
      } else if (!hasAllFilesAccess()) {
        Alert.alert(
          "Can't see files from other apps yet",
          "Without \"All files access\", this can only find GPX files this app saved itself. Grant it once and every GPX file on your device — from WhatsApp, Drive, wherever — will show up here instantly.",
          [
            { text: "Not now", style: "cancel" },
            { text: "Grant access", onPress: openAllFilesAccessSettings },
          ]
        );
      } else {
        Alert.alert(
          "No GPX files found",
          "The device's file index doesn't have anything ending in .gpx. Try \"Browse files manually\" instead."
        );
      }
    } catch (err) {
      Alert.alert(
        "Search failed",
        err instanceof Error ? err.message : "Unknown error"
      );
    } finally {
      setSearching(false);
    }
  }

  // Fallback for the rare file MediaStore hasn't indexed — opens the system
  // picker directly instead.
  async function handleBrowse() {
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

  async function handleImportFound(entry: GpxFileEntry) {
    setSearchResults(null);
    const xml = await new File(entry.uri).text();
    await importXml(entry.name, xml);
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
          style={[
            styles.button,
            (importing || searching) && styles.buttonDisabled,
          ]}
          onPress={handleImport}
          disabled={importing || searching}
        >
          <Text style={styles.buttonText}>
            {importing ? "Importing…" : searching ? "Searching…" : "Import GPX"}
          </Text>
        </AnimatedPressable>
        <AnimatedPressable
          style={[styles.button, styles.secondaryButton]}
          onPress={() => navigation.navigate("RoutePlanner")}
        >
          <Text style={styles.buttonText}>Plan a Route</Text>
        </AnimatedPressable>
      </View>
      <Pressable style={styles.scanLink} onPress={handleBrowse}>
        <Text style={styles.scanLinkText}>
          Can't find it here? Browse files manually
        </Text>
      </Pressable>

      <RidesList
        rides={routes}
        emptyText="No routes yet. Import a GPX file or plan one to get started."
        onPress={(id) => navigation.navigate("RideDetail", { id })}
        onDelete={handleDelete}
      />

      <Modal
        visible={searchResults !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setSearchResults(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.resultsCard}>
            <Text style={styles.resultsTitle}>
              Found {searchResults?.length ?? 0} GPX file
              {searchResults?.length === 1 ? "" : "s"}
            </Text>
            <FlatList
              data={searchResults ?? []}
              keyExtractor={(entry) => entry.uri}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.resultRow}
                  onPress={() => handleImportFound(item)}
                >
                  <Text style={styles.resultName}>{item.name}</Text>
                  <Text style={styles.resultPath} numberOfLines={1}>
                    {formatDate(new Date(item.modifiedAt).toISOString())}
                  </Text>
                </Pressable>
              )}
            />
            <Pressable
              style={styles.cancelButton}
              onPress={() => setSearchResults(null)}
            >
              <Text style={styles.cancelButtonText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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
    scanLink: {
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 4,
    },
    scanLinkText: {
      color: colors.highlight,
      fontSize: 13,
      textAlign: "center",
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: "#00000088",
      justifyContent: "center",
      alignItems: "center",
      padding: 24,
    },
    resultsCard: {
      backgroundColor: colors.background,
      borderRadius: radii.lg,
      padding: 20,
      width: "100%",
      maxHeight: "80%",
    },
    resultsTitle: {
      fontSize: 16,
      fontWeight: "700",
      marginBottom: 12,
      color: colors.text,
    },
    resultRow: {
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    resultName: {
      fontSize: 15,
      fontWeight: "600",
      color: colors.text,
    },
    resultPath: {
      fontSize: 12,
      color: colors.textMuted,
      marginTop: 2,
    },
    cancelButton: {
      marginTop: 12,
      paddingVertical: 10,
      alignItems: "center",
    },
    cancelButtonText: {
      color: colors.highlight,
      fontWeight: "600",
    },
  });
}
