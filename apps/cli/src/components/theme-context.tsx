import { createContext, useContext, useState, type ReactNode } from "react";
import { THEMES, DEFAULT_DARK_THEME_NAME, type ThemeDefinition } from "../themes";

export interface Colors {
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
}

const colorsFromTheme = (theme: ThemeDefinition): Colors => ({
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
});

interface ThemeContextValue {
  colors: Colors;
  themeName: string;
  setTheme: (name: string) => void;
  theme: ThemeDefinition;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export const useColors = (): Colors => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useColors must be used within ThemeProvider");
  return context.colors;
};

export const useThemeContext = (): ThemeContextValue => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useThemeContext must be used within ThemeProvider");
  return context;
};

interface ThemeProviderProps {
  children: ReactNode;
  initialTheme?: string;
}

export const ThemeProvider = ({ children, initialTheme }: ThemeProviderProps) => {
  const [themeName, setThemeName] = useState(initialTheme ?? DEFAULT_DARK_THEME_NAME);
  const resolvedTheme = THEMES[themeName] ?? THEMES[DEFAULT_DARK_THEME_NAME];
  const colors = colorsFromTheme(resolvedTheme);

  return (
    <ThemeContext.Provider
      value={{ colors, themeName, setTheme: setThemeName, theme: resolvedTheme }}
    >
      {children}
    </ThemeContext.Provider>
  );
};
