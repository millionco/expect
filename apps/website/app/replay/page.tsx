"use client";

import { Suspense, useEffect, useState, useRef } from "react";
import { useSearchParams } from "next/navigation";
import type { eventWithTime } from "@posthog/rrweb";
import { ReplayViewer } from "@/components/replay/replay-viewer";
import { startRecording, stopRecording } from "@/lib/rrweb";
import { useMountEffect } from "@/hooks/use-mount-effect";
import type { ViewerRunState } from "@/lib/replay-types";

const RecordingMode = () => {
  const [recording, setRecording] = useState(true);
  const [events, setEvents] = useState<eventWithTime[]>([]);

  useMountEffect(() => {
    void startRecording();
  });

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
    <div className="relative flex h-screen flex-col items-center justify-center">
      <div className="flex flex-col items-center gap-6">
        <div className="flex size-16 items-center justify-center rounded-full bg-red-500/10">
          <div className="size-4 animate-pulse rounded-full bg-red-500" />
        </div>
        <div className="flex flex-col items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight text-neutral-900">
            Recording session...
          </h1>
          <p className="text-sm text-neutral-500">
            Interact with the page, then complete the recording to replay it.
          </p>
        </div>
        <button
          type="button"
          onClick={handleCompleteRecording}
          className="rounded-full bg-neutral-900 px-6 py-2.5 text-sm font-medium text-white shadow-lg transition-transform duration-150 ease-out active:scale-[0.97]"
        >
          Complete Recording
        </button>
      </div>
    </div>
  );
};

const LiveMode = () => {
  const [events, setEvents] = useState<eventWithTime[]>([]);
  const [steps, setSteps] = useState<ViewerRunState | undefined>(undefined);
  const [connected, setConnected] = useState(true);
  const eventsRef = useRef<eventWithTime[]>([]);
  const addEventsRef = useRef<((newEvents: eventWithTime[]) => void) | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    let eventSource: EventSource | undefined;

    fetch("/latest.json")
      .then((response) => (response.ok ? response.json() : []))
      .then((initialEvents: eventWithTime[]) => {
        if (cancelled || initialEvents.length === 0) return;
        eventsRef.current = initialEvents;
        setEvents([...initialEvents]);
      })
      .catch(() => {});

    fetch("/steps")
      .then((response) => (response.ok ? response.json() : undefined))
      .then((initialSteps: ViewerRunState | undefined) => {
        if (cancelled || !initialSteps) return;
        setSteps(initialSteps);
      })
      .catch(() => {});

    let sseErrorCount = 0;
    const SSE_MAX_ERRORS_BEFORE_DISCONNECT = 20;

    eventSource = new EventSource("/events");

    eventSource.addEventListener("replay", (message) => {
      sseErrorCount = 0;
      try {
        const newEvents: eventWithTime[] = JSON.parse(message.data);
        eventsRef.current = [...eventsRef.current, ...newEvents];
        setEvents([...eventsRef.current]);
        addEventsRef.current?.(newEvents);
      } catch {
        /* ignore parse errors */
      }
    });

    eventSource.addEventListener("steps", (message) => {
      sseErrorCount = 0;
      try {
        const state: ViewerRunState = JSON.parse(message.data);
        setSteps(state);
      } catch {
        /* ignore parse errors */
      }
    });

    eventSource.onerror = () => {
      sseErrorCount++;
      if (sseErrorCount >= SSE_MAX_ERRORS_BEFORE_DISCONNECT) {
        setConnected(false);
        eventSource?.close();
      }
    };

    return () => {
      cancelled = true;
      eventSource?.close();
    };
  }, []);

  const handleAddEventsRef = (handler: (newEvents: eventWithTime[]) => void) => {
    addEventsRef.current = handler;
  };

  return (
    <ReplayViewer
      events={events}
      steps={steps}
      live={connected}
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
    <Suspense>
      <ReplayPageInner />
    </Suspense>
  );
}
