import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useColorScheme } from "react-native";
import { darkColors, lightColors, type ThemeColors } from "./colors";

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
export const radii = { sm: 8, md: 12, lg: 16 };

export type Theme = {
  colors: ThemeColors;
  scheme: "light" | "dark";
  spacing: typeof spacing;
  radii: typeof radii;
};

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme() === "dark" ? "dark" : "light";

  const theme = useMemo<Theme>(
    () => ({
      colors: scheme === "dark" ? darkColors : lightColors,
      scheme,
      spacing,
      radii,
    }),
    [scheme]
  );

  return (
    <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error("useTheme must be used within a ThemeProvider");
  return theme;
}
