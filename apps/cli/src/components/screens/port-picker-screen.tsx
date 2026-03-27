import { useState } from "react";
import { Box, Text, useInput } from "ink";
import figures from "figures";
import type { ChangesFor, SavedFlow } from "@expect/shared/models";
import { PORT_PICKER_VISIBLE_COUNT } from "../../constants";
import { useColors } from "../theme-context";
import { type ExecutionMode, useNavigationStore, Screen } from "../../stores/use-navigation";
import { useProjectPreferencesStore } from "../../stores/use-project-preferences";
import { useListeningPorts } from "../../hooks/use-listening-ports";
import { useScrollableList } from "../../hooks/use-scrollable-list";
import { trackEvent } from "../../utils/session-analytics";
import { SearchBar } from "../ui/search-bar";
import { Input } from "../ui/input";
import { Clickable } from "../ui/clickable";
import { Logo } from "../ui/logo";

interface PortPickerScreenProps {
  changesFor: ChangesFor;
  instruction: string;
  savedFlow?: SavedFlow;
  requiresCookies?: boolean;
  mode?: ExecutionMode;
}

interface PortEntry {
  readonly port: number;
  readonly processName: string;
  readonly cwd: string;
}

const portToUrl = (port: number): string => `http://localhost:${port}`;

const matchesSearch = (entry: PortEntry, query: string): boolean => {
  const lowerQuery = query.toLowerCase();
  return (
    String(entry.port).includes(lowerQuery) ||
    entry.processName.toLowerCase().includes(lowerQuery) ||
    entry.cwd.toLowerCase().includes(lowerQuery)
  );
};

const isPortOrUrl = (value: string): number | undefined => {
  const trimmed = value.trim();

  const portNumber = Number(trimmed);
  if (Number.isInteger(portNumber) && portNumber >= 1 && portNumber <= 65535) {
    return portNumber;
  }

  const urlMatch = trimmed.match(/:(\d+)\/?$/);
  if (urlMatch) {
    const extracted = Number(urlMatch[1]);
    if (Number.isInteger(extracted) && extracted >= 1 && extracted <= 65535) {
      return extracted;
    }
  }

  return undefined;
};

export const PortPickerScreen = ({
  changesFor,
  instruction,
  savedFlow,
  requiresCookies,
  mode = "run",
}: PortPickerScreenProps) => {
  const COLORS = useColors();
  const setScreen = useNavigationStore((state) => state.setScreen);
  const lastBaseUrl = useProjectPreferencesStore((state) => state.lastBaseUrl);
  const setLastBaseUrl = useProjectPreferencesStore((state) => state.setLastBaseUrl);
  const { data: listeningPorts = [] } = useListeningPorts();

  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isEnteringCustomUrl, setIsEnteringCustomUrl] = useState(false);
  const [customUrlValue, setCustomUrlValue] = useState("");
  const [selectedPorts, setSelectedPorts] = useState<Set<number>>(() => {
    if (!lastBaseUrl) return new Set();
    const urlMatch = lastBaseUrl.match(/:(\d+)/);
    if (urlMatch) return new Set([Number(urlMatch[1])]);
    return new Set();
  });
  const [customUrls, setCustomUrls] = useState<Set<string>>(new Set());

  const entries: PortEntry[] = listeningPorts.map((listening) => ({
    port: listening.port,
    processName: listening.processName,
    cwd: listening.cwd,
  }));

  const filteredEntries = searchQuery
    ? entries.filter((entry) => matchesSearch(entry, searchQuery))
    : entries;

  const customUrlIndex = filteredEntries.length;
  const skipIndex = filteredEntries.length + 1;
  const itemCount = filteredEntries.length + 2;

  const { highlightedIndex, setHighlightedIndex, scrollOffset, handleNavigation } =
    useScrollableList({
      itemCount,
      visibleCount: PORT_PICKER_VISIBLE_COUNT,
    });

  const navigateToTesting = (baseUrls: readonly string[]) => {
    const allUrls = [...baseUrls, ...customUrls];
    const lastUrl = allUrls.length > 0 ? allUrls[0] : undefined;
    setLastBaseUrl(lastUrl);

    if (allUrls.length === 0) {
      trackEvent("port:skipped");
    } else {
      trackEvent("port:selected", {
        port_count: allUrls.length,
        has_custom_url: customUrls.size > 0,
      });
    }

    setScreen(
      (mode === "watch" ? Screen.Watch : Screen.Testing)({
        changesFor,
        instruction,
        savedFlow,
        requiresCookies,
        baseUrls: allUrls.length > 0 ? allUrls : undefined,
      }),
    );
  };

  const togglePort = (port: number) => {
    setSelectedPorts((previous) => {
      const next = new Set(previous);
      if (next.has(port)) {
        next.delete(port);
      } else {
        next.add(port);
      }
      return next;
    });
  };

  const confirmSelection = () => {
    if (highlightedIndex === skipIndex) {
      navigateToTesting([]);
      return;
    }

    if (selectedPorts.size > 0 || customUrls.size > 0) {
      const urls = [...selectedPorts].sort((left, right) => left - right).map(portToUrl);
      navigateToTesting(urls);
      return;
    }

    if (highlightedIndex === customUrlIndex) {
      setIsEnteringCustomUrl(true);
      return;
    }

    const entry = filteredEntries[highlightedIndex];
    if (entry) {
      navigateToTesting([portToUrl(entry.port)]);
    }
  };

  const normalizeCustomUrl = (value: string): string => {
    const trimmed = value.trim();
    const portNumber = Number(trimmed);
    if (Number.isInteger(portNumber) && portNumber >= 1 && portNumber <= 65535) {
      return portToUrl(portNumber);
    }
    if (!/^https?:\/\//i.test(trimmed)) {
      return `http://${trimmed}`;
    }
    return trimmed;
  };

  const handleCustomUrlSubmit = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      setIsEnteringCustomUrl(false);
      return;
    }
    const url = normalizeCustomUrl(trimmed);
    setCustomUrls((previous) => new Set([...previous, url]));
    setCustomUrlValue("");
    setIsEnteringCustomUrl(false);
  };

  const removeCustomUrl = (url: string) => {
    setCustomUrls((previous) => {
      const next = new Set(previous);
      next.delete(url);
      return next;
    });
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setHighlightedIndex(0);
  };

  const handleSearchSubmit = (value: string) => {
    const customPort = isPortOrUrl(value);
    if (customPort) {
      togglePort(customPort);
      setIsSearching(false);
      setSearchQuery("");
      return;
    }
    setIsSearching(false);
  };

  useInput((input, key) => {
    if (isEnteringCustomUrl) {
      if (key.escape) {
        setIsEnteringCustomUrl(false);
        setCustomUrlValue("");
        return;
      }
      return;
    }

    if (isSearching) {
      if (key.escape) {
        setIsSearching(false);
        return;
      }
      return;
    }

    if (handleNavigation(input, key)) return;

    if (input === "/") {
      setIsSearching(true);
      return;
    }

    if (input === " ") {
      if (highlightedIndex === customUrlIndex) {
        setIsEnteringCustomUrl(true);
        return;
      }
      const entry = filteredEntries[highlightedIndex];
      if (entry) {
        togglePort(entry.port);
      }
      return;
    }

    if (key.return) {
      confirmSelection();
    }
  });

  const portListVisibleCount = PORT_PICKER_VISIBLE_COUNT - 2;
  const visibleItems = filteredEntries.slice(scrollOffset, scrollOffset + portListVisibleCount);
  const customUrlVisible = scrollOffset + portListVisibleCount >= filteredEntries.length;
  const skipVisible = customUrlVisible;

  const highlightedEntry = filteredEntries[highlightedIndex];
  const isCustomUrlHighlighted = highlightedIndex === customUrlIndex;
  const isSkipHighlighted = highlightedIndex === skipIndex;

  const allSelectedUrls = [
    ...[...selectedPorts].sort((left, right) => left - right).map(portToUrl),
    ...customUrls,
  ];

  return (
    <Box flexDirection="column" width="100%" paddingY={1} paddingX={1}>
      <Box>
        <Logo />
        <Text wrap="truncate">
          {" "}
          <Text color={COLORS.DIM}>{figures.pointerSmall}</Text>{" "}
          <Text color={COLORS.TEXT}>{instruction}</Text>
        </Text>
      </Box>

      <Box marginTop={1}>
        <Text color={COLORS.DIM}>Pick the dev server the agent should open in the browser.</Text>
      </Box>

      <Box marginTop={1}>
        {allSelectedUrls.length > 0 && (
          <Text color={COLORS.GREEN}>
            {figures.tick} {allSelectedUrls.join(", ")}
          </Text>
        )}
        {allSelectedUrls.length === 0 &&
          !isSkipHighlighted &&
          !isCustomUrlHighlighted &&
          highlightedEntry && (
            <Text color={COLORS.DIM}>
              {figures.arrowRight} {portToUrl(highlightedEntry.port)}
            </Text>
          )}
        {allSelectedUrls.length === 0 && isSkipHighlighted && (
          <Text color={COLORS.YELLOW}>
            {figures.warning} No base URL. The agent won{"'"}t know where your dev server is.
          </Text>
        )}
      </Box>

      <Box flexDirection="column" marginTop={1}>
        {visibleItems.map((entry, index) => {
          const actualIndex = index + scrollOffset;
          const isHighlighted = actualIndex === highlightedIndex;
          const isSelected = selectedPorts.has(entry.port);

          return (
            <Clickable
              key={entry.port}
              onClick={() => {
                setHighlightedIndex(actualIndex);
                togglePort(entry.port);
              }}
            >
              <Box>
                <Text color={isHighlighted ? COLORS.PRIMARY : COLORS.DIM}>
                  {isHighlighted ? `${figures.pointer} ` : "  "}
                </Text>
                <Text color={isSelected ? COLORS.PRIMARY : COLORS.DIM}>
                  {isSelected ? figures.checkboxOn : figures.checkboxOff}{" "}
                </Text>
                <Text color={isHighlighted ? COLORS.PRIMARY : COLORS.TEXT} bold={isHighlighted}>
                  :{entry.port}
                </Text>
                {entry.processName && <Text color={COLORS.DIM}> {entry.processName}</Text>}
                {entry.cwd && <Text color={COLORS.DIM}> {entry.cwd}</Text>}
              </Box>
            </Clickable>
          );
        })}
        {customUrlVisible && (
          <Clickable
            onClick={() => {
              setHighlightedIndex(customUrlIndex);
              setIsEnteringCustomUrl(true);
            }}
          >
            <Box>
              <Text color={isCustomUrlHighlighted ? COLORS.PRIMARY : COLORS.DIM}>
                {isCustomUrlHighlighted ? `${figures.pointer} ` : "  "}
              </Text>
              {isEnteringCustomUrl && (
                <Box>
                  <Text color={COLORS.PRIMARY}>URL: </Text>
                  <Input
                    focus
                    value={customUrlValue}
                    placeholder="http://localhost:4000 or staging.example.com"
                    onChange={setCustomUrlValue}
                    onSubmit={handleCustomUrlSubmit}
                  />
                </Box>
              )}
              {!isEnteringCustomUrl && (
                <Text
                  color={isCustomUrlHighlighted ? COLORS.PRIMARY : COLORS.TEXT}
                  bold={isCustomUrlHighlighted}
                >
                  Enter a custom URL{figures.ellipsis}
                </Text>
              )}
            </Box>
          </Clickable>
        )}
        {customUrlVisible &&
          [...customUrls].map((url) => (
            <Clickable key={url} onClick={() => removeCustomUrl(url)}>
              <Box>
                <Text> </Text>
                <Text color={COLORS.PRIMARY}>{figures.checkboxOn} </Text>
                <Text color={COLORS.TEXT}>{url}</Text>
                <Text color={COLORS.DIM}> (click to remove)</Text>
              </Box>
            </Clickable>
          ))}
        {skipVisible && (
          <Clickable
            onClick={() => {
              setHighlightedIndex(skipIndex);
              navigateToTesting([]);
            }}
          >
            <Box>
              <Text color={isSkipHighlighted ? COLORS.PRIMARY : COLORS.DIM}>
                {isSkipHighlighted ? `${figures.pointer} ` : "  "}
              </Text>
              <Text
                color={isSkipHighlighted ? COLORS.PRIMARY : COLORS.DIM}
                bold={isSkipHighlighted}
              >
                Skip {figures.arrowRight} no base URL
              </Text>
            </Box>
          </Clickable>
        )}
        {filteredEntries.length === 0 && !skipVisible && (
          <Text color={COLORS.DIM}>No matching ports</Text>
        )}
      </Box>

      <SearchBar
        isSearching={isSearching}
        query={searchQuery}
        onChange={handleSearchChange}
        onSubmit={handleSearchSubmit}
      />
    </Box>
  );
};
