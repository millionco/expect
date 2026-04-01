export { getPerformanceMetrics, getPerformanceTrace } from "./performance";
export type { PerformanceTrace } from "./performance";

export { injectOverlayLabels, removeOverlay, findCursorInteractiveElements } from "./overlay";
export type { CursorInteractiveResult } from "./overlay";

export { startRecording, stopRecording, getEvents, getAllEvents, getEventCount } from "./rrweb";

export { prepareViewportSnapshot, restoreViewportSnapshot } from "./scroll-detection";
export type { ScrollContainerResult } from "./scroll-detection";
