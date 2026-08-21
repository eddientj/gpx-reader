export type ThemeColors = {
  background: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  primary: string;
  primaryText: string;
  secondary: string;
  highlight: string;
  danger: string;
  dangerText: string;
  success: string;
  text: string;
  textMuted: string;
  /** Ordered fills for multi-segment charts (BreakdownBar) — distinct enough
   * to read as separate categories at a glance. */
  chartRamp: string[];
};

export const lightColors: ThemeColors = {
  background: "#FAF7F0",
  surface: "#F1EDE1",
  surfaceAlt: "#E4EFE0",
  border: "#DCD5C4",
  primary: "#2F6F4E",
  primaryText: "#FFFFFF",
  secondary: "#8FAF7B",
  highlight: "#5B8FA8",
  danger: "#C1653A",
  dangerText: "#FFFFFF",
  success: "#3FA35E",
  text: "#20301F",
  textMuted: "#5B6B57",
  // Five genuinely distinct hues (green/blue/amber/plum/gray) rather than
  // shades of the same green — the previous ramp's last two entries were
  // both muted beige, nearly indistinguishable on a thin chart line even
  // though they read fine as wide bar segments.
  chartRamp: ["#2F6F4E", "#3E7CB1", "#C9962C", "#8B5FA3", "#6B7280"],
};

export const darkColors: ThemeColors = {
  background: "#141F18",
  surface: "#1D2A22",
  surfaceAlt: "#24352A",
  border: "#33453A",
  primary: "#5FBE84",
  primaryText: "#10241A",
  secondary: "#7FA06C",
  highlight: "#7FB2CC",
  danger: "#D97B55",
  dangerText: "#10241A",
  success: "#6FCB8E",
  text: "#EAEFE6",
  textMuted: "#9BAA95",
  // Same fix as the light ramp — the old last two entries were both dark
  // green-gray, one of them identical to `border`, so a category using it
  // was nearly invisible against the app's own chrome.
  chartRamp: ["#5FBE84", "#6FB0E0", "#E0A458", "#B78FD1", "#9AA5A0"],
};
