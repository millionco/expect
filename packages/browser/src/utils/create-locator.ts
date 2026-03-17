import { Effect } from "effect";
import type { Page } from "playwright";
import { RefNotFoundError } from "../errors";
import type { RefMap } from "../types";
import { resolveLocator } from "./resolve-locator";

export const createLocator = (page: Page, refs: RefMap) =>
  Effect.fn("Browser.resolveRef")(function* (ref: string) {
    const entry = refs[ref];
    if (!entry) {
      return yield* new RefNotFoundError({ ref, availableRefs: Object.keys(refs) });
    }
    return resolveLocator(page, entry);
  });
