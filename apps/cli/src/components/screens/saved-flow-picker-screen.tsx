import { Box, Text, useInput } from "ink";
import figures from "figures";
import cliTruncate from "cli-truncate";
import { ChangesFor, type SavedFlowFileData } from "@expect/supervisor";
import {
  useNavigationStore,
  Screen,
  screenForTestingOrPortPicker,
} from "../../stores/use-navigation";
import { useProjectPreferencesStore } from "../../stores/use-project-preferences";
import { useColors } from "../theme-context";
import { useStdoutDimensions } from "../../hooks/use-stdout-dimensions";
import { useScrollableList } from "../../hooks/use-scrollable-list";
import { useSavedFlows } from "../../hooks/use-saved-flows";
import { useGitState } from "../../hooks/use-git-state";
import { trackEvent } from "../../utils/session-analytics";
import { ScreenHeading } from "../ui/screen-heading";
import { Spinner } from "../ui/spinner";
import { visualPadEnd } from "../../utils/visual-pad-end";

const SAVED_FLOW_VISIBLE_COUNT = 15;

const getSavedFlowSteps = (flow: SavedFlowFileData) =>
  Array.isArray(flow.flow?.steps) ? flow.flow.steps : [];

const selectFlow = (flow: SavedFlowFileData, mainBranch: string) => {
  const changesFor = ChangesFor.makeUnsafe({ _tag: "Changes", mainBranch });
  const steps = getSavedFlowSteps(flow);
  const savedFlow = {
    title: flow.flow.title,
    userInstruction: flow.flow.userInstruction,
    steps,
  };
  const storedKeys = useProjectPreferencesStore.getState().cookieBrowserKeys;
  const cookieBrowserKeys =
    flow.environment.cookies && storedKeys.length === 0 ? ["chrome"] : storedKeys;

  trackEvent("flow:reused", { slug: flow.slug, step_count: steps.length });

  useNavigationStore.getState().setScreen(
    screenForTestingOrPortPicker({
      changesFor,
      instruction: flow.flow.userInstruction,
      savedFlow,
      cookieBrowserKeys,
    }),
  );
};

export const SavedFlowPickerScreen = () => {
  const COLORS = useColors();
  const [columns] = useStdoutDimensions();
  const setScreen = useNavigationStore((state) => state.setScreen);
  const { data: gitState } = useGitState();
  const { data: savedFlows = [], isLoading } = useSavedFlows();

  const { highlightedIndex, scrollOffset, handleNavigation } = useScrollableList({
    itemCount: savedFlows.length,
    visibleCount: SAVED_FLOW_VISIBLE_COUNT,
  });

  const titleColumnWidth = Math.min(40, Math.floor(columns * 0.35));
  const descriptionColumnWidth = Math.max(20, columns - titleColumnWidth - 8);

  const visibleItems = savedFlows.slice(scrollOffset, scrollOffset + SAVED_FLOW_VISIBLE_COUNT);

  useInput((input, key) => {
    if (handleNavigation(input, key)) return;

    if (key.return) {
      const selected = savedFlows[highlightedIndex];
      if (selected) {
        const mainBranch = gitState?.mainBranch ?? "main";
        selectFlow(selected, mainBranch);
      }
    }

    if (key.escape) {
      setScreen(Screen.Main());
    }
  });

  return (
    <Box flexDirection="column" width="100%" paddingY={1}>
      <Box paddingX={1}>
        <ScreenHeading
          title="Saved flows"
          subtitle={`${savedFlows.length} flow${savedFlows.length === 1 ? "" : "s"}`}
        />
      </Box>

      {isLoading && (
        <Box marginTop={1} paddingX={1}>
          <Spinner message="Loading saved flows..." />
        </Box>
      )}

      {!isLoading && savedFlows.length === 0 && (
        <Box marginTop={1} paddingX={1} flexDirection="column">
          <Text color={COLORS.DIM}>
            No saved flows yet. Run a test and press <Text color={COLORS.PRIMARY}>s</Text> on the
            results screen to save a flow.
          </Text>
        </Box>
      )}

      {!isLoading && savedFlows.length > 0 && (
        <Box
          marginTop={1}
          flexDirection="column"
          height={SAVED_FLOW_VISIBLE_COUNT}
          overflow="hidden"
          paddingX={1}
        >
          {visibleItems.map((flow, index) => {
            const actualIndex = index + scrollOffset;
            const isSelected = actualIndex === highlightedIndex;
            const stepCount = getSavedFlowSteps(flow).length;

            return (
              <Box key={flow.slug}>
                <Text color={isSelected ? COLORS.PRIMARY : COLORS.DIM}>
                  {isSelected ? `${figures.pointer} ` : "  "}
                </Text>
                <Text color={isSelected ? COLORS.PRIMARY : COLORS.TEXT} bold={isSelected}>
                  {visualPadEnd(cliTruncate(flow.title, titleColumnWidth - 1), titleColumnWidth)}
                </Text>
                <Text color={COLORS.DIM}>
                  {visualPadEnd(`${stepCount} step${stepCount === 1 ? "" : "s"}`, 10)}
                </Text>
                <Text color={COLORS.DIM}>
                  {cliTruncate(flow.description, descriptionColumnWidth)}
                </Text>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
};
