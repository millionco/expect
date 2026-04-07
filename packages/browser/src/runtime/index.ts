// HACK: this barrel is the esbuild IIFE entry point for __EXPECT_RUNTIME__;
// build-runtime.js depends on a single file exporting the full runtime API.
export { getPerformanceMetrics, getPerformanceTrace } from "./lib/performance";
export type { PerformanceTrace } from "./lib/performance";

export {
  injectOverlayLabels,
  removeOverlay,
  findCursorInteractiveElements,
} from "./lib/annotation-overlay";
export type { CursorInteractiveResult } from "./lib/annotation-overlay";

export { prepareViewportSnapshot, restoreViewportSnapshot } from "./lib/scroll-detection";
export type { ScrollContainerResult } from "./lib/scroll-detection";

export {
  initAgentOverlay,
  updateCursor,
  hideAgentOverlay,
  showAgentOverlay,
  destroyAgentOverlay,
  highlightRefs,
  clearHighlights,
  logAction,
} from "./overlay";

import { finder } from "@medv/finder";
export const cssSelector = finder;
