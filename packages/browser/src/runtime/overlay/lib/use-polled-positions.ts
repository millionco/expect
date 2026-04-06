// eslint-disable-next-line no-restricted-imports -- overlay runs in injected runtime, not the CLI React app
import { useState, useEffect } from "react";
import { RAF_THROTTLE_INTERVAL_MS } from "./constants";

export const usePolledPositions = <T>(
  inputs: readonly unknown[],
  compute: () => T[],
  enabled: boolean,
): T[] => {
  const [positions, setPositions] = useState<T[]>([]);

  useEffect(() => {
    if (!enabled) {
      setPositions([]);
      return;
    }

    let timerId: ReturnType<typeof setTimeout> | undefined;
    let running = true;
    let previousJson = "";

    const poll = () => {
      if (!running) return;
      const next = compute();
      const json = JSON.stringify(next);
      if (json !== previousJson) {
        previousJson = json;
        setPositions(next);
      }
      timerId = setTimeout(poll, RAF_THROTTLE_INTERVAL_MS);
    };

    timerId = setTimeout(poll, 0);
    return () => {
      running = false;
      clearTimeout(timerId);
    };
  }, inputs);

  return positions;
};
