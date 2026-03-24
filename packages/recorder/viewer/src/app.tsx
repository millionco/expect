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
  const [status, setStatus] = useState("Loading replay\u2026");
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<rrwebPlayer | undefined>();
  const eventsRef = useRef<eventWithTime[]>([]);

  const initPlayer = useCallback((events: eventWithTime[]) => {
    if (playerRef.current) {
      playerRef.current.getReplayer().addEvent(events.at(-1)!);
      return;
    }
    if (events.length < 2 || !containerRef.current) return;

    setStatus("");
    playerRef.current = new rrwebPlayer({
      target: containerRef.current,
      props: {
        events,
        width: REPLAY_PLAYER_WIDTH_PX,
        height: REPLAY_PLAYER_HEIGHT_PX,
        autoPlay: true,
        showController: false,
        liveMode: true,
      },
    });
    playerRef.current.getReplayer().startLive();
  }, []);

  useMountEffect(() => {
    const bootstrap = async () => {
      const latestResponse = await fetch("/latest.json");
      if (latestResponse.ok) {
        eventsRef.current = await latestResponse.json();
        if (eventsRef.current.length >= 2) initPlayer(eventsRef.current);
      }

      const stepsResponse = await fetch("/steps");
      if (stepsResponse.ok) {
        const state = await stepsResponse.json();
        if (state?.steps) setRunState(state);
      }

      const eventSource = new EventSource("/events");

      eventSource.addEventListener("replay", (message) => {
        try {
          const events: eventWithTime[] = JSON.parse(message.data);
          for (const event of events) {
            eventsRef.current.push(event);
            if (playerRef.current) playerRef.current.getReplayer().addEvent(event);
          }
          if (!playerRef.current && eventsRef.current.length >= 2) {
            initPlayer(eventsRef.current);
          }
        } catch {
          /* ignore malformed events */
        }
      });

      eventSource.addEventListener("steps", (message) => {
        try {
          setRunState(JSON.parse(message.data));
        } catch {
          /* ignore malformed steps */
        }
      });

      eventSource.onerror = () => {
        setStatus("Connection lost. Retrying...");
      };
    };

    bootstrap();
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
