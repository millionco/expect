import { useEffect } from "react";
import { Box, Text, useInput } from "ink";
import figures from "figures";
import { Option } from "effect";
import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { useAvailableAgents } from "../../hooks/use-available-agents";
import { useConfigOptions } from "../../hooks/use-config-options";
import { useNavigationStore, Screen } from "../../stores/use-navigation";
import { usePreferencesStore } from "../../stores/use-preferences";
import { useScrollableList } from "../../hooks/use-scrollable-list";
import { useColors } from "../theme-context";
import { agentProviderAtom } from "../../data/runtime";
import { agentConfigOptionsAtom } from "../../data/config-options";
import { ScreenHeading } from "../ui/screen-heading";
import { Clickable } from "../ui/clickable";
import { Spinner } from "../ui/spinner";
import type { AgentBackend } from "@expect/agent";
import type { AcpConfigOption, AcpConfigSelectOption } from "@expect/shared/models";

const VISIBLE_COUNT = 15;

interface PickerItem {
  kind: "agent" | "model";
  key: string;
  label: string;
  sublabel?: string;
  isCurrent: boolean;
  isDisabled: boolean;
  agentBackend?: AgentBackend;
  modelValue?: string;
  configId?: string;
}

const getModelOptions = (configOption: AcpConfigOption): AcpConfigSelectOption[] => {
  if (configOption.type !== "select" || !configOption.options) return [];
  const results: AcpConfigSelectOption[] = [];
  for (const entry of configOption.options) {
    if ("group" in entry) {
      results.push(...entry.options);
    } else {
      results.push(entry);
    }
  }
  return results;
};

export const AgentPickerScreen = () => {
  const COLORS = useColors();
  const setScreen = useNavigationStore((state) => state.setScreen);
  const setAgentProvider = useAtomSet(agentProviderAtom);
  const agentProvider = useAtomValue(agentProviderAtom);
  const cachedConfigOptions = useAtomValue(agentConfigOptionsAtom);
  const setConfigOptions = useAtomSet(agentConfigOptionsAtom);
  const setAgentBackend = usePreferencesStore((state) => state.setAgentBackend);
  const modelPreferences = usePreferencesStore((state) => state.modelPreferences);
  const setModelPreference = usePreferencesStore((state) => state.setModelPreference);
  const { data: agents = [], isLoading } = useAvailableAgents();

  const currentAgent = Option.isSome(agentProvider) ? agentProvider.value : "claude";

  const isCurrentAgentInstalled = agents.some(
    (agent) => agent.backend === currentAgent && agent.isInstalled,
  );
  const hasCachedOptions = (cachedConfigOptions[currentAgent] ?? []).length > 0;
  const { data: fetchedOptions, isLoading: isFetchingModels } = useConfigOptions(
    isCurrentAgentInstalled ? currentAgent : undefined,
  );

  const configOptions = hasCachedOptions
    ? (cachedConfigOptions[currentAgent] ?? [])
    : (fetchedOptions ?? []);

  useEffect(() => {
    if (!hasCachedOptions && fetchedOptions && fetchedOptions.length > 0) {
      setConfigOptions((previous) => ({
        ...previous,
        [currentAgent]: [...fetchedOptions],
      }));
    }
  }, [hasCachedOptions, fetchedOptions, currentAgent, setConfigOptions]);

  const items: PickerItem[] = [];

  for (const agent of agents) {
    items.push({
      kind: "agent",
      key: `agent-${agent.backend}`,
      label: agent.displayName,
      sublabel: !agent.isInstalled ? "not installed" : undefined,
      isCurrent: agent.backend === currentAgent,
      isDisabled: !agent.isInstalled,
      agentBackend: agent.backend,
    });
  }

  const modelConfig = configOptions.find(
    (option) => option.category === "model" && option.type === "select",
  );

  if (modelConfig) {
    const modelOptions = getModelOptions(modelConfig);
    const currentModelPref = modelPreferences[currentAgent]?.value;
    const currentModelValue =
      typeof modelConfig.currentValue === "string" ? modelConfig.currentValue : undefined;

    if (modelOptions.length > 0) {
      items.push({
        kind: "model",
        key: "model-header",
        label: `── ${modelConfig.name} ──`,
        isCurrent: false,
        isDisabled: true,
      });

      for (const modelOption of modelOptions) {
        const isSelected =
          currentModelPref === modelOption.value ||
          (!currentModelPref && modelOption.value === currentModelValue);
        items.push({
          kind: "model",
          key: `model-${modelOption.value}`,
          label: modelOption.name,
          sublabel: modelOption.description ?? undefined,
          isCurrent: isSelected,
          isDisabled: false,
          modelValue: modelOption.value,
          configId: modelConfig.id,
        });
      }
    }
  }

  const firstEnabledIndex = items.findIndex((item) => !item.isDisabled);
  const { highlightedIndex, setHighlightedIndex, scrollOffset } = useScrollableList({
    itemCount: items.length,
    visibleCount: VISIBLE_COUNT,
    initialIndex: firstEnabledIndex >= 0 ? firstEnabledIndex : 0,
  });

  const visibleItems = items.slice(scrollOffset, scrollOffset + VISIBLE_COUNT);

  const selectItem = (item: PickerItem) => {
    if (item.isDisabled) return;

    if (item.kind === "agent" && item.agentBackend) {
      setAgentProvider(Option.some(item.agentBackend));
      setAgentBackend(item.agentBackend);
      setScreen(Screen.Main());
      return;
    }

    if (item.kind === "model" && item.modelValue && item.configId) {
      setModelPreference(currentAgent, item.configId, item.modelValue);
      setScreen(Screen.Main());
    }
  };

  useInput((input, key) => {
    const isDown = key.downArrow || input === "j" || (key.ctrl && input === "n");
    const isUp = key.upArrow || input === "k" || (key.ctrl && input === "p");

    if (isDown || isUp) {
      setHighlightedIndex((previous) => {
        const direction = isDown ? 1 : -1;
        let next = previous + direction;
        while (next >= 0 && next < items.length && items[next]?.isDisabled) {
          next += direction;
        }
        if (next < 0 || next >= items.length) return previous;
        return next;
      });
      return;
    }

    if (key.return) {
      const selected = items[highlightedIndex];
      if (selected) selectItem(selected);
    }

    if (key.escape) {
      setScreen(Screen.Main());
    }
  });

  const subtitle = `${agents.filter((agent) => agent.isInstalled).length} installed`;

  return (
    <Box flexDirection="column" width="100%" paddingY={1}>
      <Box paddingX={1}>
        <ScreenHeading title="Agent" subtitle={subtitle} />
      </Box>

      {isLoading && (
        <Box marginTop={1} paddingX={1}>
          <Spinner message="Detecting agents..." />
        </Box>
      )}

      {!isLoading && (
        <Box
          marginTop={1}
          flexDirection="column"
          height={VISIBLE_COUNT}
          overflow="hidden"
          paddingX={1}
        >
          {isFetchingModels && !hasCachedOptions && <Spinner message="Loading models..." />}
          {visibleItems.map((item, index) => {
            const actualIndex = index + scrollOffset;
            const isHighlighted = actualIndex === highlightedIndex;

            if (item.isDisabled && item.kind === "model" && item.key === "model-header") {
              return (
                <Text key={item.key} color={COLORS.DIM}>
                  {"  "}
                  {item.label}
                </Text>
              );
            }

            const pointer = isHighlighted ? `${figures.pointer} ` : "  ";
            const itemColor = item.isDisabled
              ? COLORS.DIM
              : isHighlighted
                ? COLORS.PRIMARY
                : COLORS.TEXT;

            return (
              <Clickable
                key={item.key}
                onClick={() => {
                  setHighlightedIndex(actualIndex);
                  selectItem(item);
                }}
              >
                <Text color={itemColor} bold={isHighlighted} dimColor={item.isDisabled}>
                  {pointer}
                  {item.label}
                  {item.isCurrent && <Text color={COLORS.GREEN}> {figures.tick}</Text>}
                  {item.sublabel && <Text color={COLORS.DIM}> {item.sublabel}</Text>}
                </Text>
              </Clickable>
            );
          })}
        </Box>
      )}
    </Box>
  );
};
