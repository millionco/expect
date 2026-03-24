// oxlint-disable-next-line no-restricted-imports
import { useEffect, useMemo, useRef } from "react";
import rrwebPlayer from "rrweb-player";
import "rrweb-player/dist/style.css";
import type { eventWithTime } from "@rrweb/types";
import { useAtomValue } from "@effect/atom-react";
import type { LiveUpdatePayload } from "@expect/shared/rpcs";
import { ExecutedTestPlan, type ExecutionEvent } from "@expect/shared/models";
import { REPLAY_PLAYER_HEIGHT_PX, REPLAY_PLAYER_WIDTH_PX } from "../../src/constants";
import { liveUpdatesAtom } from "./atoms/live-updates";
import { StepsPanel } from "./steps-panel";

const deriveState = (payloads: readonly LiveUpdatePayload[]) => {
  const rrwebEvents: eventWithTime[] = [];
  const executionEvents: ExecutionEvent[] = [];

  for (const payload of payloads) {
    if (payload._tag === "RrwebBatch") {
      for (const event of payload.events) {
        rrwebEvents.push(event as eventWithTime);
      }
    } else if (payload._tag === "Execution") {
      executionEvents.push(payload.event);
    }
  }

  const runStarted = executionEvents.find((event) => event._tag === "RunStarted");
  const plan = runStarted?._tag === "RunStarted" ? runStarted.plan : undefined;

  const executedPlan = plan
    ? new ExecutedTestPlan({ ...plan, events: executionEvents })
    : undefined;

  return { rrwebEvents, executedPlan };
};

const RrwebPlayer = ({ events }: { readonly events: readonly eventWithTime[] }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<rrwebPlayer | undefined>();
  const processedCountRef = useRef(0);

  useEffect(() => {
    const newEvents = events.slice(processedCountRef.current);
    if (newEvents.length === 0) return;

    for (const event of newEvents) {
      if (playerRef.current) {
        playerRef.current.getReplayer().addEvent(event);
      }
    }

    if (!playerRef.current && events.length >= 2 && containerRef.current) {
      playerRef.current = new rrwebPlayer({
        target: containerRef.current,
        props: {
          events: [...events] as eventWithTime[],
          width: REPLAY_PLAYER_WIDTH_PX,
          height: REPLAY_PLAYER_HEIGHT_PX,
          autoPlay: true,
          showController: true,
          liveMode: true,
        },
      });
      playerRef.current.getReplayer().startLive();
    }

    processedCountRef.current = events.length;
  }, [events]);

  return (
    <div className="overflow-hidden rounded-lg">
      {events.length === 0 && (
        <div className="p-4 text-center text-sm text-muted-foreground">
          Waiting for test run\u2026
        </div>
      )}
      <div ref={containerRef} />
    </div>
  );
};

export const App = () => {
  const payloads = useAtomValue(liveUpdatesAtom);
  const { rrwebEvents, executedPlan } = useMemo(() => deriveState(payloads ?? []), [payloads]);

  return (
    <div className="mx-auto max-w-[960px] p-8">
      <StepsPanel executedPlan={executedPlan} />
      <RrwebPlayer events={rrwebEvents} />
    </div>
  );
};
