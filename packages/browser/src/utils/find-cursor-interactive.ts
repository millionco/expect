import { Effect } from "effect";
import { INTERACTIVE_ROLES, MAX_ELEMENT_TEXT_LENGTH } from "../constants";
import type { Page } from "playwright";

interface CursorInteractiveElement {
  selector: string;
  text: string;
  reason: string;
}

const INTERACTIVE_HTML_TAGS = ["a", "button", "input", "select", "textarea", "details", "summary"];

export const findCursorInteractive = Effect.fn("findCursorInteractive")(function* (
  page: Page,
  rootSelector?: string,
) {
  return (yield* Effect.promise(() =>
    page.evaluate(
      (params) =>
        __browserTesterRuntime.findCursorInteractiveElements(
          params.rootSelector,
          params.maxTextLength,
          params.interactiveRoles,
          params.interactiveTags,
        ),
      {
        rootSelector: rootSelector || "body",
        maxTextLength: MAX_ELEMENT_TEXT_LENGTH,
        interactiveRoles: [...INTERACTIVE_ROLES],
        interactiveTags: INTERACTIVE_HTML_TAGS,
      },
    ),
  )) as CursorInteractiveElement[];
});
