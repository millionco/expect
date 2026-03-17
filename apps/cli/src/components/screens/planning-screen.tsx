import { useEffect, useState } from "react";
import { Box, Text } from "ink";
import figures from "figures";
import { Spinner } from "../ui/spinner.js";
import { useColors } from "../theme-context.js";
import { RuledBox } from "../ui/ruled-box.js";
import { DotField } from "../ui/dot-field.js";
import { useFlowSessionStore } from "../../stores/use-flow-session.js";
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

const THINKING_LINES = [
  "looking at the changed files",
  "3 files modified — plan-review-screen.tsx, planning-screen.tsx, modeline.tsx",
  "the main surface area is the plan review component",
  "checking what the diff actually changes...",
  "ok so the rendering logic was refactored significantly",
  "collapsibles replaced with a vertical rail pattern",
  "need to verify the rail items render correctly",
  "also the navigation model changed — steps are now direct items",
  "the modeline got new keybinds for the planning screen",
  "should test that the agent label shows up",
  "thinking about the right step sequence",
  "step 1: open the app and verify initial render",
  "step 2: submit a test prompt and enter planning",
  "step 3: verify the planning screen shows progress",
  "step 4: review the generated plan",
  "need to check that step selection works with arrow keys",
  "step 5: expand a step and verify action/expected display",
  "step 6: test the edit flow on a step instruction",
  "checking if cookie sync UI needs coverage...",
  "the cookie sync toggle is on the plan review rail",
  "step 7: approve the plan and verify transition",
  "considering edge cases — empty plan, long text wrapping",
  "mapping expected outcomes for each step",
  "verifying assertions are observable in the DOM",
  "cross-referencing coverage with the actual diff",
  "looks good — finalizing the plan structure",
  "writing step metadata",
];

const BASE_TOKEN_MS = 22;
const TOKEN_JITTER_MS = 35;
const BASE_PAUSE_MS = 400;
const PAUSE_JITTER_MS = 1200;

const TIPS = [
  "Use @ in the input to target a specific PR, branch, or commit",
  "Press shift+tab on the home screen to toggle skipping planning",
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
const CYCLE_DURATION_MS =
  PLANNING_STAGES[PLANNING_STAGES.length - 1].after + FINAL_STAGE_DURATION_MS;

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
  const flowInstruction = useFlowSessionStore((state) => state.flowInstruction);
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
    const line = THINKING_LINES[thinkingKey % THINKING_LINES.length];
    let charIndex = 0;
    setCurrentLine("");

    const typeNextChar = () => {
      if (cancelled) return;
      if (charIndex <= line.length) {
        setCurrentLine(line.slice(0, charIndex));
        charIndex++;
        const jitter = Math.random() * TOKEN_JITTER_MS;
        const charDelay =
          line[charIndex - 1] === " " ? BASE_TOKEN_MS + jitter * 2 : BASE_TOKEN_MS + jitter;
        setTimeout(typeNextChar, charDelay);
      } else {
        const pause = BASE_PAUSE_MS + Math.random() * PAUSE_JITTER_MS;
        setTimeout(() => {
          if (!cancelled) {
            setCompletedLines((previous) => [...previous, line]);
            setThinkingKey((previous) => previous + 1);
          }
        }, pause);
      }
    };
    typeNextChar();

    return () => {
      cancelled = true;
    };
  }, [thinkingKey]);

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
          {"TIP "}
          <Text color={COLORS.DIM}>{TIPS[tipIndex]}</Text>
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
            {"│ "}
            <Text color={COLORS.DIM}>{line}</Text>
          </Text>
        ))}
        <Text color={COLORS.BORDER}>
          {"│ "}
          <Text color={COLORS.DIM}>
            {currentLine}
            <Text color={COLORS.BORDER}>▌</Text>
          </Text>
        </Text>
      </Box>
    </Box>
  );
};
