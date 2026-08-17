import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useMemo, useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { RidesList } from "../components/RidesList";
import { deleteRide, listRides } from "../lib/storage";
import type { RideSummary } from "../lib/types";
import { useTheme, type Theme } from "../theme/ThemeContext";
import type { RootStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "Home">;

/** Rides you've actually GPS-tracked live — a route you imported or planned
 * but haven't ridden yet lives on the separate Routes tab instead. */
export function MyRidesScreen({ navigation }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [rides, setRides] = useState<RideSummary[]>([]);

  const refresh = useCallback(() => {
    listRides()
      .then((all) => setRides(all.filter((r) => r.origin === "recorded")))
      .catch((err) => {
        Alert.alert(
          "Couldn't load your rides",
          err instanceof Error ? err.message : "Unknown error"
        );
      });
  }, []);

  useFocusEffect(refresh);

  async function handleDelete(id: string) {
    await deleteRide(id);
    refresh();
  }

  return (
    <View style={styles.container}>
      <RidesList
        rides={rides}
        emptyText="No rides recorded yet. Start one from the Record tab."
        onPress={(id) => navigation.navigate("RideDetail", { id })}
        onDelete={handleDelete}
      />
    </View>
  );
}

function makeStyles({ colors }: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
  });
}
