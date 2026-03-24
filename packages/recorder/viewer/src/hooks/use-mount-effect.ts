/* oxlint-disable no-restricted-imports, react-hooks/exhaustive-deps */
import { useEffect } from "react";

export const useMountEffect = (effect: () => void | (() => void)) => {
  useEffect(effect, []);
};
