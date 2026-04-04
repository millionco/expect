"use client";

import { Calligraph } from "calligraph";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { eventWithTime } from "@posthog/rrweb";
import type { Replayer } from "@posthog/rrweb";
import { animate, AnimatePresence, motion, useMotionValue, useTransform } from "motion/react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatTime } from "@/lib/format-time";

import { useMountEffect } from "@/hooks/use-mount-effect";
import { MacWindow } from "@/components/replay/mac-window";
import type { ViewerRunState, ViewerStepEvent } from "@/lib/replay-types";

const SPEEDS = [1, 2, 4, 8] as const;
const TIMER_INTERVAL_MS = 100;
const LIVE_EDGE_THRESHOLD_MS = 2000;
const LIVE_STALL_TICK_THRESHOLD = 5;
const IDLE_THRESHOLD_MS = 4000;
const IDLE_SPEED_TIERS = [
  { afterMs: 0, speed: 2 },
  { afterMs: 8000, speed: 4 },
  { afterMs: 20000, speed: 8 },
  { afterMs: 40000, speed: 16 },
] as const;
const LIVE_PLAYBACK_BAR_SHADOW = "color(display-p3 0.281 0.281 0.281 / 22%) 0px 0px 0px 1px";
const LIVE_PLAYBACK_BAR_BUTTON_SHADOW = "color(display-p3 0.847 0.847 0.847) 0px 0px 0px 0.5px";
const LIVE_PLAYBACK_BAR_MARKER_INTERVAL_MS = 10_000;
const LIVE_PASSED_STEP_MARKER_OUTLINE = "2px solid color(display-p3 0.249 0.701 0.193 / 30%)";
const LIVE_PASSED_STEP_MARKER_BACKGROUND_IMAGE =
  "linear-gradient(in oklab 180deg, oklab(66.4% -0.197 0.139) 0%, oklab(72.7% -0.252 0.178) 100%)";
const LIVE_FAILED_STEP_MARKER_OUTLINE = "2px solid #FC272F4D";
const LIVE_FAILED_STEP_MARKER_BACKGROUND_IMAGE =
  "linear-gradient(in oklab 180deg, oklab(63.6% 0.216 0.107) 0%, oklab(67.1% 0.194 0.096) 100%)";
const LIVE_PLAYBACK_PROGRESS_SHADOW = "color(display-p3 0.615 0.615 0.615 / 20%) 0px 0px 3px";
const LIVE_PLAYBACK_PROGRESS_RIGHT_EDGE_SHADOW =
  "inset -1px 0px 0px color(display-p3 0.725 0.725 0.725 / 80%)";
const LIVE_PLAYBACK_PROGRESS_RIGHT_EDGE_HIDE_PERCENT = 99;
const VIEWER_SHELL_SHADOW = "color(display-p3 0.788 0.788 0.788 / 20%) 0px 2px 3px";
const CONTROL_FONT_FAMILY =
  '"SF Pro Display", "SFProDisplay-Medium", "Inter Variable", system-ui, sans-serif';
const REPLAY_BACKDROP_STYLE = {
  backgroundImage: "url('/replay-viewer-background.webp')",
  backgroundPosition: "center",
  backgroundRepeat: "no-repeat",
  backgroundSize: "cover",
} satisfies CSSProperties;
const PAPER_TIME_LENGTH = 5;
const LIVE_PLAYBACK_BAR_SURFACE_COLOR = "color(display-p3 0.938 0.938 0.938)";
const LIVE_PLAYBACK_PROGRESS_BACKGROUND_IMAGE =
  "linear-gradient(in oklab 180deg, oklab(100% 0 0) 0%, oklab(100% 0 0 / 61%) 100%)";
const ACTIVE_STEP_CARD_SHADOW = "color(display-p3 0.847 0.847 0.847) 0px 0px 0px 0.5px";
const ACTIVE_STEP_CARD_TRANSITION = {
  type: "tween",
  duration: 0.16,
  ease: [0.2, 0.8, 0.2, 1],
} as const;
const PLAYBACK_BAR_RUBBER_BAND_DEAD_ZONE_PX = 32;
const PLAYBACK_BAR_RUBBER_BAND_CURSOR_RANGE_PX = 200;
const PLAYBACK_BAR_RUBBER_BAND_MAX_STRETCH_PX = 8;
const PLAYBACK_BAR_RUBBER_BAND_TRANSITION = {
  type: "spring",
  visualDuration: 0.35,
  bounce: 0.15,
} as const;

const NOTIFICATION_WINDOW_MS = 3000;
const NOTIFICATION_MAX_VISIBLE = 3;
const INPUT_DEBOUNCE_MS = 500;
const INPUT_ACTION_OFFSET_MS = 500;
const SCROLL_DEBOUNCE_MS = 800;
const RRWEB_EVENT_INCREMENTAL = 3;
const RRWEB_EVENT_META = 4;
const RRWEB_SOURCE_MOUSE_INTERACTION = 2;
const RRWEB_SOURCE_SCROLL = 3;
const RRWEB_SOURCE_VIEWPORT_RESIZE = 4;
const RRWEB_SOURCE_INPUT = 5;
const RRWEB_SOURCE_MEDIA_INTERACTION = 7;
const RRWEB_SOURCE_DRAG = 12;
const RRWEB_MOUSE_CLICK = 2;
const RRWEB_MOUSE_DBLCLICK = 4;
const RRWEB_MOUSE_CONTEXT_MENU = 8;
const RRWEB_MOUSE_FOCUS = 6;
const RRWEB_MOUSE_TOUCH_START = 9;
const RRWEB_MEDIA_PLAY = 0;
const RRWEB_MEDIA_PAUSE = 1;

interface ReplayAction {
  id: string;
  label: string;
  relativeMs: number;
}

const MOUSE_INTERACTION_LABELS: Record<number, string> = {
  [RRWEB_MOUSE_CLICK]: "Clicked",
  [RRWEB_MOUSE_DBLCLICK]: "Double-clicked",
  [RRWEB_MOUSE_CONTEXT_MENU]: "Right-clicked",
  [RRWEB_MOUSE_FOCUS]: "Focused",
  [RRWEB_MOUSE_TOUCH_START]: "Tapped",
};

const extractReplayActions = (events: eventWithTime[]): ReplayAction[] => {
  if (events.length < 2) return [];
  const startTs = events[0].timestamp;
  const actions: ReplayAction[] = [];
  let lastInputTs = -Infinity;
  let lastScrollTs = -Infinity;

  for (const event of events) {
    const relativeMs = event.timestamp - startTs;
    const data = event.data as Record<string, unknown>;

    if (event.type === RRWEB_EVENT_META && typeof data.href === "string") {
      try {
        const url = new URL(data.href);
        const displayPath = url.pathname === "/" ? url.hostname : `${url.hostname}${url.pathname}`;
        actions.push({
          id: `nav-${event.timestamp}`,
          label: `Navigated to ${displayPath}`,
          relativeMs,
        });
      } catch {
        // skip invalid URLs
      }
      continue;
    }

    if (event.type !== RRWEB_EVENT_INCREMENTAL) continue;

    if (data.source === RRWEB_SOURCE_MOUSE_INTERACTION) {
      const interactionType = data.type as number;
      const label = MOUSE_INTERACTION_LABELS[interactionType];
      if (label) {
        actions.push({ id: `mouse-${interactionType}-${event.timestamp}`, label, relativeMs });
      }
      continue;
    }

    if (data.source === RRWEB_SOURCE_INPUT) {
      if (event.timestamp - lastInputTs > INPUT_DEBOUNCE_MS) {
        const rawText = typeof data.text === "string" ? data.text : "";
        const displayText = rawText.length > 30 ? `${rawText.slice(0, 30)}…` : rawText;
        actions.push({
          id: `input-${event.timestamp}`,
          label: displayText.length > 0 ? `Typed "${displayText}"` : "Typed input",
          relativeMs: relativeMs + INPUT_ACTION_OFFSET_MS,
        });
      }
      lastInputTs = event.timestamp;
      continue;
    }

    if (data.source === RRWEB_SOURCE_SCROLL) {
      if (event.timestamp - lastScrollTs > SCROLL_DEBOUNCE_MS) {
        actions.push({ id: `scroll-${event.timestamp}`, label: "Scrolled", relativeMs });
      }
      lastScrollTs = event.timestamp;
      continue;
    }

    if (data.source === RRWEB_SOURCE_VIEWPORT_RESIZE) {
      const width = data.width as number;
      const height = data.height as number;
      actions.push({
        id: `resize-${event.timestamp}`,
        label: `Resized to ${width}×${height}`,
        relativeMs,
      });
      continue;
    }

    if (data.source === RRWEB_SOURCE_MEDIA_INTERACTION) {
      const mediaType = data.type as number;
      const label =
        mediaType === RRWEB_MEDIA_PLAY
          ? "Played media"
          : mediaType === RRWEB_MEDIA_PAUSE
            ? "Paused media"
            : undefined;
      if (label) {
        actions.push({ id: `media-${event.timestamp}`, label, relativeMs });
      }
      continue;
    }

    if (data.source === RRWEB_SOURCE_DRAG) {
      actions.push({ id: `drag-${event.timestamp}`, label: "Dragged", relativeMs });
      continue;
    }
  }

  return actions;
};

const getReplayDuration = (replayEvents: eventWithTime[]) => {
  if (replayEvents.length < 2) return 0;

  return Math.max(replayEvents[replayEvents.length - 1].timestamp - replayEvents[0].timestamp, 0);
};

const isTransparentBackground = (backgroundColor: string) =>
  backgroundColor === "rgba(0, 0, 0, 0)" || backgroundColor === "transparent";

const getElementBackground = (
  element: Element | null | undefined,
  frameWindow: Window,
): string | undefined => {
  if (!element || element.nodeType !== Node.ELEMENT_NODE) return undefined;

  const computedStyle = frameWindow.getComputedStyle(element);
  if (
    computedStyle.backgroundImage === "none" &&
    isTransparentBackground(computedStyle.backgroundColor)
  ) {
    return undefined;
  }

  return computedStyle.background;
};

const getReplayFrameBackground = (replayer: Replayer | undefined) => {
  const iframe = replayer?.iframe;
  if (!iframe?.contentDocument || !iframe.contentWindow) return undefined;

  const frameDocument = iframe.contentDocument;
  const frameWindow = iframe.contentWindow;
  const samplePoints = [
    { x: 20, y: 20 },
    {
      x: 20,
      y: Math.max(20, frameDocument.documentElement.clientHeight - 20),
    },
  ];

  for (const samplePoint of samplePoints) {
    const sampleElement = frameDocument.elementFromPoint(samplePoint.x, samplePoint.y);
    const background = getElementBackground(sampleElement, frameWindow);
    if (background) {
      return background;
    }
  }

  return getElementBackground(frameDocument.body, frameWindow);
};

const formatPaperTime = (timeMs: number) => formatTime(timeMs).padStart(PAPER_TIME_LENGTH, "0");

const getStepRelativeTime = (step: ViewerStepEvent, replayStartMs: number) => {
  const startMs =
    step.startedAtMs !== undefined ? Math.max(0, step.startedAtMs - replayStartMs) : undefined;
  const endMs =
    step.endedAtMs !== undefined ? Math.max(0, step.endedAtMs - replayStartMs) : undefined;
  return { startMs, endMs };
};

const getPlaybackStepIndex = (
  stepEvents: readonly ViewerStepEvent[] | undefined,
  replayStartMs: number,
  currentTime: number,
) => {
  if (!stepEvents || stepEvents.length === 0) return -1;

  for (let index = stepEvents.length - 1; index >= 0; index--) {
    const { startMs, endMs } = getStepRelativeTime(stepEvents[index], replayStartMs);
    const stepTimeMs = startMs ?? endMs;
    if (stepTimeMs === undefined) continue;
    if (stepTimeMs <= currentTime) {
      return index;
    }
  }

  return 0;
};

const getPlaybackBarRubberBandStretch = (
  playbackBarRect: DOMRect,
  clientX: number,
  direction: -1 | 1,
) => {
  const distancePastEdge =
    direction < 0 ? playbackBarRect.left - clientX : clientX - playbackBarRect.right;
  const overflowPx = Math.max(0, distancePastEdge - PLAYBACK_BAR_RUBBER_BAND_DEAD_ZONE_PX);
  return (
    direction *
    PLAYBACK_BAR_RUBBER_BAND_MAX_STRETCH_PX *
    Math.sqrt(Math.min(overflowPx / PLAYBACK_BAR_RUBBER_BAND_CURSOR_RANGE_PX, 1))
  );
};

interface ControlIconProps {
  className?: string;
}

const PlayIcon = ({ className }: ControlIconProps) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" className={className}>
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M8.5 6.75C8.5 5.63 9.73 4.95 10.67 5.55L17.5 10.8C18.36 11.34 18.36 12.66 17.5 13.2L10.67 18.45C9.73 19.05 8.5 18.37 8.5 17.25V6.75Z"
      fill="currentColor"
    />
  </svg>
);

const PauseIcon = ({ className }: ControlIconProps) => (
  <svg
    version="1.1"
    xmlns="http://www.w3.org/2000/svg"
    xmlnsXlink="http://www.w3.org/1999/xlink"
    viewBox="0 0 13.251 17.087"
    className={className}
  >
    <g>
      <path
        d="M1.47 17.078L3.811 17.078C4.776 17.078 5.278 16.576 5.278 15.601L5.278 1.47C5.278 0.481 4.776 0 3.811 0L1.47 0C0.502 0 0 0.495 0 1.47L0 15.601C0 16.576 0.49 17.078 1.47 17.078ZM9.085 17.078L11.419 17.078C12.394 17.078 12.889 16.576 12.889 15.601L12.889 1.47C12.889 0.481 12.394 0 11.419 0L9.085 0C8.11 0 7.608 0.495 7.608 1.47L7.608 15.601C7.608 16.576 8.101 17.078 9.085 17.078Z"
        fill="#000000D9"
      />
    </g>
  </svg>
);

const FullscreenIcon = ({ className }: ControlIconProps) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" className={className}>
    <path
      d="M2 19V17C2 16.448 2.448 16 3 16C3.552 16 4 16.448 4 17V19C4 19.552 4.448 20 5 20H7C7.552 20 8 20.448 8 21C8 21.552 7.552 22 7 22H5C3.343 22 2 20.657 2 19ZM20 19V17C20 16.448 20.448 16 21 16C21.552 16 22 16.448 22 17V19C22 20.657 20.657 22 19 22H17C16.448 22 16 21.552 16 21C16 20.448 16.448 20 17 20H19C19.552 20 20 19.552 20 19ZM2 7V5C2 3.343 3.343 2 5 2H7C7.552 2 8 2.448 8 3C8 3.552 7.552 4 7 4H5C4.448 4 4 4.448 4 5V7C4 7.552 3.552 8 3 8C2.448 8 2 7.552 2 7ZM20 7V5C20 4.448 19.552 4 19 4H17C16.448 4 16 3.552 16 3C16 2.448 16.448 2 17 2H19C20.657 2 22 3.343 22 5V7C22 7.552 21.552 8 21 8C20.448 8 20 7.552 20 7Z"
      fill="currentColor"
    />
  </svg>
);

interface ReplayViewerProps {
  events: eventWithTime[];
  steps?: ViewerRunState;
  live?: boolean;
  autoPlay?: boolean;
  onAddEventsRef?: (handler: (newEvents: eventWithTime[]) => void) => void;
}

export const ReplayViewer = ({
  events,
  steps,
  live = false,
  autoPlay = false,
  onAddEventsRef,
}: ReplayViewerProps) => {
  const [playbackBarClientReady, setPlaybackBarClientReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [browserFrameBackground, setBrowserFrameBackground] = useState<string | undefined>(
    undefined,
  );
  const playbackBarRef = useRef<HTMLDivElement>(null);
  const replayRef = useRef<HTMLDivElement>(null);
  const viewerShellRef = useRef<HTMLDivElement>(null);
  const replayerRef = useRef<Replayer | undefined>(undefined);
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const cleanupLayoutRef = useRef<(() => void) | undefined>(undefined);
  const autoPlayTriggeredRef = useRef(false);
  const liveRef = useRef(live);
  liveRef.current = live;
  const playPauseRef = useRef<(() => Promise<void>) | undefined>(undefined);
  const stepNavigationRef = useRef<((direction: "up" | "down") => void) | undefined>(undefined);
  const stepJumpRef = useRef<((stepNumber: number) => void) | undefined>(undefined);
  const isIdleSpeedRef = useRef(false);
  const userSpeedRef = useRef<(typeof SPEEDS)[number]>(1);
  const lastCursorPosRef = useRef("");
  const idleTicksRef = useRef(0);
  const cleanupIdleObserverRef = useRef<(() => void) | undefined>(undefined);
  const stepListPointerActiveRef = useRef(false);
  const stepListDraggedStepIdRef = useRef<string | undefined>(undefined);
  const playbackBarRectRef = useRef<DOMRect | undefined>(undefined);
  const playbackBarPointerActiveRef = useRef(false);
  const playbackBarRubberResetRef = useRef<{ stop: () => void } | undefined>(undefined);
  const browserFrameBackgroundRef = useRef<string | undefined>(undefined);
  const playbackBarRubberStretchPx = useMotionValue(0);
  const playbackBarRubberBandWidth = useTransform(
    playbackBarRubberStretchPx,
    (stretchPx) => `calc(100% + ${Math.abs(stretchPx)}px)`,
  );
  const playbackBarRubberBandX = useTransform(playbackBarRubberStretchPx, (stretchPx) =>
    stretchPx < 0 ? stretchPx : 0,
  );

  const destroyReplay = () => {
    clearInterval(timerRef.current);
    timerRef.current = undefined;
    cleanupIdleObserverRef.current?.();
    cleanupIdleObserverRef.current = undefined;
    cleanupLayoutRef.current?.();
    cleanupLayoutRef.current = undefined;
    replayerRef.current?.destroy();
    replayerRef.current = undefined;
    browserFrameBackgroundRef.current = undefined;
    setBrowserFrameBackground(undefined);
  };

  const liveStallRef = useRef({ lastTime: -1, count: 0 });

  const syncBrowserFrameBackground = () => {
    const nextBackground = getReplayFrameBackground(replayerRef.current);
    if (nextBackground === browserFrameBackgroundRef.current) return;

    browserFrameBackgroundRef.current = nextBackground;
    setBrowserFrameBackground(nextBackground);
  };

  const startTimer = () => {
    clearInterval(timerRef.current);
    idleTicksRef.current = 0;
    liveStallRef.current = { lastTime: -1, count: 0 };
    timerRef.current = setInterval(() => {
      const replayer = replayerRef.current;
      if (!replayer) return;

      const time = replayer.getCurrentTime();
      syncBrowserFrameBackground();
      setCurrentTime(time);

      if (liveRef.current) {
        const stall = liveStallRef.current;
        if (time === stall.lastTime) {
          stall.count++;
          if (stall.count >= LIVE_STALL_TICK_THRESHOLD) {
            replayer.play(time);
            stall.count = 0;
          }
        } else {
          stall.count = 0;
        }
        stall.lastTime = time;
        return;
      }

      const meta = replayer.getMetaData();
      const duration = meta.endTime - meta.startTime;

      if (time >= duration) {
        clearInterval(timerRef.current);
        setPlaying(false);
        return;
      }
    }, TIMER_INTERVAL_MS);
  };

  const setupIdleSpeedObserver = (cursorEl: HTMLElement) => {
    let currentIdleSpeed = 0;

    const getIdleSpeed = (idleMs: number) => {
      let speed = 0;
      for (const tier of IDLE_SPEED_TIERS) {
        if (idleMs >= tier.afterMs) {
          speed = tier.speed;
        }
      }
      return speed;
    };

    const checkIdle = () => {
      const replayer = replayerRef.current;
      if (!replayer || liveRef.current) return;

      const pos = `${cursorEl.style.left},${cursorEl.style.top}`;
      if (pos === lastCursorPosRef.current) {
        idleTicksRef.current++;
      } else {
        idleTicksRef.current = 0;
        lastCursorPosRef.current = pos;
      }

      const idleMs = idleTicksRef.current * TIMER_INTERVAL_MS;
      const shouldIdle = idleMs >= IDLE_THRESHOLD_MS;

      if (shouldIdle) {
        const targetSpeed = getIdleSpeed(idleMs - IDLE_THRESHOLD_MS);
        if (!isIdleSpeedRef.current || targetSpeed !== currentIdleSpeed) {
          isIdleSpeedRef.current = true;
          currentIdleSpeed = targetSpeed;
          replayer.setConfig({ speed: targetSpeed });
        }
      } else if (isIdleSpeedRef.current) {
        isIdleSpeedRef.current = false;
        currentIdleSpeed = 0;
        replayer.setConfig({ speed: userSpeedRef.current });
      }
    };

    const intervalId = setInterval(checkIdle, TIMER_INTERVAL_MS);
    return () => clearInterval(intervalId);
  };

  useMountEffect(() => {
    setPlaybackBarClientReady(true);
  });

  useMountEffect(() => {
    return () => {
      destroyReplay();
    };
  });

  useMountEffect(() => {
    const handleWindowKeyDown = (event: KeyboardEvent) => {
      const pressedSpace = event.code === "Space" || event.key === " ";
      const isModifierPressed = event.metaKey || event.ctrlKey || event.altKey;
      if (pressedSpace) {
        if (event.repeat || isModifierPressed) return;
        event.preventDefault();
        event.stopPropagation();
        void playPauseRef.current?.();
        return;
      }

      const eventTarget = event.target;
      const targetElement = eventTarget instanceof HTMLElement ? eventTarget : null;
      const targetUsesArrowKeys =
        targetElement?.isContentEditable ||
        targetElement?.tagName === "INPUT" ||
        targetElement?.tagName === "TEXTAREA" ||
        targetElement?.tagName === "SELECT";
      if (isModifierPressed || targetUsesArrowKeys) return;

      const pressedDigit = /^\d$/.test(event.key)
        ? event.key === "0"
          ? 10
          : Number(event.key)
        : undefined;
      if (pressedDigit !== undefined) {
        if (event.repeat) return;
        event.preventDefault();
        event.stopPropagation();
        stepJumpRef.current?.(pressedDigit);
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        event.stopPropagation();
        stepNavigationRef.current?.("down");
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        event.stopPropagation();
        stepNavigationRef.current?.("up");
      }
    };

    window.addEventListener("keydown", handleWindowKeyDown);
    return () => {
      window.removeEventListener("keydown", handleWindowKeyDown);
    };
  });

  useEffect(() => {
    if (!onAddEventsRef) return;
    onAddEventsRef((newEvents) => {
      const replayer = replayerRef.current;
      if (!replayer) return;
      for (const event of newEvents) {
        replayer.addEvent(event);
      }
    });
  }, [onAddEventsRef]);

  useEffect(() => {
    if (autoPlayTriggeredRef.current || events.length < 2) return;
    if (!live && !autoPlay) return;
    autoPlayTriggeredRef.current = true;
    void playPauseRef.current?.();
  }, [live, autoPlay, events.length]);

  const setupReplayScaling = () => {
    if (!replayRef.current) return undefined;

    const replayContainer = replayRef.current;
    const wrapper = replayContainer.querySelector(".replayer-wrapper") as HTMLElement | undefined;
    if (!wrapper) return undefined;

    const iframe = wrapper.querySelector("iframe");
    if (!iframe) return undefined;

    const applyScale = () => {
      const recordedWidth = Number(iframe.getAttribute("width")) || 0;
      const recordedHeight = Number(iframe.getAttribute("height")) || 0;
      const containerWidth = replayContainer.clientWidth;
      const containerHeight = replayContainer.clientHeight;

      if (!recordedWidth || !recordedHeight || !containerWidth || !containerHeight) return;

      const fitScale = Math.min(containerWidth / recordedWidth, containerHeight / recordedHeight);

      const scaledWidth = recordedWidth * fitScale;
      const scaledHeight = recordedHeight * fitScale;
      const centerX = (containerWidth - scaledWidth) / 2;
      const centerY = (containerHeight - scaledHeight) / 2;

      wrapper.style.position = "absolute";
      wrapper.style.top = "0";
      wrapper.style.left = "0";
      wrapper.style.transformOrigin = "top left";
      wrapper.style.transform = `translate(${centerX}px, ${centerY}px) scale(${fitScale})`;
      wrapper.style.width = `${recordedWidth}px`;
      wrapper.style.height = `${recordedHeight}px`;
    };

    applyScale();

    const resizeObserver = new ResizeObserver(applyScale);
    resizeObserver.observe(replayContainer);

    const iframeObserver = new MutationObserver(applyScale);
    iframeObserver.observe(iframe, {
      attributes: true,
      attributeFilter: ["width", "height"],
    });

    const cursorEl = wrapper.querySelector(".replayer-mouse") as HTMLElement | undefined;
    if (cursorEl) {
      cleanupIdleObserverRef.current = setupIdleSpeedObserver(cursorEl);
    }

    return () => {
      resizeObserver.disconnect();
      iframeObserver.disconnect();
    };
  };

  const handlePlay = async () => {
    if (!replayRef.current || events.length < 2) return;

    const replayDuration = getReplayDuration(events);

    if (replayerRef.current) {
      if (playing) {
        replayerRef.current.pause();
        clearInterval(timerRef.current);
        setPlaying(false);
      } else {
        const resumeTime = !liveRef.current && currentTime >= replayDuration ? 0 : currentTime;
        replayerRef.current.play(resumeTime);
        setCurrentTime(resumeTime);
        startTimer();
        setPlaying(true);
      }
      return;
    }

    replayRef.current.innerHTML = "";

    const { Replayer } = await import("@posthog/rrweb");
    await import("@posthog/rrweb/dist/style.css");

    const replayer = new Replayer(events, {
      root: replayRef.current,
      skipInactive: false,
      mouseTail: false,
      speed,
    });
    replayerRef.current = replayer;

    const replayIframe = replayer.iframe;
    if (replayIframe) {
      const currentSandbox = replayIframe.getAttribute("sandbox") ?? "";
      if (!currentSandbox.includes("allow-scripts")) {
        replayIframe.setAttribute("sandbox", `${currentSandbox} allow-scripts`.trim());
      }
    }

    const startTime = liveRef.current ? replayDuration : Math.min(currentTime, replayDuration);
    setCurrentTime(startTime);
    replayer.play(startTime);
    syncBrowserFrameBackground();
    setPlaying(true);
    startTimer();

    cleanupLayoutRef.current = setupReplayScaling();
  };
  playPauseRef.current = handlePlay;

  const seekTo = (timeMs: number) => {
    setCurrentTime(timeMs);

    const replayer = replayerRef.current;
    if (!replayer) return;

    if (playing) {
      replayer.play(timeMs);
      syncBrowserFrameBackground();
      startTimer();
      return;
    }

    replayer.pause(timeMs);
    syncBrowserFrameBackground();
  };

  const handleSeek = (event: React.ChangeEvent<HTMLInputElement>) => {
    seekTo(Number(event.target.value));
  };

  const updatePlaybackBarRubberBand = (clientX: number) => {
    const playbackBarRect = playbackBarRectRef.current;
    if (!playbackBarRect) return;

    playbackBarRubberResetRef.current?.stop();
    playbackBarRubberResetRef.current = undefined;

    if (clientX < playbackBarRect.left) {
      playbackBarRubberStretchPx.jump(
        getPlaybackBarRubberBandStretch(playbackBarRect, clientX, -1),
      );
      return;
    }

    if (clientX > playbackBarRect.right) {
      playbackBarRubberStretchPx.jump(getPlaybackBarRubberBandStretch(playbackBarRect, clientX, 1));
      return;
    }

    playbackBarRubberStretchPx.jump(0);
  };

  const finishPlaybackBarPointerInteraction = (target?: HTMLInputElement, pointerId?: number) => {
    if (!playbackBarPointerActiveRef.current) return;

    playbackBarPointerActiveRef.current = false;
    playbackBarRectRef.current = undefined;

    if (target && pointerId !== undefined && target.hasPointerCapture(pointerId)) {
      target.releasePointerCapture(pointerId);
    }

    playbackBarRubberResetRef.current?.stop();
    playbackBarRubberResetRef.current = undefined;

    if (playbackBarRubberStretchPx.get() === 0) return;

    playbackBarRubberResetRef.current = animate(
      playbackBarRubberStretchPx,
      0,
      PLAYBACK_BAR_RUBBER_BAND_TRANSITION,
    );
  };

  const handlePlaybackBarPointerDown = (event: React.PointerEvent<HTMLInputElement>) => {
    const playbackBarRect = playbackBarRef.current?.getBoundingClientRect();
    if (!playbackBarRect) return;

    playbackBarPointerActiveRef.current = true;
    playbackBarRectRef.current = playbackBarRect;
    playbackBarRubberResetRef.current?.stop();
    playbackBarRubberResetRef.current = undefined;
    event.currentTarget.setPointerCapture(event.pointerId);
    updatePlaybackBarRubberBand(event.clientX);
  };

  const handlePlaybackBarPointerMove = (event: React.PointerEvent<HTMLInputElement>) => {
    if (!playbackBarPointerActiveRef.current) return;
    updatePlaybackBarRubberBand(event.clientX);
  };

  const handlePlaybackBarPointerUp = (event: React.PointerEvent<HTMLInputElement>) => {
    finishPlaybackBarPointerInteraction(event.currentTarget, event.pointerId);
  };

  const handlePlaybackBarPointerCancel = (event: React.PointerEvent<HTMLInputElement>) => {
    finishPlaybackBarPointerInteraction(event.currentTarget, event.pointerId);
  };

  const handlePlaybackBarLostPointerCapture = () => {
    finishPlaybackBarPointerInteraction();
  };

  const handleSpeedChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const nextSpeed = SPEEDS.find((supportedSpeed) => {
      return `${supportedSpeed}` === event.target.value;
    });

    if (!nextSpeed) return;

    setSpeed(nextSpeed);
    userSpeedRef.current = nextSpeed;
    isIdleSpeedRef.current = false;
    replayerRef.current?.setConfig({ speed: nextSpeed });
  };

  const handleFullscreen = async () => {
    const viewerShell = viewerShellRef.current;
    if (!viewerShell) return;

    if (document.fullscreenElement === viewerShell) {
      await document.exitFullscreen();
      return;
    }

    await viewerShell.requestFullscreen();
  };

  const replayStartMs =
    events.length > 0 ? events[0].timestamp : (steps?.steps[0]?.startedAtMs ?? 0);
  const hasEvents = events.length > 1;
  const totalTime = getReplayDuration(events);
  const replayActions = extractReplayActions(events);
  const stepActions: ReplayAction[] = (steps?.steps ?? []).flatMap((step, index) => {
    if (step.startedAtMs === undefined) return [];
    const relativeMs = Math.max(0, step.startedAtMs - replayStartMs);
    return [{ id: `step-${step.stepId}`, label: `Step ${index + 1}: ${step.title}`, relativeMs }];
  });
  const allActions = [...replayActions, ...stepActions].sort(
    (left, right) => left.relativeMs - right.relativeMs,
  );
  const visibleActions = allActions
    .filter((action) => {
      const age = currentTime - action.relativeMs;
      return age >= 0 && age < NOTIFICATION_WINDOW_MS;
    })
    .slice(-NOTIFICATION_MAX_VISIBLE);
  const canPlay = hasEvents;
  const isAtLiveEdge = live && totalTime - currentTime < LIVE_EDGE_THRESHOLD_MS;
  const timeLabel = formatPaperTime(currentTime);
  const totalTimeLabel = formatPaperTime(totalTime);
  const playbackBarWrapperClassName = playbackBarClientReady
    ? "relative pb-4 will-change-transform md:pb-6"
    : "relative pb-4 md:pb-6";
  const playbackBarTrackClassName = playbackBarClientReady
    ? "group/playback-bar relative h-8 overflow-hidden rounded-full md:h-9.75"
    : "relative h-8 overflow-hidden rounded-full md:h-9.75";
  const defaultPlaybackBarButtonClassName =
    "transition-transform duration-150 ease-out disabled:opacity-40";
  const playbackBarButtonVisibilityClassName = live
    ? playbackBarClientReady
      ? "opacity-0 pointer-events-none transition-[opacity,transform] duration-150 ease-out group-hover/playback-bar:opacity-100 group-hover/playback-bar:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto"
      : defaultPlaybackBarButtonClassName
    : defaultPlaybackBarButtonClassName;
  const playbackBarInputStep = playbackBarClientReady ? 1 : 100;
  const playbackBarMax = totalTime || 1;
  const playbackBarValue = Math.min(currentTime, playbackBarMax);
  const playbackBarProgressPercent = (playbackBarValue / playbackBarMax) * 100;
  const playbackBarProgress = playbackBarProgressPercent.toFixed(1);
  const playbackBarFillShadow =
    playbackBarProgressPercent >= LIVE_PLAYBACK_PROGRESS_RIGHT_EDGE_HIDE_PERCENT
      ? LIVE_PLAYBACK_PROGRESS_SHADOW
      : `${LIVE_PLAYBACK_PROGRESS_RIGHT_EDGE_SHADOW}, ${LIVE_PLAYBACK_PROGRESS_SHADOW}`;

  const activeStepIndex = getPlaybackStepIndex(steps?.steps, replayStartMs, currentTime);
  const currentStep = steps && activeStepIndex >= 0 ? steps.steps[activeStepIndex] : undefined;
  const currentStepLabel = currentStep ? `Step ${activeStepIndex + 1}` : "";
  const currentStepTitle = currentStep?.title ?? "";
  const stepList =
    steps?.steps.map((step, index) => {
      const isActive = index === activeStepIndex;
      const { startMs, endMs } = getStepRelativeTime(step, replayStartMs);
      const timeMs = startMs ?? endMs;
      return {
        stepId: step.stepId,
        label: `${index + 1}`,
        title: step.title,
        isActive,
        timeMs,
        dotClassName:
          step.status === "failed"
            ? "bg-[color(display-p3_0.988_0.153_0.184)]"
            : step.status === "passed"
              ? "bg-[color(display-p3_0.249_0.701_0.193)]"
              : "bg-[color(display-p3_0.787_0.787_0.787)]",
      };
    }) ?? [];
  stepNavigationRef.current = (direction) => {
    if (!hasEvents) return;
    const navigableStepIndices = stepList.flatMap((step, index) =>
      step.timeMs !== undefined ? [index] : [],
    );
    if (navigableStepIndices.length === 0) return;

    const currentNavigablePosition = navigableStepIndices.findIndex(
      (index) => index === activeStepIndex,
    );
    if (currentNavigablePosition === -1) {
      if (direction === "down") {
        const firstStepIndex = navigableStepIndices[0];
        const firstStep = stepList[firstStepIndex];
        if (firstStep?.timeMs !== undefined) {
          seekTo(firstStep.timeMs);
        }
      }
      return;
    }

    const stepOffset = direction === "down" ? 1 : -1;
    const nextPosition = Math.min(
      Math.max(currentNavigablePosition + stepOffset, 0),
      navigableStepIndices.length - 1,
    );
    const nextStepIndex = navigableStepIndices[nextPosition];
    if (nextStepIndex === activeStepIndex) return;

    const nextStep = stepList[nextStepIndex];
    if (nextStep?.timeMs !== undefined) {
      seekTo(nextStep.timeMs);
    }
  };
  stepJumpRef.current = (stepNumber) => {
    if (!hasEvents || stepNumber < 1) return;
    const targetStep = stepList[stepNumber - 1];
    if (targetStep?.timeMs !== undefined) {
      seekTo(targetStep.timeMs);
    }
  };
  const seekToDraggedStepListItem = (element: EventTarget | null) => {
    if (!(element instanceof HTMLElement)) return false;

    const stepButton = element.closest<HTMLElement>(
      "[data-replay-step-id][data-replay-step-time-ms]",
    );
    const stepId = stepButton?.dataset.replayStepId;
    const stepTimeMs = stepButton?.dataset.replayStepTimeMs;
    if (!stepId || !stepTimeMs) return false;
    if (stepListDraggedStepIdRef.current === stepId) return true;

    stepListDraggedStepIdRef.current = stepId;
    seekTo(Number(stepTimeMs));
    return true;
  };
  const finishStepListPointerInteraction = (target?: HTMLDivElement, pointerId?: number) => {
    if (!stepListPointerActiveRef.current) return;

    stepListPointerActiveRef.current = false;
    stepListDraggedStepIdRef.current = undefined;

    if (target && pointerId !== undefined && target.hasPointerCapture(pointerId)) {
      target.releasePointerCapture(pointerId);
    }
  };
  const handleStepListPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse" || !hasEvents) return;

    event.preventDefault();
    stepListPointerActiveRef.current = true;
    stepListDraggedStepIdRef.current = undefined;
    event.currentTarget.setPointerCapture(event.pointerId);
    seekToDraggedStepListItem(event.target);
  };
  const handleStepListPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!stepListPointerActiveRef.current) return;
    if (event.buttons === 0) {
      finishStepListPointerInteraction(event.currentTarget, event.pointerId);
      return;
    }

    seekToDraggedStepListItem(document.elementFromPoint(event.clientX, event.clientY));
  };
  const handleStepListPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    finishStepListPointerInteraction(event.currentTarget, event.pointerId);
  };
  const handleStepListPointerCancel = (event: React.PointerEvent<HTMLDivElement>) => {
    finishStepListPointerInteraction(event.currentTarget, event.pointerId);
  };
  const handleStepListLostPointerCapture = () => {
    finishStepListPointerInteraction();
  };
  const playbackBarFillVisible = hasEvents && playbackBarValue > 0;
  const browserFrameSurfaceStyle =
    browserFrameBackground !== undefined ? { background: browserFrameBackground } : undefined;
  const playbackBarFillClassName =
    playbackBarValue >= playbackBarMax ? "rounded-full" : "rounded-l-full";
  const playbackBarMarkerCount = Math.max(
    0,
    Math.floor((playbackBarMax - 1) / LIVE_PLAYBACK_BAR_MARKER_INTERVAL_MS),
  );
  const playbackBarMarkerPositions = Array.from(
    { length: playbackBarMarkerCount },
    (_, index) => `${(((index + 1) / (playbackBarMarkerCount + 1)) * 100).toFixed(2)}%`,
  );
  const visiblePlaybackBarMarkerPositions = playbackBarMarkerPositions.slice(1);
  const playbackStepMarkers =
    steps && replayStartMs !== 0
      ? steps.steps.slice(1).flatMap((step, index) => {
          if (step.status !== "passed" && step.status !== "failed") return [];

          const { startMs, endMs } = getStepRelativeTime(step, replayStartMs);
          const markerTimeMs = startMs ?? endMs;
          if (markerTimeMs === undefined) return [];

          const markerPercent = Math.min(
            Math.max((markerTimeMs / playbackBarMax) * 100, 0),
            100,
          ).toFixed(2);

          return [
            {
              stepId: step.stepId,
              timeMs: markerTimeMs,
              title: step.title,
              label: `${index + 2}`,
              status: step.status,
              left: `clamp(12px, ${markerPercent}%, calc(100% - 12px))`,
            },
          ];
        })
      : [];
  const showFirstStepLabel = Boolean(steps && steps.steps.length > 0);
  const firstPlaybackStep = stepList[0];
  const firstPlaybackStepTimeMs = firstPlaybackStep?.timeMs;
  const firstPlaybackStepLabelDisabled = !hasEvents || firstPlaybackStepTimeMs === undefined;
  const playbackStepLabelClassName =
    "pointer-events-auto absolute top-full -mt-[17px] h-4.5 appearance-none bg-transparent p-0 [letter-spacing:0em] font-['SFProDisplay-Semibold','SF_Pro_Display',system-ui,sans-serif] text-[11.5px]/4.5 font-semibold text-[color(display-p3_0.553_0.553_0.553)] transition-opacity duration-150 ease-out hover:opacity-70 focus-visible:opacity-70 disabled:cursor-default disabled:opacity-50";
  const playbackBar = (
    <input
      type="range"
      value={playbackBarValue}
      min={0}
      max={playbackBarMax}
      step={playbackBarInputStep}
      disabled={!hasEvents}
      onChange={handleSeek}
      onPointerDown={handlePlaybackBarPointerDown}
      onPointerMove={handlePlaybackBarPointerMove}
      onPointerUp={handlePlaybackBarPointerUp}
      onPointerCancel={handlePlaybackBarPointerCancel}
      onLostPointerCapture={handlePlaybackBarLostPointerCapture}
      className="absolute inset-0 z-10 h-full w-full cursor-pointer appearance-none rounded-full bg-transparent outline-none disabled:cursor-default [&::-moz-range-thumb]:size-0 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:border-0 [&::-moz-range-track]:h-full [&::-moz-range-track]:rounded-full [&::-moz-range-track]:border-0 [&::-moz-range-track]:bg-transparent [&::-webkit-slider-thumb]:size-0 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-runnable-track]:h-full [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-transparent"
    />
  );

  return (
    <div
      data-rrweb-block
      className="flex h-screen flex-col gap-2 bg-[color(display-p3_0.986_0.986_0.986)] p-2 sm:p-4 md:gap-3 md:p-6"
    >
      <div
        ref={viewerShellRef}
        className="flex h-0 grow flex-col overflow-hidden rounded-xl border-4 border-solid border-[color(display-p3_1_1_1)] bg-[color(display-p3_0.977_0.977_0.977)] md:flex-row md:rounded-[26px] md:border-[7px]"
        style={{ boxShadow: VIEWER_SHELL_SHADOW }}
      >
        {stepList.length > 0 && (
          <div className="order-2 flex max-h-28 w-full px-2.5 pt-0 pb-2 md:order-none md:max-h-none md:w-72 md:shrink-0 md:pt-2.5 md:pr-6 md:pb-6">
            <div
              className="min-h-0 w-full overflow-y-auto select-none"
              onPointerDown={handleStepListPointerDown}
              onPointerMove={handleStepListPointerMove}
              onPointerUp={handleStepListPointerUp}
              onPointerCancel={handleStepListPointerCancel}
              onLostPointerCapture={handleStepListLostPointerCapture}
            >
              <div className="flex flex-col p-[1px]">
                {stepList.map((step) => (
                  <button
                    type="button"
                    key={step.stepId}
                    onClick={() => {
                      if (step.timeMs === undefined) return;
                      seekTo(step.timeMs);
                    }}
                    disabled={step.timeMs === undefined || !hasEvents}
                    aria-label={`Step ${step.label}: ${step.title}`}
                    data-replay-step-id={step.stepId}
                    data-replay-step-time-ms={step.timeMs}
                    className="[font-synthesis:none] group/replay-step relative w-full py-[3px] text-left antialiased disabled:cursor-default disabled:opacity-50"
                  >
                    <div className="relative flex w-full items-center gap-1.75 rounded-[11px] px-3 py-1.5 transition-colors duration-150 ease-out group-hover/replay-step:bg-white/65 group-focus-visible/replay-step:bg-white/65">
                      {step.isActive && (
                        <motion.div
                          layoutId="active-replay-step-background"
                          transition={ACTIVE_STEP_CARD_TRANSITION}
                          className="pointer-events-none absolute inset-0 rounded-[11px] bg-[color(display-p3_1_1_1)] will-change-transform"
                          style={{ boxShadow: ACTIVE_STEP_CARD_SHADOW }}
                        />
                      )}
                      <div
                        className={`relative z-10 size-2 shrink-0 rounded-full ${step.dotClassName}`}
                      />
                      <div className="relative z-10 flex min-w-0 items-start gap-1.5">
                        <div className="[letter-spacing:0em] shrink-0 font-['SFProDisplay-Semibold','SF_Pro_Display',system-ui,sans-serif] text-[13px]/4.5 font-semibold text-[color(display-p3_0.587_0.587_0.587)]">
                          {step.label}
                        </div>
                        <div
                          title={step.title}
                          className={`min-w-0 truncate [letter-spacing:0em] font-['SFProDisplay-Medium','SF_Pro_Display',system-ui,sans-serif] text-[13px]/4.5 font-medium transition-colors duration-150 ease-out ${
                            step.isActive
                              ? "text-[color(display-p3_0.188_0.188_0.188)]"
                              : "text-[color(display-p3_0.332_0.332_0.332)] group-hover/replay-step:text-[color(display-p3_0.188_0.188_0.188)] group-focus-visible/replay-step:text-[color(display-p3_0.188_0.188_0.188)]"
                          }`}
                        >
                          {step.title}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        <div className="relative order-1 min-h-0 min-w-0 flex-1 md:order-none">
          <div
            className="absolute inset-0 cursor-pointer p-2 md:p-6"
            style={REPLAY_BACKDROP_STYLE}
            onClick={handlePlay}
          >
            <div
              className="glow-pulse pointer-events-none absolute inset-0"
              style={{
                boxShadow: "inset 0 0 120px 40px rgba(96, 165, 250, 0.35)",
              }}
            />
            <MacWindow surfaceStyle={browserFrameSurfaceStyle}>
              <div ref={replayRef} className="relative h-full w-full overflow-hidden" />
            </MacWindow>
          </div>
          <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-end justify-end gap-2 p-2 md:p-5">
            <AnimatePresence mode="popLayout">
              {visibleActions.map((action) => (
                <motion.div
                  key={action.id}
                  layout
                  initial={{ opacity: 0, y: 16, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
                  className="max-w-48 truncate rounded-xl bg-[#1c1c1c] px-3 py-2 text-sm font-medium text-white shadow-xl md:max-w-80 md:px-4 md:py-3 md:text-base"
                  style={{ fontFamily: CONTROL_FONT_FAMILY }}
                >
                  {action.label}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
          {!hasEvents && (
            <div
              className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4"
              style={{ fontFamily: CONTROL_FONT_FAMILY }}
            >
              {live && (
                <span className="text-shimmer text-sm font-medium">
                  Waiting for browser session...
                </span>
              )}
              {!live && (
                <span className="text-sm font-medium text-white/90 drop-shadow-sm">No events</span>
              )}
            </div>
          )}
        </div>
      </div>

      <div
        className={`flex flex-col gap-2 rounded-[28px] px-3 pt-2 pb-3 md:gap-3 md:pr-6 md:pt-3 md:pb-5 ${stepList.length > 0 ? "md:pl-[295px]" : "md:pl-6"}`}
        style={{ fontFamily: CONTROL_FONT_FAMILY }}
      >
        <div className="mt-1 flex items-center justify-between gap-2 p-0 antialiased [font-synthesis:none] md:mt-1.5 md:gap-4">
          <div className="flex min-w-0 items-center gap-1.5">
            {!currentStepLabel && !currentStepTitle && live && (
              <div className="h-5.5 shrink-0 font-['SFProDisplay-Medium','SF_Pro_Display',system-ui,sans-serif] text-sm/5.5 font-medium tracking-[0em] text-[color(display-p3_0.587_0.587_0.587)] md:text-lg/5.5">
                Waiting for steps...
              </div>
            )}
            {currentStepLabel && (
              <Calligraph
                as="div"
                autoSize={false}
                className="h-5.5 shrink-0 font-['SFProDisplay-Medium','SF_Pro_Display',system-ui,sans-serif] text-sm/5.5 font-medium tracking-[0em] text-[color(display-p3_0.587_0.587_0.587)] md:text-lg/5.5"
              >
                {currentStepLabel}
              </Calligraph>
            )}
            {currentStepTitle && (
              <div className="min-w-0 truncate font-['SFProDisplay-Medium','SF_Pro_Display',system-ui,sans-serif] text-sm/5.5 font-medium tracking-[0em] text-[color(display-p3_0.188_0.188_0.188)] md:text-lg/5.5">
                {currentStepTitle}
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1.5 md:gap-3">
            <span className="inline-flex items-center gap-1.5 text-[13px] leading-4.5 font-medium tracking-[0em] tabular-nums text-[color(display-p3_0.361_0.361_0.361)] md:gap-2.5 md:text-[15px]">
              <Calligraph variant="number" autoSize={false} className="tabular-nums">
                {timeLabel}
              </Calligraph>
              {(!live || !isAtLiveEdge) && (
                <>
                  <span className="text-[color(display-p3_0.727_0.727_0.727)]">/</span>
                  <span>{totalTimeLabel}</span>
                </>
              )}
            </span>
            {live && (
              <button
                type="button"
                onClick={() => seekTo(totalTime)}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-red-500/10 px-2.5 py-1 transition-opacity hover:bg-red-500/20 active:scale-[0.97]"
              >
                <span
                  className={`size-1.5 rounded-full bg-red-500 ${isAtLiveEdge ? "animate-pulse" : ""}`}
                />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-red-500">
                  Live
                </span>
              </button>
            )}
            <div className="flex items-center gap-1">
              <select
                value={`${speed}`}
                onChange={handleSpeedChange}
                disabled={!hasEvents}
                aria-label="Replay speed"
                className="cursor-pointer appearance-none rounded-full bg-transparent px-1.5 py-1 text-[13px] font-medium text-[color(display-p3_0.361_0.361_0.361)] outline-none disabled:cursor-default disabled:opacity-40 md:px-2 md:text-[15px]"
                style={{ fontFamily: CONTROL_FONT_FAMILY }}
              >
                {SPEEDS.map((supportedSpeed) => (
                  <option key={supportedSpeed} value={`${supportedSpeed}`}>
                    {supportedSpeed}x
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={handleFullscreen}
                aria-label="Toggle fullscreen"
                className="flex size-9 items-center justify-center rounded-full text-[#919191] transition-transform duration-150 ease-out active:scale-[0.97]"
              >
                <FullscreenIcon className="h-auto w-5 shrink-0" />
              </button>
            </div>
          </div>
        </div>

        <motion.div
          ref={playbackBarRef}
          className={playbackBarWrapperClassName}
          style={
            playbackBarClientReady
              ? {
                  width: playbackBarRubberBandWidth,
                  x: playbackBarRubberBandX,
                }
              : undefined
          }
        >
          <div
            className={playbackBarTrackClassName}
            style={{
              backgroundColor: LIVE_PLAYBACK_BAR_SURFACE_COLOR,
              boxShadow: LIVE_PLAYBACK_BAR_SHADOW,
            }}
          >
            <div className="absolute inset-0 overflow-hidden rounded-full">
              {playbackBarFillVisible && (
                <div
                  className={`pointer-events-none absolute inset-y-0 left-0 ${playbackBarFillClassName}`}
                  style={{
                    width: `${playbackBarProgress}%`,
                    boxShadow: playbackBarFillShadow,
                    backgroundImage: LIVE_PLAYBACK_PROGRESS_BACKGROUND_IMAGE,
                  }}
                />
              )}
              {visiblePlaybackBarMarkerPositions.map((markerPosition) => (
                <div
                  key={markerPosition}
                  className="pointer-events-none absolute top-1/2 z-[1] h-2.75 w-px -translate-x-1/2 -translate-y-1/2 rounded-full bg-[color(display-p3_0.882_0.882_0.882)]"
                  style={{ left: markerPosition }}
                />
              ))}
              {playbackStepMarkers.map((marker) => (
                <Tooltip key={marker.stepId}>
                  <TooltipTrigger
                    type="button"
                    data-step-status-marker={marker.status}
                    aria-label={marker.title}
                    onClick={() => {
                      seekTo(marker.timeMs);
                    }}
                    className="pointer-events-auto absolute top-1/2 z-[15] size-4 -translate-x-1/2 -translate-y-1/2 appearance-none rounded-[4.5px] border-[3px] border-solid border-[color(display-p3_1_1_1)] bg-origin-border p-0 outline-none transition-transform duration-150 ease-out will-change-transform hover:scale-[1.08]"
                    style={{
                      left: marker.left,
                      rotate: "315deg",
                      outline:
                        marker.status === "passed"
                          ? LIVE_PASSED_STEP_MARKER_OUTLINE
                          : LIVE_FAILED_STEP_MARKER_OUTLINE,
                      backgroundImage:
                        marker.status === "passed"
                          ? LIVE_PASSED_STEP_MARKER_BACKGROUND_IMAGE
                          : LIVE_FAILED_STEP_MARKER_BACKGROUND_IMAGE,
                    }}
                  />
                  <TooltipContent side="top" sideOffset={12}>
                    {marker.title}
                  </TooltipContent>
                </Tooltip>
              ))}
              {playbackBar}
            </div>
            <button
              type="button"
              onClick={handlePlay}
              disabled={!canPlay}
              aria-label={playing ? "Pause replay" : "Play replay"}
              className={`absolute inset-y-1.5 left-1.5 z-[30] flex w-12.75 items-center justify-center gap-0 rounded-full bg-white px-2.75 py-0.75 text-[#2F2F2F] ${playbackBarButtonVisibilityClassName} active:scale-[0.97]`}
              style={{ boxShadow: LIVE_PLAYBACK_BAR_BUTTON_SHADOW }}
            >
              {playing && <PauseIcon className="h-[12px] w-auto" />}
              {!playing && <PlayIcon className="h-[21px] w-auto" />}
            </button>
          </div>
          {playbackStepMarkers.map((marker) => (
            <button
              type="button"
              key={`${marker.stepId}-label`}
              onClick={() => {
                seekTo(marker.timeMs);
              }}
              disabled={!hasEvents}
              aria-label={`Jump to step ${marker.label}: ${marker.title}`}
              className={`${playbackStepLabelClassName} -translate-x-1/2`}
              style={{ left: marker.left }}
            >
              {marker.label}
            </button>
          ))}
          {showFirstStepLabel && (
            <button
              type="button"
              onClick={() => {
                if (firstPlaybackStepTimeMs === undefined) return;
                seekTo(firstPlaybackStepTimeMs);
              }}
              disabled={firstPlaybackStepLabelDisabled}
              aria-label={`Jump to step 1: ${firstPlaybackStep?.title ?? "Step 1"}`}
              className={`${playbackStepLabelClassName} left-0`}
            >
              1
            </button>
          )}
        </motion.div>
      </div>
    </div>
  );
};
