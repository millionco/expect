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
  didUserTakeControl,
  clearUserControl,
  highlightRefs,
  clearHighlights,
} from "./overlay";

import { finder } from "@medv/finder";
export const cssSelector = finder;
