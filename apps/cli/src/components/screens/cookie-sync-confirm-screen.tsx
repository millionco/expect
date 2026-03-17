import { useState } from "react";
import { Box, Text, useInput } from "ink";
import figures from "figures";
import { useColors } from "../theme-context.js";
import { Clickable } from "../ui/clickable.js";
import { RuledBox } from "../ui/ruled-box.js";
import { ScreenHeading } from "../ui/screen-heading.js";
import { useFlowSessionStore } from "../../stores/use-flow-session.js";

interface ConfirmOption {
  id: "enable-sync" | "run-without-sync";
  label: string;
  detail: string;
}

const CONFIRM_OPTIONS: ConfirmOption[] = [
  {
    id: "enable-sync",
    label: "Enable cookie sync and start testing",
    detail: "Recommended for authenticated flows and much more reliable results.",
  },
  {
    id: "run-without-sync",
    label: "Run anyway without cookie sync",
    detail: "More likely to fail because the browser will not inherit your signed-in session.",
  },
];

export const CookieSyncConfirmScreen = () => {
  const COLORS = useColors();
  const plan = useFlowSessionStore((state) => state.generatedPlan);
  const environment = useFlowSessionStore((state) => state.browserEnvironment);
  const updateEnvironment = useFlowSessionStore((state) => state.updateEnvironment);
  const approvePlan = useFlowSessionStore((state) => state.approvePlan);
  const [selectedIndex, setSelectedIndex] = useState(0);

  if (!plan) return null;

  const activateOption = (option: ConfirmOption) => {
    if (option.id === "enable-sync") {
      updateEnvironment({
        ...(environment ?? {}),
        cookies: true,
      });
    }

    approvePlan();
  };

  useInput((input, key) => {
    if (key.downArrow || input === "j" || (key.ctrl && input === "n")) {
      setSelectedIndex((previous) => Math.min(CONFIRM_OPTIONS.length - 1, previous + 1));
    }

    if (key.upArrow || input === "k" || (key.ctrl && input === "p")) {
      setSelectedIndex((previous) => Math.max(0, previous - 1));
    }

    if (input === "c") {
      activateOption(CONFIRM_OPTIONS[0]);
    }

    if (input === "a") {
      activateOption(CONFIRM_OPTIONS[1]);
    }

    if (key.return) {
      activateOption(CONFIRM_OPTIONS[selectedIndex]);
    }
  });

  return (
    <Box flexDirection="column" width="100%" paddingY={1}>
      <Box paddingX={1}>
        <ScreenHeading title="Cookie sync is off" subtitle={plan.title} />
      </Box>

      <RuledBox color={COLORS.RED} marginTop={1}>
        <Text color={COLORS.RED} bold>
          This plan depends on cookie sync.
        </Text>
        <Text color={COLORS.DIM}>
          Reason: <Text color={COLORS.TEXT}>{plan.cookieSync.reason}</Text>
        </Text>
        <Text color={COLORS.DIM}>
          Running without synced cookies will make browser testing less reliable and more likely to
          fail.
        </Text>
        <Text color={COLORS.DIM}>
          If this flow needs an authenticated session, the browser may start in the wrong state.
        </Text>
      </RuledBox>

      <Box flexDirection="column" marginTop={1} paddingX={1}>
        {CONFIRM_OPTIONS.map((option, index) => {
          const isSelected = index === selectedIndex;
          return (
            <Clickable
              key={option.id}
              onClick={() => {
                setSelectedIndex(index);
                activateOption(option);
              }}
            >
              <Box flexDirection="column" marginBottom={1}>
                <Text>
                  <Text color={isSelected ? COLORS.PRIMARY : COLORS.DIM}>
                    {isSelected ? `${figures.pointer} ` : "  "}
                  </Text>
                  <Text color={isSelected ? COLORS.PRIMARY : COLORS.TEXT} bold={isSelected}>
                    {option.label}
                  </Text>
                </Text>
                <Text color={COLORS.DIM}> {option.detail}</Text>
              </Box>
            </Clickable>
          );
        })}
      </Box>

      <Box marginTop={1} paddingX={1}>
        <Text color={COLORS.DIM}>
          Press <Text color={COLORS.PRIMARY}>c</Text> to enable cookie sync,{" "}
          <Text color={COLORS.PRIMARY}>a</Text> to approve anyway, or{" "}
          <Text color={COLORS.PRIMARY}>Esc</Text> to go back.
        </Text>
      </Box>
    </Box>
  );
};
