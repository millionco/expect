// oxlint-disable-next-line no-restricted-imports
import { useEffect, useMemo, useRef } from "react";
import rrwebPlayer from "rrweb-player";
import "rrweb-player/dist/style.css";
import type { eventWithTime } from "@rrweb/types";
import { useAtom, useAtomValue } from "@effect/atom-react";
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult";
import type { LiveUpdatePayload } from "@expect/shared/rpcs";
import { ExecutedTestPlan, type ExecutionEvent } from "@expect/shared/models";
import {
  REPLAY_PLAYER_HEIGHT_PX,
  REPLAY_PLAYER_WIDTH_PX,
} from "../../src/constants";
import { liveUpdatesAtom } from "./atoms/live-updates";
import { StepsPanel } from "./steps-panel";

const deriveState = (payloads: readonly LiveUpdatePayload[]) => {
  const rrwebEvents: eventWithTime[] = [];
  let executedPlan: ExecutedTestPlan | undefined;

  for (const payload of payloads) {
    if (payload._tag === "RrwebBatch") {
      for (const event of payload.events) {
        rrwebEvents.push(event as eventWithTime);
      }
    } else if (payload._tag === "PlanUpdate") {
      executedPlan = payload.plan;
    }
  }

  return { rrwebEvents, executedPlan };
};

const RrwebPlayer = ({
  events,
}: {
  readonly events: readonly eventWithTime[];
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<rrwebPlayer | undefined>(undefined);
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
  const [output, pull] = useAtom(liveUpdatesAtom);

  /** @note(rasmus): keep up to date */
  useEffect(() => {
    if (output._tag !== "Success") return;
    const { done, items } = output.value;

    /** @note(rasmus): handle updates */
    for (let i = 0; i < items.length; i++) {}

    if (!done) pull();
  }, [output, pull]);

  const { rrwebEvents, executedPlan } = deriveState(
    AsyncResult.isSuccess(output) ? output.value.items : []
  );

  return (
    <div className="mx-auto max-w-[960px] p-8">
      <StepsPanel executedPlan={executedPlan} />
      <RrwebPlayer events={rrwebEvents} />
    </div>
  );
};
