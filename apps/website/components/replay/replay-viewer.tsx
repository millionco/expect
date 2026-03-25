"use client";

import { Calligraph } from "calligraph";
import { useEffect, useRef, useState } from "react";
import type { eventWithTime } from "@posthog/rrweb";
import type { Replayer } from "@posthog/rrweb";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatTime } from "@/lib/format-time";
import { createCursorZoom } from "@/lib/cursor-zoom";

import { useMountEffect } from "@/hooks/use-mount-effect";
import { MacWindow } from "@/components/replay/mac-window";
import type { ViewerRunState, ViewerStepEvent } from "@/lib/replay-types";

const SPEEDS = [1, 2, 4, 8] as const;
const TIMER_INTERVAL_MS = 100;
const IDLE_THRESHOLD_MS = 4000;
const IDLE_SPEED_TIERS = [
  { afterMs: 0, speed: 2 },
  { afterMs: 8000, speed: 4 },
  { afterMs: 20000, speed: 8 },
  { afterMs: 40000, speed: 16 },
] as const;
const CONTROL_BUTTON_SHADOW = [
  "color(display-p3 0 0 0 / 12%) 0px 0px 0px 1px",
  "color(display-p3 0.752 0.752 0.752 / 12%) 0px 2px 2px",
].join(", ");
const LIVE_PLAYBACK_BAR_SHADOW =
  "color(display-p3 0.281 0.281 0.281 / 16%) 0px 0px 0px 1px";
const LIVE_PLAYBACK_BAR_BUTTON_SHADOW =
  "color(display-p3 0.847 0.847 0.847) 0px 0px 0px 0.5px";
const LIVE_PLAYBACK_BAR_MARKER_INTERVAL_MS = 10_000;
const LIVE_PASSED_STEP_MARKER_OUTLINE =
  "2px solid color(display-p3 0.249 0.701 0.193 / 30%)";
const LIVE_PASSED_STEP_MARKER_BACKGROUND_IMAGE =
  "linear-gradient(in oklab 180deg, oklab(66.4% -0.197 0.139) 0%, oklab(72.7% -0.252 0.178) 100%)";
const LIVE_FAILED_STEP_MARKER_OUTLINE = "2px solid #FC272F4D";
const LIVE_FAILED_STEP_MARKER_BACKGROUND_IMAGE =
  "linear-gradient(in oklab 180deg, oklab(63.6% 0.216 0.107) 0%, oklab(67.1% 0.194 0.096) 100%)";
const LIVE_PLAYBACK_PROGRESS_SHADOW =
  "color(display-p3 0.615 0.615 0.615 / 20%) 0px 0px 3px";
const VIEWER_SHELL_SHADOW = "color(display-p3 0.788 0.788 0.788 / 20%) 0px 2px 3px";
const CONTROL_FONT_FAMILY =
  '"SF Pro Display", "SFProDisplay-Medium", "Inter Variable", system-ui, sans-serif';
const PAPER_TIME_LENGTH = 5;
const PLAYBACK_BAR_TRACK_COLOR = "color(display-p3 0.897 0.897 0.897)";
const LIVE_PLAYBACK_BAR_SURFACE_COLOR = "color(display-p3 0.971 0.971 0.971)";
const LIVE_PLAYBACK_PROGRESS_BACKGROUND_IMAGE =
  "linear-gradient(in oklab 180deg, oklab(100% 0 0) 0%, oklab(100% 0 0 / 61%) 100%)";

const getReplayDuration = (replayEvents: eventWithTime[]) => {
  if (replayEvents.length < 2) return 0;

  return Math.max(replayEvents[replayEvents.length - 1].timestamp - replayEvents[0].timestamp, 0);
};

const formatPaperTime = (timeMs: number) => formatTime(timeMs).padStart(PAPER_TIME_LENGTH, "0");

const getStepRelativeTime = (step: ViewerStepEvent, replayStartMs: number) => {
  const startMs = step.startedAtMs !== undefined ? step.startedAtMs - replayStartMs : undefined;
  const endMs = step.endedAtMs !== undefined ? step.endedAtMs - replayStartMs : undefined;
  return { startMs, endMs };
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
  onAddEventsRef?: (handler: (newEvents: eventWithTime[]) => void) => void;
}

export const ReplayViewer = ({
  events,
  steps,
  live = false,
  onAddEventsRef,
}: ReplayViewerProps) => {
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const backdropRef = useRef<HTMLDivElement>(null);
  const replayRef = useRef<HTMLDivElement>(null);
  const viewerShellRef = useRef<HTMLDivElement>(null);
  const replayerRef = useRef<Replayer | undefined>(undefined);
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const cleanupZoomRef = useRef<(() => void) | undefined>(undefined);
  const autoPlayTriggeredRef = useRef(false);
  const liveRef = useRef(live);
  liveRef.current = live;
  const isIdleSpeedRef = useRef(false);
  const userSpeedRef = useRef<(typeof SPEEDS)[number]>(1);
  const lastCursorPosRef = useRef("");
  const idleTicksRef = useRef(0);
  const cleanupIdleObserverRef = useRef<(() => void) | undefined>(undefined);

  const destroyReplay = () => {
    clearInterval(timerRef.current);
    timerRef.current = undefined;
    cleanupIdleObserverRef.current?.();
    cleanupIdleObserverRef.current = undefined;
    cleanupZoomRef.current?.();
    cleanupZoomRef.current = undefined;
    replayerRef.current?.destroy();
    replayerRef.current = undefined;
  };

  const startTimer = () => {
    clearInterval(timerRef.current);
    idleTicksRef.current = 0;
    timerRef.current = setInterval(() => {
      const replayer = replayerRef.current;
      if (!replayer) return;

      const time = replayer.getCurrentTime();
      setCurrentTime(time);

      if (liveRef.current) return;

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
    return () => {
      destroyReplay();
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
    if (autoPlayTriggeredRef.current || !live || replayerRef.current || events.length < 2) return;
    autoPlayTriggeredRef.current = true;
    handlePlay();
  }, [live, events.length]);

  const setupScalingAndZoom = () => {
    if (!replayRef.current || !backdropRef.current) return undefined;

    const replayContainer = replayRef.current;
    const wrapper = replayContainer.querySelector(".replayer-wrapper") as HTMLElement | undefined;
    if (!wrapper) return undefined;

    const iframe = wrapper.querySelector("iframe");
    if (!iframe) return undefined;

    const backdrop = backdropRef.current;
    const zoomContainer = backdrop.parentElement;

    let currentFitScale = 1;
    let currentCenterX = 0;
    let currentCenterY = 0;

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

      currentFitScale = fitScale;
      currentCenterX = centerX;
      currentCenterY = centerY;

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

    let cleanupCursorZoom: (() => void) | undefined;

    const cursorEl = wrapper.querySelector(".replayer-mouse") as HTMLElement | undefined;
    if (cursorEl) {
      cleanupIdleObserverRef.current = setupIdleSpeedObserver(cursorEl);
    }
    if (cursorEl && zoomContainer) {
      cleanupCursorZoom = createCursorZoom(zoomContainer, backdrop, cursorEl, {
        mapCursor: (x, y) => {
          const backdropRect = backdrop.getBoundingClientRect();
          const replayRect = replayContainer.getBoundingClientRect();
          return {
            x: x * currentFitScale + currentCenterX + (replayRect.left - backdropRect.left),
            y: y * currentFitScale + currentCenterY + (replayRect.top - backdropRect.top),
          };
        },
      });
    }

    return () => {
      resizeObserver.disconnect();
      iframeObserver.disconnect();
      cleanupCursorZoom?.();
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

    const startTime = liveRef.current ? replayDuration : Math.min(currentTime, replayDuration);
    setCurrentTime(startTime);
    replayer.play(startTime);
    setPlaying(true);
    startTimer();

    cleanupZoomRef.current = setupScalingAndZoom();
  };

  const seekTo = (timeMs: number) => {
    setCurrentTime(timeMs);

    const replayer = replayerRef.current;
    if (!replayer) return;

    if (playing) {
      replayer.play(timeMs);
      startTimer();
      return;
    }

    replayer.pause(timeMs);
  };

  const handleSeek = (event: React.ChangeEvent<HTMLInputElement>) => {
    seekTo(Number(event.target.value));
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

  const totalTime = getReplayDuration(events);
  const replayStartMs =
    events.length > 0 ? events[0].timestamp : (steps?.steps[0]?.startedAtMs ?? 0);
  const hasEvents = events.length > 1;
  const canPlay = hasEvents;
  const timeLabel = formatPaperTime(currentTime);
  const totalTimeLabel = formatPaperTime(totalTime);
  const playbackBarMax = totalTime || 1;
  const playbackBarValue = Math.min(currentTime, playbackBarMax);
  const playbackBarProgressPercent = (playbackBarValue / playbackBarMax) * 100;
  const playbackBarProgress = playbackBarProgressPercent.toFixed(1);

  const currentStepForLabel = (() => {
    if (!steps || replayStartMs === 0) return undefined;
    for (let index = steps.steps.length - 1; index >= 0; index--) {
      const { startMs } = getStepRelativeTime(steps.steps[index], replayStartMs);
      if (startMs !== undefined && currentTime >= startMs) {
        return { index, step: steps.steps[index] };
      }
    }
    return undefined;
  })();

  const stepLabel = currentStepForLabel ? `Step ${currentStepForLabel.index + 1}` : "";
  const stepTitle = currentStepForLabel ? currentStepForLabel.step.title : "";
  let playbackBarBackground: string | undefined;
  if (!live && hasEvents) {
    playbackBarBackground = `linear-gradient(to right, oklch(0.345 0 0) 0%, oklch(0.431 0 0) ${playbackBarProgress}%, ${PLAYBACK_BAR_TRACK_COLOR} ${playbackBarProgress}%, ${PLAYBACK_BAR_TRACK_COLOR} 100%)`;
  }
  const livePlaybackBarFillVisible = live && hasEvents && playbackBarValue > 0;
  const livePlaybackBarFillClassName =
    playbackBarValue >= playbackBarMax ? "rounded-full" : "rounded-l-full";
  const livePlaybackBarMarkerCount = live
    ? Math.max(0, Math.floor((playbackBarMax - 1) / LIVE_PLAYBACK_BAR_MARKER_INTERVAL_MS))
    : 0;
  const livePlaybackBarMarkerPositions = Array.from(
    { length: livePlaybackBarMarkerCount },
    (_, index) =>
      `${(((index + 1) / (livePlaybackBarMarkerCount + 1)) * 100).toFixed(2)}%`,
  );
  const visibleLivePlaybackBarMarkerPositions = livePlaybackBarMarkerPositions.slice(1);
  const livePlaybackStepMarkers =
    live && steps && replayStartMs !== 0
      ? steps.steps.flatMap((step, index) => {
          if (step.status !== "passed" && step.status !== "failed") return [];

          const { startMs, endMs } = getStepRelativeTime(step, replayStartMs);
          const markerTimeMs = endMs ?? startMs;
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
  const showFirstStepLabel = live && Boolean(steps && steps.steps.length > 0);
  const playbackBarClassName = [
    "w-full cursor-pointer appearance-none rounded-full outline-none disabled:cursor-default",
    live
      ? "absolute inset-0 z-10 h-full bg-transparent [&::-moz-range-thumb]:size-0 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:border-0 [&::-moz-range-track]:h-full [&::-moz-range-track]:rounded-full [&::-moz-range-track]:border-0 [&::-moz-range-track]:bg-transparent [&::-webkit-slider-thumb]:size-0 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-runnable-track]:h-full [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-transparent"
      : "h-1.5 rounded-full bg-[color(display-p3_0.897_0.897_0.897)] [&::-moz-range-thumb]:size-0 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:border-0 [&::-moz-range-track]:h-1.5 [&::-moz-range-track]:rounded-full [&::-webkit-slider-thumb]:size-0 [&::-webkit-slider-thumb]:appearance-none",
  ].join(" ");
  const playbackBar = (
    <input
      type="range"
      value={playbackBarValue}
      min={0}
      max={playbackBarMax}
      step={100}
      disabled={!hasEvents}
      onChange={handleSeek}
      className={playbackBarClassName}
      style={playbackBarBackground ? { background: playbackBarBackground } : undefined}
    />
  );

  return (
    <div
      data-rrweb-block
      className="flex h-screen flex-col gap-3 bg-[color(display-p3_0.986_0.986_0.986)] p-6"
    >
      <div
        ref={viewerShellRef}
        className="relative h-0 grow overflow-hidden rounded-[26px] border-[7px] border-solid border-[color(display-p3_1_1_1)] bg-[color(display-p3_0.977_0.977_0.977)]"
        style={{ boxShadow: VIEWER_SHELL_SHADOW }}
      >
        <div
          ref={backdropRef}
          className="absolute inset-0 bg-linear-to-br from-sky-200 to-blue-400 p-6"
        >
          <MacWindow>
            <div
              ref={replayRef}
              className="relative h-full w-full overflow-hidden"
            />
          </MacWindow>
        </div>
      </div>

      <div
        className="flex flex-col gap-3 rounded-[28px] px-6 py-5"
        style={{ fontFamily: CONTROL_FONT_FAMILY }}
      >
        {(stepLabel || stepTitle || live) && (
          <div className="mt-1.5 flex items-center justify-between gap-4 p-0 antialiased [font-synthesis:none]">
            <div className="flex min-w-0 items-center gap-1.5">
              {stepLabel && (
                <Calligraph
                  as="div"
                  autoSize={false}
                  className="h-4.5 shrink-0 font-['SFProDisplay-Medium','SF_Pro_Display',system-ui,sans-serif] text-base/4.5 font-medium tracking-[0em] text-[color(display-p3_0.587_0.587_0.587)]"
                >
                  {stepLabel}
                </Calligraph>
              )}
              {stepTitle && (
                <div className="h-4.5 shrink-0 font-['SFProDisplay-Medium','SF_Pro_Display',system-ui,sans-serif] text-base/4.5 font-medium tracking-[0em] text-[color(display-p3_0.188_0.188_0.188)]">
                  {stepTitle}
                </div>
              )}
            </div>
            {live && (
              <div className="flex shrink-0 items-center gap-3">
                <span className="inline-flex items-center gap-2.5 text-[15px] leading-4.5 font-medium tracking-[0em] tabular-nums text-[color(display-p3_0.361_0.361_0.361)]">
                  <Calligraph variant="number" autoSize={false} className="tabular-nums">
                    {timeLabel}
                  </Calligraph>
                  <span className="text-[color(display-p3_0.727_0.727_0.727)]">
                    /
                  </span>
                  <span>{totalTimeLabel}</span>
                </span>
                <div className="flex items-center gap-1">
                  <select
                    value={`${speed}`}
                    onChange={handleSpeedChange}
                    disabled={!hasEvents}
                    aria-label="Replay speed"
                    className="cursor-pointer appearance-none rounded-full bg-transparent px-2 py-1 text-[15px] font-medium text-[color(display-p3_0.361_0.361_0.361)] outline-none disabled:cursor-default disabled:opacity-40"
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
            )}
          </div>
        )}

        {live && (
          <div className="relative pb-6">
            <div
              className="relative h-9.75 overflow-hidden rounded-full"
              style={{
                backgroundColor: LIVE_PLAYBACK_BAR_SURFACE_COLOR,
                boxShadow: LIVE_PLAYBACK_BAR_SHADOW,
              }}
            >
              <div className="absolute inset-0 overflow-hidden rounded-full">
                {livePlaybackBarFillVisible && (
                  <div
                    className={`pointer-events-none absolute inset-y-0 left-0 ${livePlaybackBarFillClassName}`}
                    style={{
                      width: `${playbackBarProgress}%`,
                      boxShadow: LIVE_PLAYBACK_PROGRESS_SHADOW,
                      backgroundImage: LIVE_PLAYBACK_PROGRESS_BACKGROUND_IMAGE,
                    }}
                  />
                )}
                {visibleLivePlaybackBarMarkerPositions.map((markerPosition) => (
                  <div
                    key={markerPosition}
                    className="pointer-events-none absolute top-1/2 z-[1] h-2.75 w-px -translate-x-1/2 -translate-y-1/2 rounded-full bg-[color(display-p3_0.882_0.882_0.882)]"
                    style={{ left: markerPosition }}
                  />
                ))}
                {livePlaybackStepMarkers.map((marker) => (
                  <Tooltip key={marker.stepId}>
                    <TooltipTrigger
                      type="button"
                      data-step-status-marker={marker.status}
                      aria-label={marker.title}
                      onClick={() => {
                        seekTo(marker.timeMs)
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
                className="absolute inset-y-1.5 left-1.5 z-[30] flex w-12.75 items-center justify-center gap-0 rounded-full bg-white px-2.75 py-0.75 text-[#2F2F2F] transition-transform duration-150 ease-out disabled:opacity-40 active:scale-[0.97]"
                style={{ boxShadow: LIVE_PLAYBACK_BAR_BUTTON_SHADOW }}
              >
                {playing && <PauseIcon className="h-[12px] w-auto" />}
                {!playing && <PlayIcon className="h-[21px] w-auto" />}
              </button>
            </div>
            {livePlaybackStepMarkers.map((marker) => (
              <div
                key={`${marker.stepId}-label`}
                className="pointer-events-none absolute top-full -mt-[17px] -translate-x-1/2 [letter-spacing:0em] h-4.5 font-['SFProDisplay-Semibold','SF_Pro_Display',system-ui,sans-serif] text-[11.5px]/4.5 font-semibold text-[color(display-p3_0.553_0.553_0.553)]"
                style={{ left: marker.left }}
              >
                {marker.label}
              </div>
            ))}
            {showFirstStepLabel && (
              <div className="pointer-events-none absolute top-full left-0 -mt-[17px] [letter-spacing:0em] h-4.5 font-['SFProDisplay-Semibold','SF_Pro_Display',system-ui,sans-serif] text-[11.5px]/4.5 font-semibold text-[color(display-p3_0.553_0.553_0.553)]">
                1
              </div>
            )}
          </div>
        )}
        {!live && playbackBar}

        {!live && (
          <div className="flex items-center justify-between gap-6">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handlePlay}
                disabled={!canPlay}
                aria-label={playing ? "Pause replay" : "Play replay"}
                className="flex h-[35px] w-[60px] items-center justify-center rounded-full bg-white text-[color(display-p3_0.196_0.196_0.196)] transition-transform duration-150 ease-out disabled:opacity-40 active:scale-[0.97]"
                style={{ boxShadow: CONTROL_BUTTON_SHADOW }}
              >
                {playing && <PauseIcon className="h-[12px] w-auto" />}
                {!playing && <PlayIcon className="size-[22px]" />}
              </button>

              <span className="inline-flex items-center gap-2.5 pl-2 text-[15px] leading-4.5 font-medium tracking-[0em] tabular-nums text-[color(display-p3_0.361_0.361_0.361)]">
                <span>{timeLabel}</span>
                <span className="text-[color(display-p3_0.727_0.727_0.727)]">
                  /
                </span>
                <span>{totalTimeLabel}</span>
              </span>
            </div>

            <div className="flex items-center gap-1">
              <select
                value={`${speed}`}
                onChange={handleSpeedChange}
                disabled={!hasEvents}
                aria-label="Replay speed"
                className="cursor-pointer appearance-none rounded-full bg-transparent px-2 py-1 text-[15px] font-medium text-[color(display-p3_0.361_0.361_0.361)] outline-none disabled:cursor-default disabled:opacity-40"
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
        )}
      </div>
    </div>
  );
};
