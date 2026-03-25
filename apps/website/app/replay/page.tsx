"use client";

import { Suspense, useEffect, useRef, useState, type CSSProperties } from "react";
import { useSearchParams } from "next/navigation";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import type { eventWithTime } from "@posthog/rrweb";
import { ReplayViewer } from "@/components/replay/replay-viewer";
import { startRecording, stopRecording } from "@/lib/rrweb";
import { useMountEffect } from "@/hooks/use-mount-effect";
import type { ViewerRunState } from "@/lib/replay-types";

const POLL_INTERVAL_MS = 1000;
const RECORDING_TICK_MS = 1000;
const RIPPLE_DELAY_STYLE: CSSProperties = { animationDelay: "1s" };

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

const formatElapsed = (totalSeconds: number) => {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

const RecordingMode = () => {
  const [recording, setRecording] = useState(true);
  const [events, setEvents] = useState<eventWithTime[]>([]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useMountEffect(() => {
    void startRecording();
  });

  useEffect(() => {
    if (!recording) return;
    const interval = setInterval(() => {
      setElapsedSeconds((previous) => previous + 1);
    }, RECORDING_TICK_MS);
    return () => clearInterval(interval);
  }, [recording]);

  const handleCompleteRecording = () => {
    const recordedEvents = stopRecording();
    if (recordedEvents.length < 2) return;
    setEvents(recordedEvents);
    setRecording(false);
  };

  if (!recording) {
    return <ReplayViewer events={events} />;
  }

  return (
    <div className="flex h-screen items-center justify-center bg-[color(display-p3_0.986_0.986_0.986)]">
      <div className="flex flex-col items-center gap-10">
        <div className="relative flex size-24 items-center justify-center">
          <div className="recording-ripple absolute inset-0 rounded-full border border-red-500/20" />
          <div
            className="recording-ripple absolute inset-0 rounded-full border border-red-500/20"
            style={RIPPLE_DELAY_STYLE}
          />
          <div className="flex size-12 items-center justify-center rounded-full bg-red-500/10">
            <div className="size-4 rounded-full bg-red-500 shadow-[0_0_12px_4px_rgba(239,68,68,0.2)]" />
          </div>
        </div>

        <div className="flex flex-col items-center gap-3">
          <span
            className="font-mono text-4xl tabular-nums tracking-[0.2em] text-neutral-900"
            style={{ fontWeight: 200 }}
          >
            {formatElapsed(elapsedSeconds)}
          </span>
          <div className="flex items-center gap-2 rounded-full bg-red-50 px-3 py-1">
            <div className="size-1.5 animate-pulse rounded-full bg-red-500" />
            <span className="text-[11px] font-semibold uppercase tracking-widest text-red-600/80">
              Recording
            </span>
          </div>
        </div>

        <p className="max-w-[260px] text-center text-[13px] leading-relaxed text-neutral-400">
          Interact with the page, then stop to review the session replay.
        </p>

        <button
          type="button"
          onClick={handleCompleteRecording}
          className="group flex items-center gap-2.5 rounded-full border border-neutral-200 bg-white px-6 py-3 text-sm font-medium text-neutral-900 shadow-sm transition-all duration-150 ease-out hover:border-neutral-300 hover:shadow-md active:scale-[0.97]"
        >
          <div className="size-3 rounded-[3px] bg-red-500 transition-transform duration-150 group-hover:scale-110" />
          Stop Recording
        </button>
      </div>
    </div>
  );
};

const fetchLatestEvents = async (): Promise<eventWithTime[]> => {
  const response = await fetch("/latest.json");
  if (!response.ok) return [];
  return response.json();
};

const fetchSteps = async (): Promise<ViewerRunState> => {
  const response = await fetch("/steps");
  if (!response.ok) return { title: "", status: "running", summary: undefined, steps: [] };
  return response.json();
};

const LiveMode = () => {
  const addEventsRef = useRef<((newEvents: eventWithTime[]) => void) | undefined>(undefined);
  const prevEventCountRef = useRef(0);

  const eventsQuery = useQuery({
    queryKey: ["replay-events"],
    queryFn: fetchLatestEvents,
    refetchInterval: POLL_INTERVAL_MS,
  });

  const stepsQuery = useQuery({
    queryKey: ["replay-steps"],
    queryFn: fetchSteps,
    refetchInterval: POLL_INTERVAL_MS,
  });

  const events = eventsQuery.data ?? [];
  const steps = stepsQuery.data;
  const isRunning = !steps || steps.status === "running";

  useEffect(() => {
    if (events.length <= prevEventCountRef.current) return;
    const newEvents = events.slice(prevEventCountRef.current);
    prevEventCountRef.current = events.length;
    addEventsRef.current?.(newEvents);
  }, [events.length]);

  const handleAddEventsRef = (handler: (newEvents: eventWithTime[]) => void) => {
    addEventsRef.current = handler;
  };

  return (
    <ReplayViewer
      events={events}
      steps={steps}
      live={isRunning}
      onAddEventsRef={handleAddEventsRef}
    />
  );
};

const ReplayPageInner = () => {
  const searchParams = useSearchParams();
  const isLive = searchParams.get("live") === "true";

  if (isLive) {
    return <LiveMode />;
  }

  return <RecordingMode />;
};

export default function ReplayPage() {
  return (
    <QueryClientProvider client={queryClient}>
      <Suspense>
        <ReplayPageInner />
      </Suspense>
    </QueryClientProvider>
  );
}
