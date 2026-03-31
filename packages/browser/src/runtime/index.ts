import { finder } from "@medv/finder";
import { record } from "rrweb";
import type { eventWithTime } from "@rrweb/types";

const RRWEB_CHECKOUT_INTERVAL_MS = 10_000;

const FCP_GOOD_MS = 1800;
const FCP_POOR_MS = 3000;
const LCP_GOOD_MS = 2500;
const LCP_POOR_MS = 4000;
const CLS_GOOD = 0.1;
const CLS_POOR = 0.25;
const INP_GOOD_MS = 200;
const INP_POOR_MS = 500;
const CLS_SESSION_GAP_MS = 1000;
const CLS_SESSION_CAP_MS = 5000;
const INP_DURATION_THRESHOLD_MS = 16;
const CLS_PRECISION_FACTOR = 1000;

interface PerformanceMetricEntry {
  value: number;
  rating: string;
}

interface PerformanceMetricsResult {
  fcp: PerformanceMetricEntry | null;
  lcp: PerformanceMetricEntry | null;
  cls: PerformanceMetricEntry | null;
  inp: PerformanceMetricEntry | null;
}

interface EventTimingEntry extends PerformanceEntry {
  interactionId?: number;
}

interface LayoutShiftEntry extends PerformanceEntry {
  hadRecentInput: boolean;
  value: number;
}

interface LoafScript {
  invokerType: string;
  invoker: string;
  sourceURL: string;
  sourceFunctionName: string;
  sourceCharPosition: number;
  duration: number;
  forcedStyleAndLayoutDuration: number;
}

interface LoafEntry {
  startTime: number;
  duration: number;
  blockingDuration: number;
  renderStart: number;
  styleAndLayoutStart: number;
  firstUIEventTimestamp: number;
  scripts: LoafScript[];
}

interface ResourceEntry {
  name: string;
  initiatorType: string;
  transferSize: number;
  duration: number;
}

interface NavigationEntry {
  ttfb: number;
  domContentLoaded: number;
  loadComplete: number;
  redirectDuration: number;
  serverTiming: { name: string; duration: number; description: string }[];
}

const LOAF_BUFFER_LIMIT = 50;
const RESOURCE_TOP_N = 10;

const performanceState = {
  fcp: null as number | null,
  lcp: null as number | null,
  cls: 0,
  interactionDurations: new Map<number, number>(),
  loafEntries: [] as LoafEntry[],
};

const THRESHOLDS: Record<string, [number, number]> = {
  FCP: [FCP_GOOD_MS, FCP_POOR_MS],
  LCP: [LCP_GOOD_MS, LCP_POOR_MS],
  CLS: [CLS_GOOD, CLS_POOR],
  INP: [INP_GOOD_MS, INP_POOR_MS],
};

const ratePerformanceMetric = (name: string, value: number): string => {
  const threshold = THRESHOLDS[name];
  if (!threshold) return "unknown";
  if (value < threshold[0]) return "good";
  if (value < threshold[1]) return "needs-improvement";
  return "poor";
};

try {
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.name === "first-contentful-paint") {
        performanceState.fcp = entry.startTime;
      }
    }
  }).observe({ type: "paint", buffered: true });
} catch {}

try {
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      performanceState.lcp = entry.startTime;
    }
  }).observe({ type: "largest-contentful-paint", buffered: true });
} catch {}

try {
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      const { interactionId } = entry as EventTimingEntry;
      if (interactionId && interactionId > 0) {
        const current = performanceState.interactionDurations.get(interactionId) ?? 0;
        performanceState.interactionDurations.set(interactionId, Math.max(current, entry.duration));
      }
    }
  }).observe({
    type: "event",
    buffered: true,
    durationThreshold: INP_DURATION_THRESHOLD_MS,
  } as PerformanceObserverInit);
} catch {}

try {
  const sessionEntries: LayoutShiftEntry[] = [];
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      const shiftEntry = entry as LayoutShiftEntry;
      if (shiftEntry.hadRecentInput) continue;
      sessionEntries.push(shiftEntry);
    }
    let maxSessionValue = 0;
    let currentSessionValue = 0;
    let currentSessionStart = 0;
    let previousEntryEnd = 0;
    for (const entry of sessionEntries) {
      if (
        entry.startTime - previousEntryEnd > CLS_SESSION_GAP_MS ||
        entry.startTime - currentSessionStart > CLS_SESSION_CAP_MS
      ) {
        currentSessionValue = 0;
        currentSessionStart = entry.startTime;
      }
      currentSessionValue += entry.value;
      previousEntryEnd = entry.startTime + entry.duration;
      if (currentSessionValue > maxSessionValue) {
        maxSessionValue = currentSessionValue;
      }
    }
    performanceState.cls = maxSessionValue;
  }).observe({ type: "layout-shift", buffered: true });
} catch {}

try {
  if (
    typeof PerformanceObserver !== "undefined" &&
    PerformanceObserver.supportedEntryTypes.includes("long-animation-frame")
  ) {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const loaf = entry as unknown as LoafEntry & { scripts: LoafScript[] };
        performanceState.loafEntries.push({
          startTime: loaf.startTime,
          duration: loaf.duration,
          blockingDuration: loaf.blockingDuration,
          renderStart: loaf.renderStart,
          styleAndLayoutStart: loaf.styleAndLayoutStart,
          firstUIEventTimestamp: loaf.firstUIEventTimestamp,
          scripts: loaf.scripts.map((script) => ({
            invokerType: script.invokerType,
            invoker: script.invoker,
            sourceURL: script.sourceURL,
            sourceFunctionName: script.sourceFunctionName,
            sourceCharPosition: script.sourceCharPosition,
            duration: script.duration,
            forcedStyleAndLayoutDuration: script.forcedStyleAndLayoutDuration,
          })),
        });
        if (performanceState.loafEntries.length > LOAF_BUFFER_LIMIT) {
          performanceState.loafEntries.shift();
        }
      }
    }).observe({ type: "long-animation-frame", buffered: true });
  }
} catch {}

const buildMetric = (name: string, value: number | null): PerformanceMetricEntry | null => {
  if (value === null) return null;
  const rounded =
    name === "CLS"
      ? Math.round(value * CLS_PRECISION_FACTOR) / CLS_PRECISION_FACTOR
      : Math.round(value);
  return { value: rounded, rating: ratePerformanceMetric(name, value) };
};

export const getPerformanceMetrics = (): PerformanceMetricsResult => {
  const { fcp, lcp, cls, interactionDurations } = performanceState;

  let inp: number | null = null;
  if (interactionDurations.size > 0) {
    const durations = [...interactionDurations.values()].sort((a, b) => b - a);
    inp = durations[0];
  }

  return {
    fcp: buildMetric("FCP", fcp),
    lcp: buildMetric("LCP", lcp),
    cls: buildMetric("CLS", cls),
    inp: buildMetric("INP", inp),
  };
};

export interface PerformanceTrace {
  webVitals: PerformanceMetricsResult;
  navigation: NavigationEntry | null;
  longAnimationFrames: LoafEntry[];
  resources: {
    totalCount: number;
    totalTransferSizeBytes: number;
    slowest: ResourceEntry[];
    largest: ResourceEntry[];
  };
}

export const getPerformanceTrace = (): PerformanceTrace => {
  const webVitals = getPerformanceMetrics();

  let navigation: NavigationEntry | null = null;
  try {
    const navEntries = performance.getEntriesByType("navigation");
    if (navEntries.length > 0) {
      const nav = navEntries[0] as PerformanceNavigationTiming;
      navigation = {
        ttfb: Math.round(nav.responseStart - nav.requestStart),
        domContentLoaded: Math.round(nav.domContentLoadedEventEnd - nav.startTime),
        loadComplete: Math.round(nav.loadEventEnd - nav.startTime),
        redirectDuration: Math.round(nav.redirectEnd - nav.redirectStart),
        serverTiming: (nav.serverTiming ?? []).map((entry) => ({
          name: entry.name,
          duration: entry.duration,
          description: entry.description,
        })),
      };
    }
  } catch {}

  let resources: PerformanceTrace["resources"] = {
    totalCount: 0,
    totalTransferSizeBytes: 0,
    slowest: [],
    largest: [],
  };
  try {
    const resourceEntries = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
    const mapped: ResourceEntry[] = resourceEntries.map((entry) => ({
      name: entry.name,
      initiatorType: entry.initiatorType,
      transferSize: entry.transferSize,
      duration: Math.round(entry.duration),
    }));

    const totalTransferSizeBytes = mapped.reduce((sum, entry) => sum + entry.transferSize, 0);

    const slowest = [...mapped]
      .sort((left, right) => right.duration - left.duration)
      .slice(0, RESOURCE_TOP_N);
    const largest = [...mapped]
      .sort((left, right) => right.transferSize - left.transferSize)
      .slice(0, RESOURCE_TOP_N);

    resources = {
      totalCount: mapped.length,
      totalTransferSizeBytes,
      slowest,
      largest,
    };
  } catch {}

  return {
    webVitals,
    navigation,
    longAnimationFrames: [...performanceState.loafEntries],
    resources,
  };
};

interface OverlayItem {
  label: number;
  x: number;
  y: number;
}

export interface CursorInteractiveResult {
  selector: string;
  text: string;
  reason: string;
}

export const injectOverlayLabels = (containerId: string, items: OverlayItem[]): void => {
  const container = document.createElement("div");
  container.id = containerId;
  container.style.position = "absolute";
  container.style.top = "0";
  container.style.left = "0";
  container.style.zIndex = "2147483647";
  container.style.pointerEvents = "none";

  for (const item of items) {
    const badge = document.createElement("div");
    badge.textContent = `[${item.label}]`;
    badge.style.position = "absolute";
    badge.style.left = `${item.x}px`;
    badge.style.top = `${item.y}px`;
    badge.style.background = "rgba(255, 0, 0, 0.85)";
    badge.style.color = "white";
    badge.style.fontSize = "11px";
    badge.style.fontFamily = "monospace";
    badge.style.fontWeight = "bold";
    badge.style.padding = "1px 3px";
    badge.style.borderRadius = "3px";
    badge.style.lineHeight = "1.2";
    badge.style.whiteSpace = "nowrap";
    container.appendChild(badge);
  }

  document.body.appendChild(container);
};

export const removeOverlay = (containerId: string): void => {
  document.getElementById(containerId)?.remove();
};

export const findCursorInteractiveElements = (
  rootSelector: string,
  maxTextLength: number,
  interactiveRoles: string[],
  interactiveTags: string[],
  maxResults: number,
): CursorInteractiveResult[] => {
  const interactiveRoleSet = new Set(interactiveRoles);
  const interactiveTagSet = new Set(interactiveTags);
  const root = document.querySelector(rootSelector) || document.body;
  const elements = root.querySelectorAll("*");
  const results: CursorInteractiveResult[] = [];

  for (const element of elements) {
    const tagName = element.tagName.toLowerCase();
    if (interactiveTagSet.has(tagName)) continue;

    const role = element.getAttribute("role");
    if (role && interactiveRoleSet.has(role.toLowerCase())) continue;

    const computedStyle = getComputedStyle(element);
    const hasCursorPointer = computedStyle.cursor === "pointer";
    const hasOnClick =
      element.hasAttribute("onclick") ||
      (element instanceof HTMLElement && element.onclick !== null);
    const tabIndexAttr = element.getAttribute("tabindex");
    const hasTabIndex = tabIndexAttr !== null && tabIndexAttr !== "-1";

    if (!hasCursorPointer && !hasOnClick && !hasTabIndex) continue;

    if (hasCursorPointer && !hasOnClick && !hasTabIndex) {
      const parent = element.parentElement;
      if (parent && getComputedStyle(parent).cursor === "pointer") continue;
    }

    const text = (element.textContent || "").trim().slice(0, maxTextLength);
    if (!text) continue;

    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;

    const reasons: string[] = [];
    if (hasCursorPointer) reasons.push("cursor:pointer");
    if (hasOnClick) reasons.push("onclick");
    if (hasTabIndex) reasons.push("tabindex");

    results.push({
      selector: finder(element, { root }),
      text,
      reason: reasons.join(", "),
    });

    if (results.length >= maxResults) break;
  }

  return results;
};

const eventBuffer: eventWithTime[] = [];
let stopFn: (() => void) | undefined;

export const startRecording = (): void => {
  if (stopFn) return;
  eventBuffer.length = 0;
  stopFn =
    record({
      checkoutEveryNms: RRWEB_CHECKOUT_INTERVAL_MS,
      sampling: { input: "last" },
      emit(event) {
        eventBuffer.push(event);
      },
    }) ?? undefined;
};

export const stopRecording = (): void => {
  stopFn?.();
  stopFn = undefined;
};

export const getEvents = (): eventWithTime[] => {
  return eventBuffer.splice(0);
};

export const getAllEvents = (): eventWithTime[] => {
  return [...eventBuffer];
};

export const getEventCount = (): number => {
  return eventBuffer.length;
};
