import { useState } from "react";
import { Box, Text, useInput } from "ink";
import figures from "figures";
import type { ChangesFor, SavedFlow } from "@expect/shared/models";
import { trackEvent } from "../../utils/session-analytics";
import { useColors } from "../theme-context";
import { Clickable } from "../ui/clickable";
import { Logo } from "../ui/logo";
import {
  type ExecutionMode,
  useNavigationStore,
  screenForTestingOrPortPicker,
  screenForWatchOrPortPicker,
} from "../../stores/use-navigation";

interface ConfirmOption {
  id: "enable-sync" | "run-without-sync";
  label: string;
  detail: string;
}

const CONFIRM_OPTIONS: ConfirmOption[] = [
  {
    id: "enable-sync",
    label: "Use existing cookies",
    detail: "Recommended. Uses your browser session as-is.",
  },
  {
    id: "run-without-sync",
    label: "Skip cookies",
    detail: "Not recommended. Tests requiring login will fail.",
  },
];

interface CookieSyncConfirmScreenProps {
  changesFor: ChangesFor;
  instruction: string;
  savedFlow?: SavedFlow;
  mode?: ExecutionMode;
}

export const CookieSyncConfirmScreen = ({
  changesFor,
  instruction,
  savedFlow,
  mode = "run",
}: CookieSyncConfirmScreenProps) => {
  const COLORS = useColors();
  const setScreen = useNavigationStore((state) => state.setScreen);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const activateOption = (option: ConfirmOption) => {
    const requiresCookies = option.id === "enable-sync";
    trackEvent("cookies:sync_choice", {
      choice: requiresCookies ? "use_cookies" : "skip_cookies",
    });
    setScreen(
      (mode === "watch" ? screenForWatchOrPortPicker : screenForTestingOrPortPicker)({
        changesFor,
        instruction,
        savedFlow,
        requiresCookies,
      }),
    );
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
        {selectedIndex === 0 ? (
          <Text color={COLORS.GREEN}>
            {figures.tick} Your signed-in session will be synced to the browser. Cookies stay on
            device.
          </Text>
        ) : (
          <Text color={COLORS.YELLOW}>
            {figures.warning} The browser won{"'"}t inherit your signed-in session without cookies.
          </Text>
        )}
      </Box>

      <Box flexDirection="column" marginTop={1}>
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
    </Box>
  );
};
