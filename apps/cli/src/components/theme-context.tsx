interface Colors {
  TEXT: string;
  DIM: string;
  GREEN: string;
  PRIMARY: string;
  SELECTION: string;
  RED: string;
  BORDER: string;
  DIVIDER: string;
  YELLOW: string;
  PURPLE: string;
  CYAN: string;
  INPUT_BG: string;
  BANNER_BG: string;
  ERROR_BG: string;
}

const noColor = "NO_COLOR" in process.env;

export const theme = {
  primary: noColor ? "" : "whiteBright",
  secondary: noColor ? "" : "gray",
  accent: noColor ? "" : "white",
  error: noColor ? "" : "red",
  warning: noColor ? "" : "yellow",
  success: noColor ? "" : "green",
  info: noColor ? "" : "gray",
  text: noColor ? "" : "white",
  textMuted: noColor ? "" : "gray",
  border: noColor ? "" : "gray",
  borderSubtle: noColor ? "" : "blackBright",
  shimmerBase: noColor ? "" : "#555555",
  shimmerHighlight: noColor ? "" : "#ffffff",
  inputBg: noColor ? "" : "#1e1e1e",
  bannerBg: noColor ? "" : "#332b00",
  errorBg: noColor ? "" : "#330b0b",
};

export const COLORS: Colors = {
  TEXT: theme.text,
  DIM: theme.textMuted,
  GREEN: theme.success,
  PRIMARY: theme.primary,
  SELECTION: theme.accent,
  RED: theme.error,
  BORDER: theme.border,
  DIVIDER: theme.borderSubtle,
  YELLOW: theme.warning,
  PURPLE: theme.secondary,
  CYAN: theme.info,
  INPUT_BG: theme.inputBg,
  BANNER_BG: theme.bannerBg,
  ERROR_BG: theme.errorBg,
};

export const useColors = (): Colors => COLORS;
