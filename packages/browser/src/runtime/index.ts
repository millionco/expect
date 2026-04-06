// HACK: this barrel is the esbuild IIFE entry point for __EXPECT_RUNTIME__;
// build-runtime.js depends on a single file exporting the full runtime API.
export { getPerformanceMetrics, getPerformanceTrace } from "./performance";
export type { PerformanceTrace } from "./performance";

export {
  injectOverlayLabels,
  removeOverlay,
  findCursorInteractiveElements,
} from "./annotation-overlay";
export type { CursorInteractiveResult } from "./annotation-overlay";

export { prepareViewportSnapshot, restoreViewportSnapshot } from "./scroll-detection";
export type { ScrollContainerResult } from "./scroll-detection";

export {
  initAgentOverlay,
  updateCursor,
  hideAgentOverlay,
  showAgentOverlay,
  destroyAgentOverlay,
  highlightRefs,
  clearHighlights,
  logAction,
  getSelectedSelector,
} from "./overlay";

import { finder } from "@medv/finder";
export const cssSelector = finder;
