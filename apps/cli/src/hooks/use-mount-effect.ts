import { useEffect, useRef } from "react";

export const useMountEffect = (callback: () => void | (() => void)) => {
  const hasRun = useRef(false);
  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;
    return callback();
  }, []);
};
