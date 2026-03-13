import { useEffect, useState } from "react";
import { Box, Text } from "ink";
import { COLORS } from "./constants.js";

const RESOLVE_MS = 15;
const SHIMMER_INTERVAL_MS = 25;
const THINKING_CHARS = ["◇", "◆", "◇", "◆"];

type Result = "pass" | "fail" | "skip";
type Cell = Result | null;
type SlotState = "idle" | "thinking" | "resolved";

const GRID_COLUMNS = 4;
const GRID: Cell[] = ["pass", null, "fail", "pass", "skip", "pass", null, "fail"];

const THINK_DURATION_MS: Record<Result, number> = {
  pass: 60,
  fail: 130,
  skip: 35,
};

const RESULT_ICON: Record<Result, string> = {
  pass: "✓",
  fail: "✗",
  skip: "–",
};

const RESULT_COLOR: Record<Result, string> = {
  pass: COLORS.GREEN,
  fail: COLORS.RED,
  skip: COLORS.YELLOW,
};

const findNextResultIndex = (from: number): number => {
  for (let index = from; index < GRID.length; index++) {
    if (GRID[index] !== null) return index;
  }
  return GRID.length;
};

export const ColoredLogo = () => {
  const [activeIndex, setActiveIndex] = useState(() => findNextResultIndex(0));
  const [slotState, setSlotState] = useState<SlotState>("thinking");
  const [shimmerFrame, setShimmerFrame] = useState(0);

  useEffect(() => {
    if (activeIndex >= GRID.length) return;
    if (slotState !== "thinking") return;

    const timer = setInterval(() => {
      setShimmerFrame((previous) => (previous + 1) % THINKING_CHARS.length);
    }, SHIMMER_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [activeIndex, slotState]);

  useEffect(() => {
    if (activeIndex >= GRID.length) return;
    const cell = GRID[activeIndex];
    if (cell === null) return;

    if (slotState === "thinking") {
      const base = THINK_DURATION_MS[cell];
      const jitter = base * 0.4 * (Math.random() - 0.5);
      const timer = setTimeout(() => setSlotState("resolved"), base + jitter);
      return () => clearTimeout(timer);
    }

    if (slotState === "resolved") {
      const timer = setTimeout(() => {
        setActiveIndex(findNextResultIndex(activeIndex + 1));
        setSlotState("thinking");
        setShimmerFrame(0);
      }, RESOLVE_MS);
      return () => clearTimeout(timer);
    }
  }, [activeIndex, slotState]);

  const rows = Array.from({ length: Math.ceil(GRID.length / GRID_COLUMNS) }, (_, rowIndex) =>
    GRID.slice(rowIndex * GRID_COLUMNS, (rowIndex + 1) * GRID_COLUMNS),
  );

  return (
    <Box flexDirection="column">
      {rows.map((row, rowIndex) => (
        <Box key={rowIndex} flexDirection="row" gap={1}>
          {row.map((cell, colIndex) => {
            const index = rowIndex * GRID_COLUMNS + colIndex;

            if (cell === null) {
              return (
                <Text key={index} color={COLORS.DIM}>
                  ·
                </Text>
              );
            }

            const done = activeIndex >= GRID.length;

            if (done || index < activeIndex) {
              return (
                <Text key={index} color={RESULT_COLOR[cell]}>
                  {RESULT_ICON[cell]}
                </Text>
              );
            }

            if (index === activeIndex && slotState === "thinking") {
              return (
                <Text key={index} color={RESULT_COLOR[cell]}>
                  {THINKING_CHARS[shimmerFrame]}
                </Text>
              );
            }

            return (
              <Text key={index} color={COLORS.DIM}>
                ·
              </Text>
            );
          })}
        </Box>
      ))}
    </Box>
  );
};
