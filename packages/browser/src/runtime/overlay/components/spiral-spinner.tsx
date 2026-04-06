// eslint-disable-next-line no-restricted-imports
import { useState, useEffect } from "react";

const LINE_COUNT = 8;
const TICK_MS = 100;
const SIZE_PX = 16;
const LINE_WIDTH = 1.5;
const LINE_LENGTH = 3;
const INNER_RADIUS = 3.5;

const CENTER = SIZE_PX / 2;

interface LineGeometry {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const LINE_POSITIONS: LineGeometry[] = Array.from({ length: LINE_COUNT }, (_, index) => {
  const angle = (index * 360) / LINE_COUNT - 90;
  const rad = (angle * Math.PI) / 180;
  return {
    x1: CENTER + Math.cos(rad) * INNER_RADIUS,
    y1: CENTER + Math.sin(rad) * INNER_RADIUS,
    x2: CENTER + Math.cos(rad) * (INNER_RADIUS + LINE_LENGTH),
    y2: CENTER + Math.sin(rad) * (INNER_RADIUS + LINE_LENGTH),
  };
});

export const SpiralSpinner = ({ visible }: { visible: boolean }) => {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (!visible) return;
    const interval = setInterval(() => {
      setActiveIndex((previous) => (previous + 1) % LINE_COUNT);
    }, TICK_MS);
    return () => clearInterval(interval);
  }, [visible]);

  return (
    <svg
      width={SIZE_PX}
      height={SIZE_PX}
      viewBox={`0 0 ${SIZE_PX} ${SIZE_PX}`}
      className="shrink-0"
    >
      {LINE_POSITIONS.map((position, index) => {
        const distance =
          (LINE_COUNT - ((activeIndex - index + LINE_COUNT) % LINE_COUNT)) % LINE_COUNT;
        const opacity = 0.15 + (1 - distance / LINE_COUNT) * 0.85;

        return (
          <line
            key={index}
            x1={position.x1}
            y1={position.y1}
            x2={position.x2}
            y2={position.y2}
            stroke="white"
            strokeWidth={LINE_WIDTH}
            strokeLinecap="round"
            opacity={opacity}
          />
        );
      })}
    </svg>
  );
};
