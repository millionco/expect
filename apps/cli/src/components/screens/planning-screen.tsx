import { useEffect, useState } from "react";
import { Box, Text } from "ink";
import figures from "figures";
import { Spinner } from "../ui/spinner.js";
import { useColors } from "../theme-context.js";
import { RuledBox } from "../ui/ruled-box.js";
import { DotField } from "../ui/dot-field.js";
import { useAppStore } from "../../store.js";
import { useStdoutDimensions } from "../../hooks/use-stdout-dimensions.js";
import { formatElapsedTime } from "../../utils/format-elapsed-time.js";
import { TESTING_TIMER_UPDATE_INTERVAL_MS } from "../../constants.js";

const PLANNING_STAGES = [
  { after: 0, label: "Analyzing changes" },
  { after: 1500, label: "Reading diff" },
  { after: 3500, label: "Identifying test surfaces" },
  { after: 6000, label: "Mapping component boundaries" },
  { after: 9000, label: "Building browser steps" },
  { after: 13000, label: "Sequencing navigation flow" },
  { after: 18000, label: "Defining expected outcomes" },
  { after: 24000, label: "Checking assertions" },
  { after: 31000, label: "Validating plan" },
  { after: 40000, label: "Finalizing" },
] as const;

const STAGE_LABEL_WIDTH = Math.max(...PLANNING_STAGES.map((stage) => stage.label.length));

const THINKING_FRAGMENTS: Record<number, readonly string[]> = {
  0: [
    "scanning modified files for testable surfaces...",
    "checking diff for UI component changes...",
    "evaluating changeset scope and risk profile...",
  ],
  1: [
    "parsing added and removed lines...",
    "identifying affected rendering paths...",
    "correlating file changes with route handlers...",
  ],
  2: [
    "mapping user-facing interactions...",
    "checking form inputs, buttons, and navigation targets...",
    "evaluating conditional rendering branches...",
  ],
  3: [
    "tracing component dependency graph...",
    "resolving shared state between changed modules...",
    "identifying integration boundaries...",
  ],
  4: [
    "constructing navigation sequence...",
    "ordering steps by dependency chain...",
    "defining browser actions for each test surface...",
  ],
  5: [
    "planning viewport interactions...",
    "sequencing click, type, and wait actions...",
    "adding assertion checkpoints between steps...",
  ],
  6: [
    "deriving expected DOM state after each action...",
    "mapping visual assertions to component output...",
    "checking for error state edge cases...",
  ],
  7: [
    "validating assertion coverage...",
    "cross-referencing steps with changed lines...",
    "confirming expected outcomes are observable...",
  ],
  8: [
    "verifying step ordering is deterministic...",
    "checking for redundant or overlapping assertions...",
    "ensuring plan covers critical paths...",
  ],
  9: [
    "assembling final plan structure...",
    "writing step metadata and risk annotations...",
  ],
};

const TOKEN_SPEED_MS = 30;
const FRAGMENT_PAUSE_MS = 800;

const TIPS = [
  "Use @ in the input to target a specific PR, branch, or commit",
  "Press shift+tab to toggle auto-run after planning",
  "You can edit step instructions during plan review with e",
  "Save plans with s to reuse them later with ctrl+r",
  "Use tab to accept a suggested test prompt",
  "Arrow keys cycle through test suggestions on the home screen",
  "Plans adapt to your diff — smaller changes mean faster plans",
  "You can switch context to a different branch during plan review",
  "Cookie sync lets the browser inherit your authenticated sessions",
  "Press ctrl+p to quickly switch to a different PR",
] as const;

const getStageLabel = (elapsed: number): (typeof PLANNING_STAGES)[number]["label"] => {
  let label: (typeof PLANNING_STAGES)[number]["label"] = PLANNING_STAGES[0].label;
  for (const stage of PLANNING_STAGES) {
    if (elapsed >= stage.after) label = stage.label;
  }
  return label;
};

const getStageIndex = (elapsed: number): number => {
  let index = 0;
  for (let stageIndex = 0; stageIndex < PLANNING_STAGES.length; stageIndex++) {
    if (elapsed >= PLANNING_STAGES[stageIndex].after) index = stageIndex;
  }
  return index;
};

const FINAL_STAGE_DURATION_MS = 15000;
const PROGRESS_TICK_MS = 100;
const CYCLE_DURATION_MS = PLANNING_STAGES[PLANNING_STAGES.length - 1].after + FINAL_STAGE_DURATION_MS;

const getSmoothProgress = (elapsed: number): number => {
  const looped = elapsed % CYCLE_DURATION_MS;
  const stageIndex = getStageIndex(looped);
  const currentAfter = PLANNING_STAGES[stageIndex].after;
  const nextAfter =
    stageIndex < PLANNING_STAGES.length - 1
      ? PLANNING_STAGES[stageIndex + 1].after
      : currentAfter + FINAL_STAGE_DURATION_MS;
  const stageProgress = Math.min(1, (looped - currentAfter) / (nextAfter - currentAfter));
  return (stageIndex + stageProgress) / PLANNING_STAGES.length;
};

export const PlanningScreen = () => {
  const COLORS = useColors();
  const [columns] = useStdoutDimensions();
  const flowInstruction = useAppStore((state) => state.flowInstruction);
  const [startTime] = useState(() => Date.now());
  const [elapsed, setElapsed] = useState(0);
  const [tipIndex] = useState(() => Math.floor(Math.random() * TIPS.length));

  const [progressElapsed, setProgressElapsed] = useState(0);
  const [completedLines, setCompletedLines] = useState<string[]>([]);
  const [currentLine, setCurrentLine] = useState("");
  const [thinkingKey, setThinkingKey] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Date.now() - startTime);
    }, TESTING_TIMER_UPDATE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [startTime]);

  useEffect(() => {
    const interval = setInterval(() => {
      setProgressElapsed(Date.now() - startTime);
    }, PROGRESS_TICK_MS);
    return () => clearInterval(interval);
  }, [startTime]);

  useEffect(() => {
    let cancelled = false;
    const stageIndex = getStageIndex(Date.now() - startTime);
    const fragments = THINKING_FRAGMENTS[stageIndex] ?? THINKING_FRAGMENTS[9];
    const fragment = fragments[thinkingKey % fragments.length];
    let charIndex = 0;
    setCurrentLine("");

    const typeNextChar = () => {
      if (cancelled) return;
      if (charIndex <= fragment.length) {
        setCurrentLine(fragment.slice(0, charIndex));
        charIndex++;
        setTimeout(typeNextChar, TOKEN_SPEED_MS);
      } else {
        setTimeout(() => {
          if (!cancelled) {
            setCompletedLines((previous) => [...previous, fragment]);
            setThinkingKey((previous) => previous + 1);
          }
        }, FRAGMENT_PAUSE_MS);
      }
    };
    typeNextChar();

    return () => {
      cancelled = true;
    };
  }, [thinkingKey, startTime]);

  const stageLabel = getStageLabel(elapsed);
  const smoothProgress = getSmoothProgress(progressElapsed);

  return (
    <Box flexDirection="column" width="100%" paddingY={1}>
      <DotField rows={3} dimColor="#1a1a1a" brightColor={COLORS.BORDER} />

      <RuledBox color={COLORS.BORDER}>
        <Text color={COLORS.DIM}>{flowInstruction}</Text>
      </RuledBox>

      <Box marginTop={1} paddingX={1} justifyContent="space-between">
        <Box>
          <Spinner />
          <Text color={COLORS.DIM}>
            {` ${stageLabel.padEnd(STAGE_LABEL_WIDTH)}${figures.ellipsis} `}
            <Text color={COLORS.BORDER}>{formatElapsedTime(elapsed)}</Text>
          </Text>
        </Box>
        <Text color={COLORS.BORDER}>
          {"TIP "}<Text color={COLORS.DIM}>{TIPS[tipIndex]}</Text>
        </Text>
      </Box>

      <Box paddingX={1} marginTop={1}>
        <Text>
          {(() => {
            const barWidth = columns - 2;
            const filled = Math.round(smoothProgress * barWidth);
            return Array.from({ length: barWidth }, (_, index) => (
              <Text key={index} color={index < filled ? COLORS.DIM : COLORS.BORDER}>
                {index < filled ? "█" : "░"}
              </Text>
            ));
          })()}
        </Text>
      </Box>

      <Box paddingX={1} marginTop={1} flexDirection="column">
        {completedLines.map((line, index) => (
          <Text key={index} color={COLORS.BORDER}>
            {"│ "}<Text color={COLORS.DIM}>{line}</Text>
          </Text>
        ))}
        <Text color={COLORS.BORDER}>
          {"│ "}<Text color={COLORS.DIM}>{currentLine}<Text color={COLORS.BORDER}>▌</Text></Text>
        </Text>
      </Box>
    </Box>
  );
};
