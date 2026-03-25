"use client";

import { useEffect, useRef, useState } from "react";
import type { eventWithTime } from "@posthog/rrweb";
import type { Replayer } from "@posthog/rrweb";
import { formatTime } from "@/lib/format-time";
import { createCursorZoom } from "@/lib/cursor-zoom";

import { useMountEffect } from "@/hooks/use-mount-effect";
import { MacWindow } from "@/components/replay/mac-window";
import type { ViewerRunState, ViewerStepEvent } from "@/lib/replay-types";

const SPEEDS = [1, 2, 4, 8] as const;
const TIMER_INTERVAL_MS = 100;
const IDLE_THRESHOLD_MS = 1000;
const IDLE_SPEED = 2;
const CONTROL_BUTTON_SHADOW = [
  "color(display-p3 0 0 0 / 12%) 0px 0px 0px 1px",
  "color(display-p3 0.752 0.752 0.752 / 12%) 0px 2px 2px",
].join(", ");
const VIEWER_SHELL_SHADOW = [
  "color(display-p3 1 1 1 / 88%) 0px 1px 0px inset",
  "color(display-p3 0 0 0 / 6%) 0px 0px 0px 1px",
].join(", ");
const CONTROL_FONT_FAMILY =
  '"SF Pro Display", "SFProDisplay-Medium", "Inter Variable", system-ui, sans-serif';
const PAPER_TIME_LENGTH = 5;

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

const STEP_COLORS = {
  passed: { bg: "bg-emerald-50", text: "text-emerald-600", icon: "text-emerald-500" },
  failed: { bg: "bg-red-50", text: "text-red-600", icon: "text-red-500" },
  active: { bg: "bg-blue-50", text: "text-neutral-900", icon: "text-blue-500" },
  pending: { bg: "", text: "text-neutral-500", icon: "text-neutral-300" },
} as const;

const STEP_ICONS: Record<string, string> = {
  passed: "\u2713",
  failed: "\u2717",
  active: "\u25CF",
  pending: "\u25CB",
};

const STATUS_BADGE_COLORS: Record<string, string> = {
  running: "bg-blue-100 text-blue-700",
  passed: "bg-emerald-100 text-emerald-700",
  failed: "bg-red-100 text-red-700",
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
      fillRule="evenodd"
      clipRule="evenodd"
      d="M2 2H9.5V4H4V9.5H2V2ZM14.5 2H22V9.5H20V4H14.5V2ZM4 14.5V20H9.5V22H2V14.5H4ZM22 14.5V22H14.5V20H20V14.5H22Z"
      fill="currentColor"
    />
  </svg>
);

interface StepPanelProps {
  steps: ViewerRunState;
  replayStartMs: number;
  currentTime: number;
  onSeek: (timeMs: number) => void;
}

const StepPanel = ({ steps, replayStartMs, currentTime, onSeek }: StepPanelProps) => {
  const currentStepIndex = (() => {
    for (let index = steps.steps.length - 1; index >= 0; index--) {
      const { startMs } = getStepRelativeTime(steps.steps[index], replayStartMs);
      if (startMs !== undefined && currentTime >= startMs) return index;
    }
    return -1;
  })();

  return (
    <div
      className="flex flex-col gap-3 rounded-[20px] bg-white/90 px-5 py-4 backdrop-blur-xl"
      style={{ fontFamily: CONTROL_FONT_FAMILY }}
    >
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold text-neutral-800 leading-tight">
          {steps.title || "Test Run"}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${STATUS_BADGE_COLORS[steps.status] ?? ""}`}
        >
          {steps.status}
        </span>
      </div>
      {steps.summary && <p className="text-xs text-neutral-500 leading-relaxed">{steps.summary}</p>}
      <div className="flex flex-col gap-0.5">
        {steps.steps.map((step, index) => {
          const { startMs } = getStepRelativeTime(step, replayStartMs);
          const isCurrentStep = index === currentStepIndex;
          const colors = STEP_COLORS[step.status] ?? STEP_COLORS.pending;
          const canSeek = startMs !== undefined;

          return (
            <button
              key={step.stepId}
              type="button"
              disabled={!canSeek}
              onClick={() => {
                if (startMs !== undefined) onSeek(startMs);
              }}
              className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-left transition-colors ${
                isCurrentStep ? colors.bg : "hover:bg-neutral-50"
              } ${canSeek ? "cursor-pointer" : "cursor-default"}`}
            >
              <span
                className={`flex size-5 shrink-0 items-center justify-center text-xs font-medium ${colors.icon} ${step.status === "active" ? "animate-pulse" : ""}`}
              >
                {STEP_ICONS[step.status] ?? STEP_ICONS.pending}
              </span>
              <span className="text-neutral-400 text-xs font-medium tabular-nums">
                {index + 1}.
              </span>
              <span className={`font-medium ${isCurrentStep ? colors.text : "text-neutral-600"}`}>
                {step.title}
              </span>
              {startMs !== undefined && (
                <span className="ml-auto shrink-0 text-[11px] tabular-nums text-neutral-300">
                  {formatPaperTime(startMs)}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

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

  const destroyReplay = () => {
    clearInterval(timerRef.current);
    timerRef.current = undefined;
    cleanupZoomRef.current?.();
    cleanupZoomRef.current = undefined;
    replayerRef.current?.destroy();
    replayerRef.current = undefined;
  };

  const findNextEventTime = (currentTimeMs: number) => {
    if (events.length === 0) return undefined;
    const replayStart = events[0].timestamp;
    const absoluteTime = replayStart + currentTimeMs;
    for (const event of events) {
      if (event.timestamp > absoluteTime) return event.timestamp - replayStart;
    }
    return undefined;
  };

  const startTimer = () => {
    clearInterval(timerRef.current);
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

      const nextEventTime = findNextEventTime(time);
      const gap = nextEventTime !== undefined ? nextEventTime - time : 0;
      const shouldIdle = gap > IDLE_THRESHOLD_MS;

      if (shouldIdle && !isIdleSpeedRef.current) {
        isIdleSpeedRef.current = true;
        replayer.setConfig({ speed: IDLE_SPEED });
      } else if (!shouldIdle && isIdleSpeedRef.current) {
        isIdleSpeedRef.current = false;
        replayer.setConfig({ speed: userSpeedRef.current });
      }
    }, TIMER_INTERVAL_MS);
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
    if (!replayRef.current || !backdropRef.current) return;

    const replayContainer = replayRef.current;
    const wrapper = replayContainer.querySelector(".replayer-wrapper") as HTMLElement | undefined;
    if (!wrapper) return;

    const iframe = wrapper.querySelector("iframe");
    if (!iframe) return;

    const recordedWidth = Number(iframe.getAttribute("width")) || iframe.offsetWidth;
    const recordedHeight = Number(iframe.getAttribute("height")) || iframe.offsetHeight;

    if (!recordedWidth || !recordedHeight) return;

    const fitScale = Math.min(
      replayContainer.clientWidth / recordedWidth,
      replayContainer.clientHeight / recordedHeight,
    );

    wrapper.style.position = "absolute";
    wrapper.style.top = "0";
    wrapper.style.left = "0";
    wrapper.style.transformOrigin = "top left";
    wrapper.style.transform = `scale(${fitScale})`;
    wrapper.style.width = `${recordedWidth}px`;
    wrapper.style.height = `${recordedHeight}px`;

    const cursorEl = wrapper.querySelector(".replayer-mouse") as HTMLElement | undefined;
    if (!cursorEl) return;

    const backdrop = backdropRef.current;
    const zoomContainer = backdrop.parentElement;
    if (!zoomContainer) return;

    const backdropRect = backdrop.getBoundingClientRect();
    const replayRect = replayContainer.getBoundingClientRect();
    const offsetX = replayRect.left - backdropRect.left;
    const offsetY = replayRect.top - backdropRect.top;

    cleanupZoomRef.current = createCursorZoom(zoomContainer, backdrop, cursorEl, {
      mapCursor: (x, y) => ({
        x: x * fitScale + offsetX,
        y: y * fitScale + offsetY,
      }),
    });
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

    const startTime = Math.min(currentTime, replayDuration);
    setCurrentTime(startTime);
    replayer.play(startTime);
    setPlaying(true);
    startTimer();

    // HACK: defer scaling until rrweb sets iframe dimensions after first frame
    requestAnimationFrame(() => {
      requestAnimationFrame(setupScalingAndZoom);
    });
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
  const replayStartMs = events.length > 0 ? events[0].timestamp : 0;
  const hasEvents = events.length > 1;
  const canPlay = hasEvents;
  const timeLabel = formatPaperTime(currentTime);
  const totalTimeLabel = formatPaperTime(totalTime);

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

  const hasSteps = Boolean(steps && steps.steps.length > 0);

  return (
    <div data-rrweb-block className="flex h-screen gap-6 p-6">
      {hasSteps && (
        <div className="flex w-[380px] shrink-0 flex-col overflow-y-auto">
          <StepPanel
            steps={steps!}
            replayStartMs={replayStartMs}
            currentTime={currentTime}
            onSeek={seekTo}
          />
        </div>
      )}

      <div className="flex min-w-0 grow flex-col gap-4">
        <div
          ref={viewerShellRef}
          className="relative h-0 grow overflow-hidden rounded-[32px] bg-white/50"
          style={{ boxShadow: VIEWER_SHELL_SHADOW }}
        >
          <div ref={backdropRef} className="absolute inset-0 bg-[#f1f1f1] p-6">
            <MacWindow>
              <div ref={replayRef} className="relative h-full w-full overflow-hidden" />
            </MacWindow>
          </div>
        </div>

        <div
          className="flex flex-col gap-4 rounded-[28px] bg-white/90 px-6 py-5 backdrop-blur-xl"
          style={{ fontFamily: CONTROL_FONT_FAMILY }}
        >
          {(stepLabel || stepTitle) && (
            <div className="flex items-start gap-1.5 p-0 antialiased [font-synthesis:none]">
              {stepLabel && (
                <div className="h-4.5 shrink-0 font-['SFProDisplay-Medium','SF_Pro_Display',system-ui,sans-serif] text-base/4.5 font-medium tracking-[0em] text-[color(display-p3_0.587_0.587_0.587)]">
                  {stepLabel}
                </div>
              )}
              {stepTitle && (
                <div className="h-4.5 shrink-0 font-['SFProDisplay-Medium','SF_Pro_Display',system-ui,sans-serif] text-base/4.5 font-medium tracking-[0em] text-[color(display-p3_0.188_0.188_0.188)]">
                  {stepTitle}
                </div>
              )}
            </div>
          )}

          {live && (
            <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-red-500/10">
              <div className="h-full w-full rounded-full bg-red-500/40" />
              <div className="absolute inset-y-0 right-0 w-8 animate-pulse rounded-r-full bg-red-500/80" />
            </div>
          )}
          {!live && (
            <input
              type="range"
              value={Math.min(currentTime, totalTime || 1)}
              min={0}
              max={totalTime || 1}
              step={100}
              disabled={!hasEvents}
              onChange={handleSeek}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-[color(display-p3_0.897_0.897_0.897)] outline-none disabled:cursor-default [&::-moz-range-thumb]:size-0 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:border-0 [&::-moz-range-track]:h-1.5 [&::-moz-range-track]:rounded-full [&::-webkit-slider-thumb]:size-0 [&::-webkit-slider-thumb]:appearance-none"
              style={{
                background: hasEvents
                  ? `linear-gradient(to right, oklch(0.345 0 0) 0%, oklch(0.431 0 0) ${((Math.min(currentTime, totalTime || 1) / (totalTime || 1)) * 100).toFixed(1)}%, color(display-p3 0.897 0.897 0.897) ${((Math.min(currentTime, totalTime || 1) / (totalTime || 1)) * 100).toFixed(1)}%, color(display-p3 0.897 0.897 0.897) 100%)`
                  : undefined,
              }}
            />
          )}

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

              {live && (
                <>
                  <span className="pl-2 text-[15px] leading-4.5 font-medium tracking-[0em] tabular-nums text-[color(display-p3_0.361_0.361_0.361)]">
                    {timeLabel}
                  </span>
                  <span className="ml-2 inline-flex items-center gap-1.5 rounded-full bg-red-500/10 px-2.5 py-1">
                    <span className="size-1.5 animate-pulse rounded-full bg-red-500" />
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-red-500">
                      Live
                    </span>
                  </span>
                </>
              )}
              {!live && (
                <span className="inline-flex items-center gap-2.5 pl-2 text-[15px] leading-4.5 font-medium tracking-[0em] tabular-nums text-[color(display-p3_0.361_0.361_0.361)]">
                  <span>{timeLabel}</span>
                  <span className="text-[color(display-p3_0.727_0.727_0.727)]">/</span>
                  <span>{totalTimeLabel}</span>
                </span>
              )}
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
                className="flex size-9 items-center justify-center rounded-full text-black transition-transform duration-150 ease-out active:scale-[0.97]"
              >
                <FullscreenIcon className="size-[18px]" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
