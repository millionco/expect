import { useEffect, useRef, useState } from "react";
import { Box, Text, useInput } from "ink";
import figures from "figures";
import type { ChangesFor, SavedFlow } from "@expect/shared/models";
import { trackEvent } from "../../utils/session-analytics";
import { useColors } from "../theme-context";
import { Logo } from "../ui/logo";
import { Spinner } from "../ui/spinner";
import {
  useNavigationStore,
  Screen,
  screenForTestingOrPortPicker,
} from "../../stores/use-navigation";
import { useProjectPreferencesStore } from "../../stores/use-project-preferences";
import { useInstalledBrowsers, type DetectedBrowser } from "../../hooks/use-installed-browsers";

interface CookieSyncConfirmScreenProps {
  changesFor?: ChangesFor;
  instruction?: string;
  savedFlow?: SavedFlow;
}

export const CookieSyncConfirmScreen = ({
  changesFor,
  instruction,
  savedFlow,
}: CookieSyncConfirmScreenProps) => {
  const COLORS = useColors();
  const setScreen = useNavigationStore((state) => state.setScreen);
  const setCookieBrowserKeys = useProjectPreferencesStore((state) => state.setCookieBrowserKeys);
  const { data: browsers, isLoading } = useInstalledBrowsers();

  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const defaultsInitialized = useRef(false);

  const items: DetectedBrowser[] = browsers ?? [];
  const itemCount = items.length;

  useEffect(() => {
    if (defaultsInitialized.current || !browsers || browsers.length === 0) return;
    defaultsInitialized.current = true;
    const defaultBrowser = browsers.find((browser) => browser.isDefault);
    if (defaultBrowser) {
      setSelectedKeys(new Set([defaultBrowser.key]));
    }
  }, [browsers]);

  const toggleKey = (key: string) => {
    setSelectedKeys((previous) => {
      const next = new Set(previous);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const confirm = () => {
    const keys = [...selectedKeys];
    setCookieBrowserKeys(keys);
    trackEvent("cookies:browser_selection", {
      selected_count: keys.length,
      browsers: keys.join(","),
    });
    if (changesFor && instruction) {
      setScreen(
        screenForTestingOrPortPicker({
          changesFor,
          instruction,
          savedFlow,
          cookieBrowserKeys: keys,
        }),
      );
    } else {
      setScreen(Screen.Main());
    }
  };

  useInput((input, key) => {
    if (isLoading) return;

    if (key.downArrow || input === "j" || (key.ctrl && input === "n")) {
      setHighlightedIndex((previous) => Math.min(itemCount - 1, previous + 1));
    }

    if (key.upArrow || input === "k" || (key.ctrl && input === "p")) {
      setHighlightedIndex((previous) => Math.max(0, previous - 1));
    }

    if (input === " " && itemCount > 0) {
      const item = items[highlightedIndex];
      if (item) toggleKey(item.key);
    }

    if (input === "a") {
      const allKeys = items.map((browser) => browser.key);
      setSelectedKeys(new Set(allKeys));
    }

    if (input === "n") {
      setSelectedKeys(new Set());
    }

    if (key.return) {
      confirm();
    }

    if (key.escape) {
      setScreen(Screen.Main());
    }
  });

  const selectedCount = selectedKeys.size;

  return (
    <Box flexDirection="column" width="100%" paddingY={1} paddingX={1}>
      <Box>
        <Logo />
        <Text wrap="truncate">
          {" "}
          <Text color={COLORS.DIM}>{figures.pointerSmall}</Text>{" "}
          <Text color={COLORS.TEXT}>{instruction ?? "Select browsers for cookie sync"}</Text>
        </Text>
      </Box>

      <Box marginTop={1}>
        {selectedCount > 0 && (
          <Text color={COLORS.GREEN}>
            {figures.tick} Your signed-in session will be synced from {selectedCount} browser
            {selectedCount === 1 ? "" : "s"}
          </Text>
        )}
        {selectedCount === 0 && (
          <Text color={COLORS.YELLOW}>
            {figures.warning} No browsers selected — tests run without authentication
          </Text>
        )}
      </Box>

      {isLoading && (
        <Box marginTop={1}>
          <Spinner message="Detecting installed browsers" />
        </Box>
      )}

      {!isLoading && (
        <Box flexDirection="column" marginTop={1}>
          {items.map((browser, index) => {
            const isHighlighted = index === highlightedIndex;
            const isSelected = selectedKeys.has(browser.key);

            return (
              <Box key={browser.key}>
                <Text color={isHighlighted ? COLORS.PRIMARY : COLORS.DIM}>
                  {isHighlighted ? `${figures.pointer} ` : "  "}
                </Text>
                <Text color={isSelected ? COLORS.PRIMARY : COLORS.DIM}>
                  {isSelected ? figures.checkboxOn : figures.checkboxOff}{" "}
                </Text>
                <Text color={isHighlighted ? COLORS.PRIMARY : COLORS.TEXT} bold={isHighlighted}>
                  {browser.displayName}
                </Text>
                {browser.isDefault && <Text color={COLORS.DIM}> (default)</Text>}
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
};
