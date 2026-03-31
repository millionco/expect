"use client";

import { useEffect, useRef } from "react";
import type { eventWithTime } from "@posthog/rrweb";
import { useAtom } from "@effect/atom-react";
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult";
import { DateTime, Option } from "effect";
import { ExecutedTestPlan, type TestPlanStep } from "@expect/shared/models";
import type { LiveUpdatePayload } from "@expect/shared/rpcs";
import { liveUpdatesAtom } from "@/lib/replay/atoms/live-updates";
import { ReplayViewer } from "@/components/replay/replay-viewer";
import type { ViewerRunState, ViewerStepEvent } from "@/lib/replay-types";

const deriveState = (payloads: readonly LiveUpdatePayload[]) => {
  const rrwebEvents: eventWithTime[] = [];
  let executedPlan: ExecutedTestPlan | undefined;

  for (const payload of payloads) {
    if (payload._tag === "RrwebBatch") {
      for (const event of payload.events) {
        rrwebEvents.push(event as eventWithTime);
      }
    } else if (payload._tag === "InitialPlan") {
      executedPlan = new ExecutedTestPlan({
        ...payload.plan,
        events: [],
      });
    } else if (payload._tag === "SessionUpdate") {
      if (executedPlan) {
        executedPlan = executedPlan.addEvent(payload.update);
      }
    }
  }

  return { rrwebEvents, executedPlan };
};

const stepToViewerStep = (step: TestPlanStep): ViewerStepEvent => ({
  stepId: step.id,
  title: step.title,
  status: step.status,
  summary: step.summary._tag === "Some" ? step.summary.value : undefined,
  startedAtMs:
    step.startedAt._tag === "Some" ? Number(DateTime.toEpochMillis(step.startedAt.value)) : undefined,
  endedAtMs:
    step.endedAt._tag === "Some" ? Number(DateTime.toEpochMillis(step.endedAt.value)) : undefined,
});

const deriveViewerRunState = (plan: ExecutedTestPlan | undefined): ViewerRunState | undefined => {
  if (!plan) return undefined;
  const runFinished = plan.events.find((event) => event._tag === "RunFinished");
  return {
    title: plan.title,
    status: runFinished ? runFinished.status : "running",
    summary: runFinished ? runFinished.summary : undefined,
    steps: plan.steps.map(stepToViewerStep),
  };
};

export const TestViewer = () => {
  const [output, pull] = useAtom(liveUpdatesAtom);
  const addEventsRef = useRef<((newEvents: eventWithTime[]) => void) | undefined>(undefined);
  const prevEventCountRef = useRef(0);

  useEffect(() => {
    if (output._tag !== "Success") return;
    const { done } = output.value;
    if (!done) pull();
  }, [output, pull]);

  const { rrwebEvents, executedPlan } = deriveState(
    AsyncResult.isSuccess(output) ? output.value.items : [],
  );

  useEffect(() => {
    if (rrwebEvents.length <= prevEventCountRef.current) return;
    const newEvents = rrwebEvents.slice(prevEventCountRef.current);
    prevEventCountRef.current = rrwebEvents.length;
    addEventsRef.current?.(newEvents);
  }, [rrwebEvents.length]);

  const handleAddEventsRef = (handler: (newEvents: eventWithTime[]) => void) => {
    addEventsRef.current = handler;
  };

  const viewerRunState = deriveViewerRunState(executedPlan);
  const runFinished = executedPlan?.hasRunFinished ?? false;
  const streamDone = AsyncResult.isSuccess(output) && output.value.done;
  const isLive = !streamDone && !runFinished;

  return (
    <ReplayViewer
      events={rrwebEvents}
      steps={viewerRunState}
      live={isLive}
      autoPlay
      onAddEventsRef={handleAddEventsRef}
    />
  );
};
