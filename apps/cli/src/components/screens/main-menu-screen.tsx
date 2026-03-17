import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, useInput } from "ink";
import { useFlowSessionStore } from "../../stores/use-flow-session.js";
import { usePreferencesStore } from "../../stores/use-preferences.js";
import { useGitState } from "../../hooks/use-git-state.js";
import { useColors } from "../theme-context.js";
import { Clickable } from "../ui/clickable.js";
import { Input } from "../ui/input.js";
import { RuledBox } from "../ui/ruled-box.js";
import { ErrorMessage } from "../ui/error-message.js";
import { ContextPicker } from "../ui/context-picker.js";
import { stripMouseSequences } from "../../hooks/mouse-context.js";
import { useStdoutDimensions } from "../../hooks/use-stdout-dimensions.js";
import { DotField } from "../ui/dot-field.js";

import { generateFlowSuggestions } from "@browser-tester/supervisor";
import { getFlowSuggestions } from "../../utils/get-flow-suggestions.js";
import {
  buildLocalContextOptions,
  fetchRemoteContextOptions,
  filterContextOptions,
  type ContextOption,
} from "../../utils/context-options.js";
type FocusArea = "input";

export const MainMenu = () => {
  const COLORS = useColors();
  const [columns] = useStdoutDimensions();
  const { data: gitState } = useGitState();
  const toggleSkipPlanning = usePreferencesStore((state) => state.toggleSkipPlanning);
  const submitFlowInstruction = useFlowSessionStore((state) => state.submitFlowInstruction);
  const selectAction = useFlowSessionStore((state) => state.selectAction);
  const storeSelectContext = useFlowSessionStore((state) => state.selectContext);
  const selectedContext = useFlowSessionStore((state) => state.selectedContext);
  const switchBranch = useFlowSessionStore((state) => state.switchBranch);
  const flowInstruction = useFlowSessionStore((state) => state.flowInstruction);
  const planningProvider = usePreferencesStore((state) => state.planningProvider);

  const [value, setValue] = useState(flowInstruction);
  const [inputKey, setInputKey] = useState(0);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [hasCycled, setHasCycled] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [focus, setFocus] = useState<FocusArea>("input");

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [pickerIndex, setPickerIndex] = useState(0);
  const [remoteOptions, setRemoteOptions] = useState<ContextOption[]>([]);
  const [localOptions, setLocalOptions] = useState<ContextOption[]>([]);
  const [remoteLoading, setRemoteLoading] = useState(false);

  useEffect(() => {
    if (!gitState) return;
    let cancelled = false;
    buildLocalContextOptions(gitState)
      .then((options) => {
        if (!cancelled) setLocalOptions(options);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [gitState]);

  useEffect(() => {
    if (!pickerOpen || !gitState) return;
    let cancelled = false;
    setRemoteLoading(true);
    fetchRemoteContextOptions(gitState)
      .then((options) => {
        if (!cancelled) setRemoteOptions(options);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setRemoteLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pickerOpen, gitState]);

  const allOptions = useMemo(
    () => [...localOptions, ...remoteOptions],
    [localOptions, remoteOptions],
  );

  const filteredOptions = useMemo(
    () => filterContextOptions(allOptions, pickerQuery),
    [allOptions, pickerQuery],
  );

  useEffect(() => {
    setPickerIndex(0);
  }, [pickerQuery]);

  const defaultContext = useMemo(() => {
    if (!gitState) return null;
    return localOptions.find((option) => option.type === "changes") ?? null;
  }, [gitState, localOptions]);

  const activeContext = selectedContext ?? defaultContext;
  const staticSuggestions = useMemo(
    () => getFlowSuggestions(activeContext, gitState ?? null),
    [activeContext, gitState],
  );
  const [aiSuggestions, setAiSuggestions] = useState<readonly string[] | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const generationAbortRef = useRef<AbortController | null>(null);
  const suggestions = aiSuggestions ?? staticSuggestions;

  useEffect(() => {
    setSuggestionIndex(0);
    setAiSuggestions(null);
    setIsGenerating(false);
    generationAbortRef.current?.abort();
    generationAbortRef.current = null;
  }, [activeContext, gitState]);

  const requestSuggestions = useCallback(() => {
    if (!gitState || isGenerating) return;

    generationAbortRef.current?.abort();
    const abortController = new AbortController();
    generationAbortRef.current = abortController;
    setIsGenerating(true);

    generateFlowSuggestions({
      changedFiles: gitState.changedFiles,
      currentBranch: gitState.currentBranch,
      contextType: activeContext?.type ?? null,
      contextLabel: activeContext?.label ?? null,
      provider: planningProvider,
      signal: abortController.signal,
    })
      .then((result) => {
        if (!abortController.signal.aborted) {
          setAiSuggestions(result.length > 0 ? result : null);
          if (result.length > 0) {
            setSuggestionIndex(0);
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!abortController.signal.aborted) {
          setIsGenerating(false);
        }
      });
  }, [activeContext, gitState, isGenerating, planningProvider]);

  const openPicker = useCallback(() => {
    setPickerOpen(true);
    setPickerQuery("");
    setPickerIndex(0);
  }, []);

  const closePicker = useCallback(() => {
    setPickerOpen(false);
    setPickerQuery("");
  }, []);

  const handleContextSelect = useCallback(
    (option: ContextOption) => {
      storeSelectContext(option);
      closePicker();
    },
    [storeSelectContext, closePicker],
  );

  const submit = useCallback(
    (submittedValue?: string) => {
      const trimmed = (submittedValue ?? value).trim();
      if (!trimmed) {
        setErrorMessage("Describe what you want the browser agent to test.");
        return;
      }

      const context = activeContext;

      if (context?.branchName && context.type !== "changes") {
        switchBranch(context.branchName, context.prNumber ?? null);
      }

      if (context?.action === "select-commit") {
        selectAction("select-commit");
        useFlowSessionStore.setState({
          selectedCommit: context.commitHash
            ? {
                hash: context.commitHash,
                shortHash: context.commitShortHash ?? "",
                subject: context.commitSubject ?? "",
              }
            : null,
        });
      } else {
        selectAction(context?.action ?? "test-changes");
      }

      submitFlowInstruction(trimmed);
    },
    [value, activeContext, switchBranch, selectAction, submitFlowInstruction],
  );

  const valueRef = useRef(value);
  valueRef.current = value;
  const pickerOpenRef = useRef(pickerOpen);
  pickerOpenRef.current = pickerOpen;
  const errorMessageRef = useRef(errorMessage);
  errorMessageRef.current = errorMessage;

  const handleInputChange = useCallback(
    (nextValue: string) => {
      const stripped = stripMouseSequences(nextValue);
      const previousValue = valueRef.current;

      if (
        stripped.length > previousValue.length &&
        stripped[stripped.length - 1] === "@" &&
        (previousValue.length === 0 || stripped[stripped.length - 2] === " ")
      ) {
        setValue(stripped.slice(0, -1));
        openPicker();
        return;
      }

      if (pickerOpenRef.current) {
        const afterAt = stripped.length - previousValue.length;
        if (afterAt < 0) {
          closePicker();
          setValue(stripped);
        } else {
          setPickerQuery((previous) => {
            const added = stripped.slice(previousValue.length);
            if (added.includes(" ")) {
              closePicker();
              setValue(stripped);
              return "";
            }
            return previous + added;
          });
        }
        return;
      }

      setValue(stripped);
      if (errorMessageRef.current) setErrorMessage(null);
    },
    [openPicker, closePicker],
  );

  const showSuggestion = focus === "input" && value === "" && !pickerOpen && suggestions.length > 0;
  const showCycleHint = showSuggestion && !hasCycled;
  const currentSuggestion = suggestions[suggestionIndex % suggestions.length];

  useInput(
    (input, key) => {
      if (pickerOpen) return;

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
      if (input === "g") {
        requestSuggestions();
        return;
      }
    },
    { isActive: focus === "input" },
  );

  if (!gitState) return null;

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
              if (pickerOpen) closePicker();
              else openPicker();
            }}
          >
            {activeContext ? (
              <Text color={COLORS.DIM}>
                Testing{" "}
                <Text color={COLORS.PRIMARY}>
                  @
                  {activeContext.type === "pr" ? `#${activeContext.prNumber}` : activeContext.label}
                </Text>{" "}
                {activeContext.description}
              </Text>
            ) : (
              <Text color={COLORS.DIM}>
                <Text color={COLORS.PRIMARY}>@</Text> no context
              </Text>
            )}
          </Clickable>
        </Box>
        <Clickable onClick={() => setFocus("input")}>
          <RuledBox
            color={focus === "input" ? COLORS.PRIMARY : COLORS.BORDER}
            marginTop={1}
            paddingX={0}
          >
            <Box justifyContent="space-between">
              <Box>
                <Text color={COLORS.PRIMARY}>{"❯ "}</Text>
                <Input
                  key={inputKey}
                  focus={focus === "input" && !pickerOpen}
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
        {pickerOpen ? (
          <Box flexDirection="column">
            <Box marginBottom={0} paddingX={1}>
              <Text color={COLORS.DIM}>@ </Text>
              <Text color={COLORS.PRIMARY}>{pickerQuery}</Text>
              <Text color={COLORS.DIM}>{pickerQuery ? "" : "type to filter"}</Text>
            </Box>
            <ContextPicker
              options={filteredOptions}
              selectedIndex={pickerIndex}
              isLoading={remoteLoading}
              query={pickerQuery}
              onQueryChange={setPickerQuery}
              onSelect={handleContextSelect}
              onNavigate={setPickerIndex}
              onDismiss={closePicker}
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
