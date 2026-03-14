import { useState } from "react";
import { Box, useInput } from "ink";
import { Input } from "./ui/input.js";
import { useColors } from "./theme-context.js";
import { stripMouseSequences } from "../hooks/mouse-context.js";
import type { TestAction } from "../utils/browser-agent.js";
import { useAppStore } from "../store.js";
import { ScreenHeading } from "./ui/screen-heading.js";
import { ErrorMessage } from "./ui/error-message.js";

const ACTION_LABELS: Record<TestAction, string> = {
  "test-unstaged": "Test unstaged changes",
  "test-branch": "Test entire branch",
  "select-commit": "Select a commit to test",
};

export const FlowInputScreen = () => {
  const COLORS = useColors();
  const testAction = useAppStore((state) => state.testAction);
  const flowInstruction = useAppStore((state) => state.flowInstruction);
  const submitFlowInstruction = useAppStore((state) => state.submitFlowInstruction);
  const [value, setValue] = useState(flowInstruction);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useInput((_input, key) => {
    if (!key.return || key.shift) return;
    if (!value.trim()) {
      setErrorMessage("Describe the user flow you want the browser agent to test.");
      return;
    }

    submitFlowInstruction(value.trim());
  });

  if (!testAction) return null;

  return (
    <Box flexDirection="column" width="100%" paddingX={1} paddingY={1}>
      <ScreenHeading
        title="Describe the browser flow to test"
        subtitle={ACTION_LABELS[testAction]}
      />

      <Box marginTop={1} borderStyle="round" borderColor={COLORS.BORDER} paddingX={2}>
        <Input
          focus
          multiline
          placeholder="Go through onboarding at /onboarding, click Import Projects, and verify the imported project list appears."
          value={value}
          onChange={(nextValue) => {
            setValue(stripMouseSequences(nextValue));
            if (errorMessage) setErrorMessage(null);
          }}
        />
      </Box>

      <ErrorMessage message={errorMessage} />
    </Box>
  );
};
