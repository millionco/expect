/* eslint-disable no-restricted-imports -- escape hatch for mount-only effects */
import { useEffect } from "react";

export const useMountEffect = (effect: () => void | (() => void)) => {
  useEffect(effect, []);
};
