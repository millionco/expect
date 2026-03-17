import { useEffect, useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import figures from "figures";
import { SAVED_FLOW_PICKER_VISIBLE_COUNT } from "../../constants.js";
import { useColors } from "../theme-context.js";
import { RuledBox } from "../ui/ruled-box.js";
import { useFlowSessionStore } from "../../stores/use-flow-session.js";
import { EMPTY_SAVED_FLOWS, useSavedFlows } from "../../hooks/use-saved-flows.js";
import { queryClient } from "../../query-client.js";
import { formatTimeAgo } from "../../utils/format-time-ago.js";
import { CliRuntime } from "../../runtime.js";
import { loadSavedFlow, removeSavedFlow } from "@browser-tester/supervisor";
import { ScreenHeading } from "../ui/screen-heading.js";
import { ErrorMessage } from "../ui/error-message.js";
import { Clickable } from "../ui/clickable.js";

const ACTION_LABELS: Record<string, string> = {
  "test-unstaged": "Test current changes",
  "test-branch": "Test entire branch",
  "test-changes": "Test changes from main",
  "select-commit": "Test commit",
};

export const SavedFlowPickerScreen = () => {
  const COLORS = useColors();
  const testAction = useFlowSessionStore((state) => state.testAction);
  const { data: savedFlowSummaries = EMPTY_SAVED_FLOWS } = useSavedFlows();
  const applySavedFlow = useFlowSessionStore((state) => state.applySavedFlow);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loadingFilePath, setLoadingFilePath] = useState<string | null>(null);
  const [deletingFilePath, setDeletingFilePath] = useState<string | null>(null);
  const [deleteConfirmationVisible, setDeleteConfirmationVisible] = useState(false);
  const [loadingError, setLoadingError] = useState<string | null>(null);

  useEffect(() => {
    setSelectedIndex((previous) =>
      savedFlowSummaries.length === 0 ? 0 : Math.min(previous, savedFlowSummaries.length - 1),
    );
  }, [savedFlowSummaries.length]);

  const selectedFlow = savedFlowSummaries[selectedIndex] ?? null;
  const actionInProgress = Boolean(loadingFilePath || deletingFilePath);

  const scrollOffset = useMemo(() => {
    if (savedFlowSummaries.length <= SAVED_FLOW_PICKER_VISIBLE_COUNT) return 0;
    const half = Math.floor(SAVED_FLOW_PICKER_VISIBLE_COUNT / 2);
    const maxOffset = savedFlowSummaries.length - SAVED_FLOW_PICKER_VISIBLE_COUNT;
    return Math.min(maxOffset, Math.max(0, selectedIndex - half));
  }, [savedFlowSummaries.length, selectedIndex]);

  const visibleSavedFlows = savedFlowSummaries.slice(
    scrollOffset,
    scrollOffset + SAVED_FLOW_PICKER_VISIBLE_COUNT,
  );

  const selectFlow = (index: number) => {
    if (actionInProgress || deleteConfirmationVisible) return;
    const flow = savedFlowSummaries[index];
    if (!flow) return;

    setSelectedIndex(index);
    setLoadingError(null);
    setLoadingFilePath(flow.filePath);

    void CliRuntime.runPromise(loadSavedFlow(flow.filePath))
      .then((loaded) => applySavedFlow(loaded))
      .catch((caughtError) => {
        setLoadingError(
          caughtError instanceof Error ? caughtError.message : "Failed to load flow.",
        );
        setLoadingFilePath(null);
      });
  };

  const deleteSelectedFlow = () => {
    if (!selectedFlow || actionInProgress) return;

    setDeleteConfirmationVisible(false);
    setLoadingError(null);
    setDeletingFilePath(selectedFlow.filePath);

    void CliRuntime.runPromise(removeSavedFlow(selectedFlow.filePath))
      .then(() => queryClient.invalidateQueries({ queryKey: ["saved-flows"] }))
      .catch((caughtError) => {
        setLoadingError(
          caughtError instanceof Error ? caughtError.message : "Failed to remove saved flow.",
        );
      })
      .finally(() => {
        setDeletingFilePath(null);
      });
  };

  useInput((input, key) => {
    const normalizedInput = input.toLowerCase();

    if (deleteConfirmationVisible) {
      if (key.return) deleteSelectedFlow();
      if (normalizedInput === "n") setDeleteConfirmationVisible(false);
      return;
    }

    if (actionInProgress) return;
    if (savedFlowSummaries.length === 0) return;

    if (key.downArrow || normalizedInput === "j" || (key.ctrl && normalizedInput === "n")) {
      setSelectedIndex((previous) => Math.min(savedFlowSummaries.length - 1, previous + 1));
    }

    if (key.upArrow || normalizedInput === "k" || (key.ctrl && normalizedInput === "p")) {
      setSelectedIndex((previous) => Math.max(0, previous - 1));
    }

    if (key.return) selectFlow(selectedIndex);
    if (normalizedInput === "d") {
      setLoadingError(null);
      setDeleteConfirmationVisible(true);
    }
  });

  if (!testAction) return null;

  return (
    <Box flexDirection="column" width="100%" paddingY={1}>
      <Box paddingX={1}>
        <ScreenHeading title="Reuse saved flow" subtitle={ACTION_LABELS[testAction]} />
      </Box>

      <Box
        flexDirection="column"
        marginTop={1}
        height={SAVED_FLOW_PICKER_VISIBLE_COUNT}
        overflow="hidden"
        paddingX={1}
      >
        {visibleSavedFlows.map((savedFlow, index) => {
          const actualIndex = index + scrollOffset;
          const isSelected = actualIndex === selectedIndex;
          const isLoading = loadingFilePath === savedFlow.filePath;
          const isDeleting = deletingFilePath === savedFlow.filePath;
          const actionSuffix = isLoading ? " (loading...)" : isDeleting ? " (removing...)" : "";

          return (
            <Clickable key={savedFlow.filePath} onClick={() => selectFlow(actualIndex)}>
              <Box flexDirection="column" marginBottom={1}>
                <Text>
                  <Text color={isSelected ? COLORS.PRIMARY : COLORS.DIM}>
                    {isSelected ? `${figures.pointer} ` : "  "}
                  </Text>
                  {isSelected ? (
                    <Text color={COLORS.PRIMARY} bold>
                      {savedFlow.title}
                    </Text>
                  ) : (
                    <Text color={COLORS.TEXT}>{savedFlow.title}</Text>
                  )}
                  <Text color={COLORS.DIM}>{" · updated "}</Text>
                  <Text color={COLORS.DIM}>{formatTimeAgo(savedFlow.modifiedAtMs)}</Text>
                  {actionSuffix ? <Text color={COLORS.DIM}>{actionSuffix}</Text> : null}
                </Text>
                <Text color={COLORS.DIM}>
                  {"  "}
                  {savedFlow.description}
                  {savedFlow.savedTargetDisplayName
                    ? ` · saved for ${savedFlow.savedTargetDisplayName}`
                    : ""}
                </Text>
              </Box>
            </Clickable>
          );
        })}
        {savedFlowSummaries.length === 0 ? (
          <Text color={COLORS.DIM}>No compatible saved flows available yet.</Text>
        ) : null}
      </Box>

      {deleteConfirmationVisible && selectedFlow ? (
        <RuledBox color={COLORS.YELLOW} marginTop={1}>
          <Text color={COLORS.YELLOW} bold>
            Remove saved flow?
          </Text>
          <Text color={COLORS.DIM}>
            Press <Text color={COLORS.PRIMARY}>Enter</Text> to remove{" "}
            <Text color={COLORS.TEXT}>{selectedFlow.title}</Text> or{" "}
            <Text color={COLORS.PRIMARY}>n</Text> to cancel.
          </Text>
        </RuledBox>
      ) : savedFlowSummaries.length > 0 ? (
        <Box marginTop={1} paddingX={1}>
          <Text color={COLORS.DIM}>
            Press <Text color={COLORS.PRIMARY}>Enter</Text> to load or{" "}
            <Text color={COLORS.PRIMARY}>d</Text> to remove the selected flow.
          </Text>
        </Box>
      ) : null}

      <Box paddingX={1}>
        <ErrorMessage message={loadingError} />
      </Box>
    </Box>
  );
};
