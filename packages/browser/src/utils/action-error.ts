import {
  ActionTimeoutError,
  RefAmbiguousError,
  RefBlockedError,
  RefNotVisibleError,
} from "../errors";
import type { ActionError } from "../errors";

// HACK: Playwright only exports `errors.TimeoutError` publicly. All other failure
// modes are thrown as plain `Error` with descriptive messages — internal classes
// like `NonRecoverableDOMError` are serialized away by the client/server protocol
// boundary (client/connection.ts:172-173 calls parseError → rewriteErrorMessage),
// so consumers can only pattern-match on message strings.
//
// Complete list of error messages thrown by Playwright (@ ef45dd4):
//
// ── TimeoutError (server/progress.ts:100) ──────────────────────────────────────
//   "Timeout {N}ms exceeded."
//   + appended call log via formatCallLog (client/connection.ts:345-351):
//     "Call log:\n  waiting for locator(...) to be visible\n  element is not visible"
//
// ── Strict mode (injected/injectedScript.ts:1258) ──────────────────────────────
//   "strict mode violation: locator(...) resolved to {N} elements:\n    ..."
//
// ── NonRecoverableDOMError (server/dom.ts) ──────────────────────────────────────
//   "Element is not visible"                                            (line 322)
//   "Element is outside of the viewport"                                (line 328)
//   "Did not find some options"                                         (line 334)
//   "Option being selected is not enabled"                              (line 340)
//   "{desc} intercepts pointer events"                                  (line 346)
//   "Element is not {state}"  (state = stable|enabled|editable|visible) (line 352)
//   "Cannot uncheck radio button. Radio buttons can only be unchecked
//    by selecting another radio button in the same group."              (line 750)
//   "Clicking the checkbox did not change its state"                    (line 758)
//   "Element(s) not found"                                   (frames.ts:1115,1139)
//   "Element is not attached to the DOM"                     (frames.ts:1149)
//
// ── createStacklessError (injected/injectedScript.ts) ──────────────────────────
//   'Unknown engine "{name}" while parsing selector {sel}'              (line 262)
//   "Can only capture aria snapshot of Element nodes."                  (line 311)
//   "Can't query n-th element in a request with the capture."           (line 338)
//   "Node is not queryable."                                            (line 349)
//   "Internal error: there should not be a capture in the selector."    (line 353)
//   "Expected a Node but got {type}"                                    (line 396)
//   "Element is not an <input>, <textarea>, <select> or [contenteditable]
//    and does not have a role allowing [aria-readonly]"                 (line 745)
//   "Not a checkbox or radio button"                               (line 756,768)
//   'Unexpected element state "{state}"'                                (line 774)
//   "Element is not a <select> element"                                 (line 782)
//   'Input of type "{type}" cannot be filled'                           (line 834)
//   "Cannot type text into input[type=number]"                          (line 838)
//   "Malformed value"                                                   (line 847)
//   "Element is not an <input>, <textarea> or [contenteditable] element" (line 855)
//   "Node is not an element"                                       (line 899,927)
//   "Element is not connected"                                         (line 1481)
//   "Not a select element with a multiple attribute"                   (line 1514)
//   'Expected text is not provided for {expr}'                    (line 1543,1589)
//   "Not an input element"                                             (line 1565)
//   'Unknown expect matcher: {expr}'                              (line 1575,1606)
//   "Node is not an HTMLElement"                               (frames.ts:1254)
//   "Node is not an <input>, <textarea> or <select> element"   (frames.ts:1271)
//
// ── Plain Error (server/frames.ts) ──────────────────────────────────────────────
//   "Element is not attached to the DOM"                       (dom.ts:881)
//   "Frame is currently attempting a navigation"               (frames.ts:549)
//   "Open JavaScript dialog prevents evaluation"               (frames.ts:551)
//   'Failed to find element matching selector "{sel}"'         (frames.ts:836)
//   "The page does not support tap."                           (frames.ts:1201)
//   'No element matching {sel}'                                (frames.ts:1220)

const ELEMENT_COUNT_REGEX = /resolved to (\d+) elements/;
const TIMEOUT_REGEX = /Timeout \d+ms exceeded/;

const AMBIGUOUS_PATTERNS = ["strict mode violation"] as const;

const BLOCKED_PATTERNS = ["intercepts pointer events"] as const;

const NOT_VISIBLE_PATTERNS = [
  "Element is not visible",
  "Element is outside of the viewport",
  "element is not visible",
  "element is outside of the viewport",
  "to be visible",
  "Element is not stable",
  "element is not stable",
] as const;

const NOT_FOUND_PATTERNS = [
  "Element(s) not found",
  "Element is not attached to the DOM",
  "Element is not connected",
  "No element matching",
  "Failed to find element matching selector",
  "not attached",
] as const;

const matchesAny = (message: string, patterns: readonly string[]): boolean =>
  patterns.some((pattern) => message.includes(pattern));

export const toActionError = (error: unknown, ref: string): ActionError => {
  const errorMessage = error instanceof Error ? error.message : String(error);

  if (matchesAny(errorMessage, AMBIGUOUS_PATTERNS)) {
    const countMatch = ELEMENT_COUNT_REGEX.exec(errorMessage);
    return new RefAmbiguousError({ matchCount: countMatch ? countMatch[1] : "multiple", ref });
  }

  if (matchesAny(errorMessage, BLOCKED_PATTERNS)) {
    return new RefBlockedError({ ref });
  }

  if (matchesAny(errorMessage, NOT_VISIBLE_PATTERNS)) {
    return new RefNotVisibleError({ ref });
  }

  if (matchesAny(errorMessage, NOT_FOUND_PATTERNS)) {
    return new RefNotVisibleError({ ref });
  }

  if (TIMEOUT_REGEX.test(errorMessage)) {
    return new ActionTimeoutError({ ref });
  }

  return new ActionTimeoutError({ ref });
};
