import { useEffect, useState } from "react";
import { Text } from "ink";
import { COLORS, SPINNER_INTERVAL_MS } from "./constants.js";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

interface SpinnerProps {
  message: string;
}

export const Spinner = ({ message }: SpinnerProps) => {
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setFrameIndex((previous) => (previous + 1) % SPINNER_FRAMES.length);
    }, SPINNER_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  return (
    <Text color={COLORS.DIM}>
      <Text color={COLORS.SELECTION}>{SPINNER_FRAMES[frameIndex]}</Text>
      <Text> {message}</Text>
    </Text>
  );
};
