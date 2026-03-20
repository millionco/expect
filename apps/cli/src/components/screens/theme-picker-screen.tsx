import { useRef, useState } from "react";
import { Box, Text, useInput } from "ink";
import figures from "figures";
import { THEMES, type ThemeDefinition } from "../../themes";
import { useColors, useThemeContext } from "../theme-context";
import { Clickable } from "../ui/clickable";
import { THEME_PICKER_VISIBLE_COUNT } from "../../constants";
import { saveThemeName } from "../../utils/load-theme";
import { useScrollableList } from "../../hooks/use-scrollable-list";
import { useNavigationStore } from "../../stores/use-navigation";
import { ScreenHeading } from "../ui/screen-heading";

type VariantFilter = "light" | "dark";

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

export const ThemePickerScreen = () => {
  const navigateTo = useNavigationStore((state) => state.navigateTo);
  const previousScreen = useNavigationStore((state) => state.previousScreen);
  const { themeName, setTheme } = useThemeContext();
  const COLORS = useColors();
  const [previousTheme] = useState(themeName);
  const currentVariant = THEMES[themeName]?.variant ?? "dark";
  const [variantFilter, setVariantFilter] = useState<VariantFilter>(currentVariant);

  const filteredThemeNames = filterThemes(variantFilter);

  const {
    highlightedIndex: selectedIndex,
    setHighlightedIndex: setSelectedIndex,
    scrollOffset,
    handleNavigation,
  } = useScrollableList({
    itemCount: filteredThemeNames.length,
    visibleCount: THEME_PICKER_VISIBLE_COUNT,
    initialIndex: () => {
      const index = filteredThemeNames.indexOf(themeName);
      return index >= 0 ? index : 0;
    },
  });

  const previousThemeDepsRef = useRef({ selectedIndex, variantFilter });
  if (
    previousThemeDepsRef.current.selectedIndex !== selectedIndex ||
    previousThemeDepsRef.current.variantFilter !== variantFilter
  ) {
    previousThemeDepsRef.current = { selectedIndex, variantFilter };
    const nextTheme = filteredThemeNames[selectedIndex];
    if (nextTheme) setTheme(nextTheme);
  }

  const visibleThemes = filteredThemeNames.slice(
    scrollOffset,
    scrollOffset + THEME_PICKER_VISIBLE_COUNT,
  );

  useInput((input, key) => {
    if (handleNavigation(input, key)) return;

    if (key.tab) {
      setVariantFilter((previous) => (previous === "light" ? "dark" : "light"));
    }
    if (key.return) {
      const selected = filteredThemeNames[selectedIndex];
      if (selected) saveThemeName(selected);
      navigateTo(previousScreen);
    }
    if (key.escape) {
      setTheme(previousTheme);
      navigateTo(previousScreen);
    }
  });

  const filterLabel = variantFilter === "light" ? "light" : "dark";

  return (
    <Box flexDirection="column" width="100%" paddingX={1} paddingY={1}>
      <ScreenHeading
        title="Select theme"
        subtitle={`${filteredThemeNames.length} themes · ${filterLabel}`}
      />
      <Box marginTop={1}>
        <Clickable
          fullWidth={false}
          onClick={() => setVariantFilter((previous) => (previous === "light" ? "dark" : "light"))}
        >
          <Text color={COLORS.TEXT}>[{filterLabel}]</Text>
        </Clickable>
        <Text color={COLORS.DIM}>
          {" "}
          (<Text color={COLORS.TEXT}>{"\u21E5"} tab</Text> to filter)
        </Text>
      </Box>

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
            <Clickable key={name} onClick={() => setSelectedIndex(actualIndex)}>
              {isSelected ? (
                <Text>
                  <Text color={COLORS.PRIMARY}>{figures.pointer} </Text>
                  <ThemeSwatch theme={theme} />
                  <Text> </Text>
                  <Text color={COLORS.PRIMARY} bold>
                    {theme.name}
                  </Text>
                </Text>
              ) : (
                <Text>
                  <Text color={COLORS.DIM}>{"  "}</Text>
                  <ThemeSwatch theme={theme} />
                  <Text> </Text>
                  <Text color={COLORS.DIM}>{theme.name}</Text>
                </Text>
              )}
            </Clickable>
          );
        })}
      </Box>
    </Box>
  );
};
