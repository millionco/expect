import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, useInput } from "ink";
import { useAppStore } from "../../store.js";
import { useColors } from "../theme-context.js";
import { Clickable } from "../ui/clickable.js";
import { Input } from "../ui/input.js";
import { ErrorMessage } from "../ui/error-message.js";
import { ContextPicker } from "../ui/context-picker.js";
import { stripMouseSequences } from "../../hooks/mouse-context.js";
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
  const gitState = useAppStore((state) => state.gitState);
  const toggleAutoRun = useAppStore((state) => state.toggleAutoRun);
  const submitFlowInstruction = useAppStore((state) => state.submitFlowInstruction);
  const selectAction = useAppStore((state) => state.selectAction);
  const storeSelectContext = useAppStore((state) => state.selectContext);
  const selectedContext = useAppStore((state) => state.selectedContext);
  const switchBranch = useAppStore((state) => state.switchBranch);
  const flowInstruction = useAppStore((state) => state.flowInstruction);

  const [value, setValue] = useState(flowInstruction);
  const [inputKey, setInputKey] = useState(0);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [focus, setFocus] = useState<FocusArea>("input");

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [pickerIndex, setPickerIndex] = useState(0);
  const [remoteOptions, setRemoteOptions] = useState<ContextOption[]>([]);
  const [remoteLoading, setRemoteLoading] = useState(false);

  const localOptions = useMemo(
    () => (gitState ? buildLocalContextOptions(gitState) : []),
    [gitState],
  );

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
  const staticSuggestions = useMemo(() => getFlowSuggestions(activeContext, gitState), [activeContext, gitState]);
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
      signal: abortController.signal,
    })
      .then((result) => {
        if (!abortController.signal.aborted) {
          setAiSuggestions(result);
          setSuggestionIndex(0);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!abortController.signal.aborted) {
          setIsGenerating(false);
        }
      });
  }, [activeContext, gitState, isGenerating]);

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
        useAppStore.setState({
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

  const handleInputChange = useCallback(
    (nextValue: string) => {
      const stripped = stripMouseSequences(nextValue);

      if (
        stripped.length > value.length &&
        stripped[stripped.length - 1] === "@" &&
        (value.length === 0 || stripped[stripped.length - 2] === " ")
      ) {
        setValue(stripped.slice(0, -1));
        openPicker();
        return;
      }

      if (pickerOpen) {
        const afterAt = stripped.length - value.length;
        if (afterAt < 0) {
          closePicker();
          setValue(stripped);
        } else {
          setPickerQuery((previous) => {
            const added = stripped.slice(value.length);
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
      if (errorMessage) setErrorMessage(null);
    },
    [value, pickerOpen, openPicker, closePicker, errorMessage],
  );

  const showSuggestion =
    focus === "input" && value === "" && !pickerOpen && suggestions.length > 0;
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
        toggleAutoRun();
        return;
      }
      if (!showSuggestion) return;
      if (key.rightArrow) {
        setSuggestionIndex((previous) => (previous + 1) % suggestions.length);
        return;
      }
      if (key.leftArrow) {
        setSuggestionIndex(
          (previous) => (previous - 1 + suggestions.length) % suggestions.length,
        );
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
    <Box flexDirection="column" width="100%" paddingX={1} paddingY={1}>
      <Box marginBottom={1}>
        <Text>{" "}</Text>
      </Box>

      <Box flexDirection="column">
        <Box justifyContent="space-between">
          <Clickable
            fullWidth={false}
            onClick={() => {
              if (pickerOpen) closePicker();
              else openPicker();
            }}
          >
            {activeContext ? (
              <Text color={COLORS.PRIMARY}>
                @{activeContext.type === "pr" ? `#${activeContext.prNumber}` : activeContext.label}{" "}
                <Text color={COLORS.DIM}>{activeContext.description}</Text>
              </Text>
            ) : (
              <Text color={COLORS.DIM}>
                <Text color={COLORS.PRIMARY}>@</Text> no context
              </Text>
            )}
          </Clickable>
          {showSuggestion && !pickerOpen ? (
            <Text color={COLORS.DIM}>
              {"←→ cycle suggestions "}[{(suggestionIndex % suggestions.length) + 1}/{suggestions.length}]
              {isGenerating ? " generating…" : ""}
            </Text>
          ) : null}
        </Box>
        <Clickable onClick={() => setFocus("input")}>
          <Box
            marginTop={1}
            width="100%"
            borderStyle="single"
            borderColor={focus === "input" ? COLORS.PRIMARY : COLORS.BORDER}
            paddingX={1}
          >
            <Text color={COLORS.PRIMARY}>{"❯ "}</Text>
            <Input
              key={inputKey}
              focus={focus === "input" && !pickerOpen}
              multiline
              placeholder={`${currentSuggestion ?? "Describe what to test..."}  [tab]`}
              value={value}
              onSubmit={submit}
              onDownArrowAtBottom={() => {}}
              onChange={handleInputChange}
            />
          </Box>
        </Clickable>
        {pickerOpen ? (
          <Box flexDirection="column">
            <Box marginBottom={0}>
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
          <Box marginTop={1}>
            <Text color={COLORS.DIM}>
              type <Text color={COLORS.PRIMARY}>@</Text> to set context
            </Text>
          </Box>
        )}
      </Box>

      <ErrorMessage message={errorMessage} />
    </Box>
  );
};
