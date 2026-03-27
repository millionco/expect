import { useEffect } from "react";

export const useMountEffect = (effect: () => void | (() => void)) => {
  /* eslint-disable no-restricted-imports -- mount-only escape hatch for external sync */
  useEffect(effect, []);
};
