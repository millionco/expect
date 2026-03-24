import { useCallback, useRef, useState } from "react";
import rrwebPlayer from "rrweb-player";
import "rrweb-player/dist/style.css";
import type { eventWithTime } from "@rrweb/types";
import { REPLAY_PLAYER_HEIGHT_PX, REPLAY_PLAYER_WIDTH_PX } from "../../src/constants";
import type { ViewerRunState } from "../../src/viewer-events";
import { useMountEffect } from "./hooks/use-mount-effect";
import { StepsPanel } from "./steps-panel";

export const App = () => {
  const [runState, setRunState] = useState<ViewerRunState | undefined>();
  const [status, setStatus] = useState("Waiting for test run\u2026");
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<rrwebPlayer | undefined>();
  const eventsRef = useRef<eventWithTime[]>([]);

  const addEvents = useCallback((events: readonly eventWithTime[]) => {
    for (const event of events) {
      eventsRef.current.push(event);
      if (playerRef.current) {
        playerRef.current.getReplayer().addEvent(event);
      }
    }
    if (!playerRef.current && eventsRef.current.length >= 2 && containerRef.current) {
      setStatus("");
      playerRef.current = new rrwebPlayer({
        target: containerRef.current,
        props: {
          events: eventsRef.current,
          width: REPLAY_PLAYER_WIDTH_PX,
          height: REPLAY_PLAYER_HEIGHT_PX,
          autoPlay: true,
          showController: true,
          liveMode: true,
        },
      });
      playerRef.current.getReplayer().startLive();
    }
    if (events.length > 0) setStatus("");
  }, []);

  useMountEffect(() => {
    const eventSource = new EventSource("/events");
    let sseConnected = false;

    eventSource.addEventListener("replay", (message) => {
      sseConnected = true;
      try {
        const events: eventWithTime[] = JSON.parse(message.data);
        addEvents(events);
      } catch {
        /* malformed event */
      }
    });

    eventSource.addEventListener("steps", (message) => {
      try {
        const state: ViewerRunState = JSON.parse(message.data);
        if (state?.steps) setRunState(state);
      } catch {
        /* malformed state */
      }
    });

    eventSource.onerror = () => {
      if (sseConnected) {
        setStatus("Session ended. Loading snapshot\u2026");
        eventSource.close();
        fallbackToSnapshot();
      }
    };

    const fallbackToSnapshot = async () => {
      try {
        const replayResponse = await fetch("/latest.json");
        if (replayResponse.ok) {
          const events: eventWithTime[] = await replayResponse.json();
          if (events.length > 0) addEvents(events);
        }
      } catch {
        /* snapshot not available */
      }

      try {
        const stateResponse = await fetch("/run-state.json");
        if (stateResponse.ok) {
          const state: ViewerRunState = await stateResponse.json();
          if (state?.steps) setRunState(state);
        }
      } catch {
        /* state not available */
      }
    };

    return () => eventSource.close();
  });

  return (
    <div className="mx-auto max-w-[960px] p-8">
      <StepsPanel state={runState} />
      <div className="overflow-hidden rounded-lg">
        {status && <div className="p-4 text-center text-sm text-muted-foreground">{status}</div>}
        <div ref={containerRef} />
      </div>
    </div>
  );
};
