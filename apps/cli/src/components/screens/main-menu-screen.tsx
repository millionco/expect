import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, useInput } from "ink";
import { Option } from "effect";
import { TestPlanDraft, ChangesFor, checkoutBranch } from "@browser-tester/supervisor";
import type { GitState, TestContext } from "@browser-tester/shared/models";
import { usePreferencesStore } from "../../stores/use-preferences.js";
import { usePlanStore, Plan } from "../../stores/use-plan-store.js";
import { useNavigationStore, Screen } from "../../stores/use-navigation.js";
import { useColors } from "../theme-context.js";
import { Clickable } from "../ui/clickable.js";
import { Input } from "../ui/input.js";
import { RuledBox } from "../ui/ruled-box.js";
import { ErrorMessage } from "../ui/error-message.js";
import { ContextPicker } from "../ui/context-picker.js";
import { useStdoutDimensions } from "../../hooks/use-stdout-dimensions.js";
import { DotField } from "../ui/dot-field.js";
import { useContextPicker } from "../../hooks/use-context-picker.js";
import { getFlowSuggestions } from "../../utils/get-flow-suggestions.js";
import { getContextDisplayLabel, getContextDescription } from "../../utils/context-options.js";
import { queryClient } from "../../query-client.js";

interface MainMenuProps {
  gitState: GitState;
}

export const MainMenu = ({ gitState }: MainMenuProps) => {
  const COLORS = useColors();
  const [columns] = useStdoutDimensions();
  const toggleSkipPlanning = usePreferencesStore((state) => state.toggleSkipPlanning);
  const setScreen = useNavigationStore((state) => state.setScreen);
  const plan = usePlanStore((state) => state.plan);
  const [selectedContext, setSelectedContext] = useState<TestContext | undefined>(undefined);
  const savedInstruction =
    plan?._tag === "draft" ? plan.instruction : plan?._tag === "plan" ? plan.instruction : "";
  const [value, setValue] = useState(savedInstruction);
  const [inputKey, setInputKey] = useState(0);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [hasCycled, setHasCycled] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);

  const picker = useContextPicker({
    gitState,
    onSelect: setSelectedContext,
  });

  const defaultContext = useMemo(() => {
    return picker.localOptions.find((option) => option._tag === "WorkingTree") ?? undefined;
  }, [picker.localOptions]);

  const activeContext = selectedContext ?? defaultContext ?? null;
  const suggestions = useMemo(
    () => getFlowSuggestions(activeContext, gitState),
    [activeContext, gitState],
  );

  useEffect(() => {
    setSuggestionIndex(0);
  }, [activeContext, gitState]);

  const submit = useCallback(
    (submittedValue?: string) => {
      const trimmed = (submittedValue ?? value).trim();
      console.error("[main-menu] submit called, trimmed:", JSON.stringify(trimmed));
      if (!trimmed) {
        setErrorMessage("Describe what you want the browser agent to test.");
        return;
      }

      const mainBranch = gitState.mainBranch ?? "main";
      let changesFor: ChangesFor;

      console.error("[main-menu] activeContext:", activeContext?._tag ?? "none");

      if (activeContext?._tag === "Commit") {
        changesFor = ChangesFor.makeUnsafe({ _tag: "Commit", hash: activeContext.hash });
      } else if (activeContext?._tag === "Branch" || activeContext?._tag === "PullRequest") {
        if (activeContext.branch.name) {
          checkoutBranch(process.cwd(), activeContext.branch.name);
          void queryClient.invalidateQueries({ queryKey: ["git-state"] });
        }
        changesFor = ChangesFor.makeUnsafe({ _tag: "Branch", mainBranch });
      } else {
        changesFor = ChangesFor.makeUnsafe({ _tag: "Changes", mainBranch });
      }

      console.error("[main-menu] changesFor:", changesFor._tag);

      const draft = new TestPlanDraft({
        changesFor,
        currentBranch: gitState.currentBranch ?? "",
        diffPreview: "",
        fileStats: [],
        instruction: trimmed,
        baseUrl: Option.none(),
        isHeadless: false,
        requiresCookies: false,
      });

      console.error("[main-menu] draft created, navigating to planning");
      usePreferencesStore.getState().rememberInstruction(trimmed);
      usePlanStore.getState().setPlan(Plan.draft(draft));
      setScreen(Screen.Planning({ instruction: trimmed }));
    },
    [value, activeContext, gitState, setScreen],
  );

  const valueRef = useRef(value);
  valueRef.current = value;

  const handleInputChange = useMemo(
    () =>
      picker.createInputChangeHandler(valueRef, (stripped) => {
        setValue(stripped);
        if (errorMessage) setErrorMessage(undefined);
      }),
    [picker, errorMessage],
  );

  const showSuggestion = value === "" && !picker.pickerOpen && suggestions.length > 0;
  const showCycleHint = showSuggestion && !hasCycled;
  const currentSuggestion = suggestions[suggestionIndex % suggestions.length];

  useInput(
    (input, key) => {
      if (picker.pickerOpen) return;

      if (key.tab && !key.shift && showSuggestion && currentSuggestion) {
        setValue(currentSuggestion);
        setInputKey((previous) => previous + 1);
        return;
      }
      if (key.tab && key.shift) {
        toggleSkipPlanning();
        return;
      }
      if (!showSuggestion) return;
      if (key.rightArrow) {
        setSuggestionIndex((previous) => (previous + 1) % suggestions.length);
        setHasCycled(true);
        return;
      }
      if (key.leftArrow) {
        setSuggestionIndex((previous) => (previous - 1 + suggestions.length) % suggestions.length);
        setHasCycled(true);
        return;
      }
    },
    { isActive: true },
  );

  return (
    <Box flexDirection="column" width="100%" paddingY={1}>
      <DotField rows={3} dimColor="#1a1a1a" brightColor={COLORS.BORDER} />
      <Box marginBottom={1} paddingX={1}>
        <Text color={COLORS.BORDER}>
          <Text bold color={COLORS.TEXT}>
            {"Difficult"}
          </Text>
          <Text color={COLORS.DIM}>{" v0.0.1"}</Text> {"─".repeat(Math.max(0, columns - 18))}
        </Text>
      </Box>

      <Box flexDirection="column" width="100%">
        <Box justifyContent="space-between" paddingX={1}>
          <Clickable
            fullWidth={false}
            onClick={() => {
              if (picker.pickerOpen) picker.closePicker();
              else picker.openPicker();
            }}
          >
            {activeContext ? (
              <Text color={COLORS.DIM}>
                Testing{" "}
                <Text color={COLORS.PRIMARY}>
                  @{getContextDisplayLabel(activeContext, gitState)}
                </Text>{" "}
                {getContextDescription(activeContext, gitState)}
              </Text>
            ) : (
              <Text color={COLORS.DIM}>
                <Text color={COLORS.PRIMARY}>@</Text> no context
              </Text>
            )}
          </Clickable>
        </Box>
        <Clickable>
          <RuledBox color={COLORS.PRIMARY} marginTop={1} paddingX={0}>
            <Box justifyContent="space-between">
              <Box>
                <Text color={COLORS.PRIMARY}>{"❯ "}</Text>
                <Input
                  key={inputKey}
                  focus={!picker.pickerOpen}
                  multiline
                  placeholder={currentSuggestion ? `${currentSuggestion}  [tab]` : ""}
                  value={value}
                  onSubmit={submit}
                  onDownArrowAtBottom={() => {}}
                  onChange={handleInputChange}
                />
              </Box>
              {showCycleHint ? (
                <Text color={COLORS.DIM}>{"←→ cycle test suggestions "}</Text>
              ) : null}
            </Box>
          </RuledBox>
        </Clickable>
        {picker.pickerOpen ? (
          <Box flexDirection="column">
            <Box marginBottom={0} paddingX={1}>
              <Text color={COLORS.DIM}>@ </Text>
              <Text color={COLORS.PRIMARY}>{picker.pickerQuery}</Text>
              <Text color={COLORS.DIM}>{picker.pickerQuery ? "" : "type to filter"}</Text>
            </Box>
            <ContextPicker
              options={picker.filteredOptions}
              selectedIndex={picker.pickerIndex}
              isLoading={picker.remoteLoading}
              query={picker.pickerQuery}
              gitState={gitState}
              onQueryChange={picker.setPickerQuery}
              onSelect={picker.handleContextSelect}
              onNavigate={picker.setPickerIndex}
              onDismiss={picker.closePicker}
            />
          </Box>
        ) : (
          <Box marginTop={1} paddingX={1}>
            <Text color={COLORS.DIM}>
              type <Text color={COLORS.PRIMARY}>@</Text> to set context (PRs, branches, commits)
            </Text>
          </Box>
        )}
      </Box>

      <ErrorMessage message={errorMessage} />
    </Box>
  );
};
