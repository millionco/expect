import { useEffect, useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import { THEMES, type ThemeDefinition } from "./themes.js";
import { useColors, useThemeContext } from "./theme-context.js";
import { THEME_PICKER_VISIBLE_COUNT } from "./constants.js";
import { saveThemeName } from "./utils/load-theme.js";

type VariantFilter = "light" | "dark";

interface ThemePickerScreenProps {
  onBack: () => void;
}

const ALL_THEME_NAMES = Object.keys(THEMES);

const ThemeSwatch = ({ theme }: { theme: ThemeDefinition }) => (
  <Text>
    <Text color={theme.primary}>{"\u25A0"}</Text>
    <Text color={theme.secondary}>{"\u25A0"}</Text>
    <Text color={theme.accent}>{"\u25A0"}</Text>
    <Text color={theme.success}>{"\u25A0"}</Text>
  </Text>
);

const filterThemes = (filter: VariantFilter): string[] =>
  ALL_THEME_NAMES.filter((name) => THEMES[name]?.variant === filter);

export const ThemePickerScreen = ({ onBack }: ThemePickerScreenProps) => {
  const { themeName, setTheme } = useThemeContext();
  const colors = useColors();
  const [previousTheme] = useState(themeName);
  const currentVariant = THEMES[themeName]?.variant ?? "dark";
  const [variantFilter, setVariantFilter] = useState<VariantFilter>(currentVariant);

  const filteredThemeNames = useMemo(() => filterThemes(variantFilter), [variantFilter]);

  const [selectedIndex, setSelectedIndex] = useState(() => {
    const index = filteredThemeNames.indexOf(themeName);
    return index >= 0 ? index : 0;
  });

  useEffect(() => {
    const clamped = Math.min(selectedIndex, filteredThemeNames.length - 1);
    if (clamped !== selectedIndex) setSelectedIndex(clamped);
    const nextTheme = filteredThemeNames[clamped];
    if (nextTheme) setTheme(nextTheme);
  }, [selectedIndex, setTheme, filteredThemeNames]);

  const scrollOffset = useMemo(() => {
    if (filteredThemeNames.length <= THEME_PICKER_VISIBLE_COUNT) return 0;
    const half = Math.floor(THEME_PICKER_VISIBLE_COUNT / 2);
    const maxOffset = filteredThemeNames.length - THEME_PICKER_VISIBLE_COUNT;
    return Math.min(maxOffset, Math.max(0, selectedIndex - half));
  }, [selectedIndex, filteredThemeNames]);

  const visibleThemes = filteredThemeNames.slice(
    scrollOffset,
    scrollOffset + THEME_PICKER_VISIBLE_COUNT,
  );

  useInput((input, key) => {
    if (key.downArrow || input === "j" || (key.ctrl && input === "n")) {
      setSelectedIndex((previous) => Math.min(filteredThemeNames.length - 1, previous + 1));
    }
    if (key.upArrow || input === "k" || (key.ctrl && input === "p")) {
      setSelectedIndex((previous) => Math.max(0, previous - 1));
    }
    if (key.tab) {
      setVariantFilter((previous) => (previous === "light" ? "dark" : "light"));
    }
    if (key.return) {
      const selected = filteredThemeNames[selectedIndex];
      if (selected) saveThemeName(selected);
      onBack();
    }
    if (key.escape) {
      setTheme(previousTheme);
      onBack();
    }
  });

  const filterLabel = variantFilter === "light" ? "light" : "dark";

  return (
    <Box flexDirection="column" width="100%" paddingX={1} paddingY={1}>
      <Text bold color={colors.TEXT || undefined}>
        Select theme
      </Text>
      <Text color={colors.DIM}>
        {filteredThemeNames.length} themes{" "}
        <Text color={colors.TEXT || undefined}>[{filterLabel}]</Text>{" "}
        (<Text color={colors.TEXT || undefined}>{"\u21E5"} tab</Text> to filter)
      </Text>

      <Box
        marginTop={1}
        flexDirection="column"
        height={THEME_PICKER_VISIBLE_COUNT}
        overflow="hidden"
      >
        {visibleThemes.map((name, index) => {
          const actualIndex = index + scrollOffset;
          const theme = THEMES[name];
          if (!theme) return null;
          const isSelected = actualIndex === selectedIndex;
          return (
            <Text key={name}>
              <Text color={isSelected ? colors.ORANGE : colors.DIM}>
                {isSelected ? "\u25B6 " : "  "}
              </Text>
              <ThemeSwatch theme={theme} />
              <Text> </Text>
              <Text color={isSelected ? undefined : colors.DIM} bold={isSelected}>
                {theme.name}
              </Text>
            </Text>
          );
        })}
      </Box>

      <Box marginTop={1}>
        <Text color={colors.DIM}>
          {"\u2191/\u2193"} navigate {"\u00B7"} Enter select {"\u00B7"} Esc cancel
        </Text>
      </Box>
    </Box>
  );
};
