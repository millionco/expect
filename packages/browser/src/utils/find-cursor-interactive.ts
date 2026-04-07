import { Effect } from "effect";
import {
  INTERACTIVE_ROLES,
  MAX_CURSOR_INTERACTIVE_ELEMENTS,
  MAX_ELEMENT_TEXT_LENGTH,
} from "../constants";
import type { Page } from "playwright";
import { evaluateRuntime } from "./evaluate-runtime";

const INTERACTIVE_HTML_TAGS = ["a", "button", "input", "select", "textarea", "details", "summary"];

export const findCursorInteractive = Effect.fn("Browser.findCursorInteractive")(function* (
  page: Page,
  rootSelector?: string,
) {
  return yield* evaluateRuntime(
    page,
    "findCursorInteractiveElements",
    rootSelector || "body",
    MAX_ELEMENT_TEXT_LENGTH,
    [...INTERACTIVE_ROLES],
    INTERACTIVE_HTML_TAGS,
    MAX_CURSOR_INTERACTIVE_ELEMENTS,
  );
});
