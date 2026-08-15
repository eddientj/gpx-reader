import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme, type Theme } from "../theme/ThemeContext";

type Props = {
  label: string;
  value: string;
};

export function StatCard({ label, value }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  return (
    <View style={styles.card}>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

function makeStyles({ colors, radii }: Theme) {
  return StyleSheet.create({
    card: {
      flexBasis: "48%",
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      paddingVertical: 14,
      paddingHorizontal: 12,
      marginBottom: 10,
    },
    value: {
      fontSize: 20,
      fontWeight: "700",
      color: colors.text,
    },
    label: {
      fontSize: 13,
      color: colors.textMuted,
      marginTop: 2,
    },
  });
}
