import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { WeatherSummary } from "../lib/types";
import { useTheme, type Theme } from "../theme/ThemeContext";

type Props = {
  weather: WeatherSummary;
};

export function WeatherCard({ weather }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  return (
    <View style={styles.card}>
      <Text style={styles.condition}>{weather.condition}</Text>
      <View style={styles.row}>
        <Text style={styles.temp}>
          {Math.round(weather.tempMinC)}° – {Math.round(weather.tempMaxC)}°C
        </Text>
        {weather.precipitationMm > 0 && (
          <Text style={styles.precipitation}>
            {weather.precipitationMm.toFixed(1)} mm rain
          </Text>
        )}
      </View>
    </View>
  );
}

function makeStyles({ colors, radii }: Theme) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      paddingVertical: 14,
      paddingHorizontal: 16,
    },
    condition: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.text,
      marginBottom: 4,
    },
    row: {
      flexDirection: "row",
      justifyContent: "space-between",
    },
    temp: {
      fontSize: 14,
      color: colors.text,
    },
    precipitation: {
      fontSize: 14,
      color: colors.textMuted,
    },
  });
}
