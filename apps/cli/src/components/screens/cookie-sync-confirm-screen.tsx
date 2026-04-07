import { useEffect, useRef, useState } from "react";
import { Box, Text, useInput } from "ink";
import { Option } from "effect";
import figures from "figures";
import type { ChangesFor, SavedFlow } from "@expect/shared/models";
import { Logo } from "../ui/logo";
import { Spinner } from "../ui/spinner";
import { useColors } from "../theme-context";
import { trackEvent } from "../../utils/session-analytics";
import {
  useNavigationStore,
  Screen,
  screenForTestingOrPortPicker,
} from "../../stores/use-navigation";
import { useProjectPreferencesStore } from "../../stores/use-project-preferences";
import { useInstalledBrowsers } from "../../hooks/use-installed-browsers";

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
  const setCookieImportProfiles = useProjectPreferencesStore(
    (state) => state.setCookieImportProfiles,
  );
  const { data, isLoading } = useInstalledBrowsers();

  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const defaultsInitialized = useRef(false);

  const items = data?.browsers ?? [];
  const itemCount = items.length;

  useEffect(() => {
    if (defaultsInitialized.current || !data || data.browsers.length === 0) return;
    defaultsInitialized.current = true;
    if (Option.isSome(data.default)) {
      setSelectedIds(new Set([data.default.value.id]));
    }
  }, [data]);

  const toggleId = (id: string) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const confirm = () => {
    const selectedProfiles = items.filter((browser) => selectedIds.has(browser.id));
    setCookieImportProfiles(selectedProfiles);
    trackEvent("cookies:browser_selection", {
      selected_count: selectedProfiles.length,
      browsers: selectedProfiles.map((browser) => browser.displayName).join(", "),
    });
    if (selectedProfiles.length > 0) {
      trackEvent("cookies:browser_selection", {
        selected_count: selectedProfiles.length,
        browsers: selectedProfiles.map((p) => p.id).join(","),
      });
      trackEvent("cookies:toggled", { enabled: true });
    }
    if (changesFor && instruction) {
      setScreen(
        screenForTestingOrPortPicker({
          changesFor,
          instruction,
          savedFlow,
          cookieImportProfiles: selectedProfiles,
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
      if (item) toggleId(item.id);
    }

    if (input === "a") {
      setSelectedIds(new Set(items.map((browser) => browser.id)));
    }

    if (input === "n") {
      setSelectedIds(new Set());
    }

    if (key.return) {
      confirm();
    }

    if (key.escape) {
      setScreen(Screen.Main());
    }
  });

  const selectedCount = selectedIds.size;

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
            const id = browser.id;
            const isHighlighted = index === highlightedIndex;
            const isSelected = selectedIds.has(id);
            const isDefault = Option.isSome(data!.default) && data!.default.value.id === id;

            return (
              <Box key={id}>
                <Text color={isHighlighted ? COLORS.PRIMARY : COLORS.DIM}>
                  {isHighlighted ? `${figures.pointer} ` : "  "}
                </Text>
                <Text color={isSelected ? COLORS.PRIMARY : COLORS.DIM}>
                  {isSelected ? figures.checkboxOn : figures.checkboxOff}{" "}
                </Text>
                <Text color={isHighlighted ? COLORS.PRIMARY : COLORS.TEXT} bold={isHighlighted}>
                  {browser.displayName}
                </Text>
                {isDefault && <Text color={COLORS.DIM}> (default)</Text>}
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
};
