import { useEffect, useState } from "react";
import { Text } from "ink";
import { lerpColor } from "../../utils/lerp-color.js";
import { SHIMMER_TICK_MS, SHIMMER_GRADIENT_WIDTH } from "../../constants.js";

interface TextShimmerProps {
  text: string;
  baseColor: string;
  highlightColor: string;
  speed?: number;
}

export const TextShimmer = ({ text, baseColor, highlightColor, speed = 1 }: TextShimmerProps) => {
  const [position, setPosition] = useState(-SHIMMER_GRADIENT_WIDTH);

  useEffect(() => {
    const upperBound = text.length + SHIMMER_GRADIENT_WIDTH;
    const interval = setInterval(() => {
      setPosition((previous) =>
        previous >= upperBound ? -SHIMMER_GRADIENT_WIDTH : previous + speed,
      );
    }, SHIMMER_TICK_MS);
    return () => clearInterval(interval);
  }, [text.length, speed]);

  return (
    <Text>
      {[...text].map((character, index) => {
        const distance = Math.abs(index - position);
        const intensity = Math.max(0, 1 - distance / SHIMMER_GRADIENT_WIDTH);
        const color = intensity > 0 ? lerpColor(baseColor, highlightColor, intensity) : baseColor;
        return (
          <Text key={index} color={color}>
            {character}
          </Text>
        );
      })}
    </Text>
  );
};
