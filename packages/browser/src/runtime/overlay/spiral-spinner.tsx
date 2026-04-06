// eslint-disable-next-line no-restricted-imports
import { useState, useEffect } from "react";

const DOT_COUNT = 3;
const TICK_MS = 300;

export const SpiralSpinner = ({ visible }: { visible: boolean }) => {
  const [activeDot, setActiveDot] = useState(0);

  useEffect(() => {
    if (!visible) return;
    const interval = setInterval(() => {
      setActiveDot((previous) => (previous + 1) % DOT_COUNT);
    }, TICK_MS);
    return () => clearInterval(interval);
  }, [visible]);

  return (
    <div className="flex items-center gap-[3px] size-4 shrink-0 justify-center">
      {Array.from({ length: DOT_COUNT }, (_, index) => (
        <div
          key={index}
          className="size-[4px] rounded-full transition-opacity duration-150"
          style={{ opacity: activeDot === index ? 1 : 0.3, background: "white" }}
        />
      ))}
    </div>
  );
};
