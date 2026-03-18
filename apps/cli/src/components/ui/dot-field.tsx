import { useEffect, useState } from "react";
import { Box, Text } from "ink";
import { lerpColor } from "../../utils/lerp-color";
import { useStdoutDimensions } from "../../hooks/use-stdout-dimensions";

const DOT = "·";
const TICK_MS = 60;
const DOT_SPACING_X = 2;

interface DotFieldProps {
  rows: number;
  dimColor: string;
  brightColor: string;
}

export const DotField = ({ rows, dimColor, brightColor }: DotFieldProps) => {
  const [columns] = useStdoutDimensions();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setTick((previous) => previous + 1);
    }, TICK_MS);
    return () => clearInterval(interval);
  }, []);

  const dotsPerRow = Math.floor(columns / DOT_SPACING_X);

  return (
    <Box flexDirection="column">
      {Array.from({ length: rows }, (_, rowIndex) => (
        <Text key={rowIndex}>
          {Array.from({ length: dotsPerRow }, (_, colIndex) => {
            const phase =
              Math.sin(rowIndex * 0.9 + colIndex * 0.3) * 2.5 +
              Math.cos(colIndex * 0.2 - rowIndex * 0.7) * 2.0 +
              Math.sin((rowIndex + colIndex) * 0.15) * 1.5;

            const wave = Math.sin(tick * 0.08 + phase);
            const intensity = Math.pow(wave * 0.5 + 0.5, 2);
            const color = lerpColor(dimColor, brightColor, intensity);

            return (
              <Text key={colIndex} color={color}>
                {DOT + " ".repeat(DOT_SPACING_X - 1)}
              </Text>
            );
          })}
        </Text>
      ))}
    </Box>
  );
};
