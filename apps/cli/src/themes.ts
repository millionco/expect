export interface ThemeDefinition {
  name: string;
  variant: "light" | "dark";
  primary: string;
  secondary: string;
  accent: string;
  error: string;
  warning: string;
  success: string;
  info: string;
  text: string;
  textMuted: string;
  border: string;
  borderActive: string;
  borderSubtle: string;
}

export const DEFAULT_DARK_THEME_NAME = "doric-fire";

export const THEMES: Record<string, ThemeDefinition> = {
  "doric-fire": {
    name: "Doric Fire",
    variant: "dark",
    primary: "#d6b577",
    secondary: "#f3ac6f",
    accent: "#56452f",
    error: "#eca27f",
    warning: "#c5ba80",
    success: "#b9d08a",
    info: "#9fbfe7",
    text: "#f5ceb0",
    textMuted: "#afa497",
    border: "#706061",
    borderActive: "#7c362c",
    borderSubtle: "#40332b",
  },
  "flexoki-light": {
    name: "Flexoki Light",
    variant: "light",
    primary: "#205EA6",
    secondary: "#5E409D",
    accent: "#BC5215",
    error: "#AF3029",
    warning: "#BC5215",
    success: "#66800B",
    info: "#24837B",
    text: "#100F0F",
    textMuted: "#6F6E69",
    border: "#B7B5AC",
    borderActive: "#878580",
    borderSubtle: "#CECDC3",
  },
};
