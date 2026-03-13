import type { Locator, Page } from "playwright";
import type { RefMap } from "../types";
import { resolveLocator } from "./resolve-locator";

export const createLocator = (page: Page, refs: RefMap): ((ref: string) => Locator) => {
  return (ref: string) => {
    const entry = refs[ref];
    if (!entry) {
      const available = Object.keys(refs);
      const detail =
        available.length === 0
          ? "no refs available (page may be empty)"
          : `available refs: ${available.join(", ")}`;
      throw new Error(`Unknown ref "${ref}" (${detail})`);
    }
    return resolveLocator(page, entry);
  };
};
