"use client";

import { Suspense, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { DateTime } from "effect";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import type { eventWithTime } from "@posthog/rrweb";
import { type Artifact, ExecutedTestPlan, type PlanId } from "@expect/shared/models";
import { ReplayViewer } from "@/components/replay/replay-viewer";
import type { ViewerRunState } from "@/lib/replay-types";
import { DEMO_TRACE } from "@/lib/demo-trace";
import { DEMO_EVENTS } from "@/lib/demo-events";
import { fetchAllArtifacts } from "@/lib/replay/fetch-artifacts";

const POLL_INTERVAL_MS = 500;
const EMPTY_EVENTS: eventWithTime[] = [];

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

const NoEvents = () => <ReplayViewer events={[]} />;

const deriveEvents = (artifacts: readonly Artifact[]): eventWithTime[] =>
  artifacts.filter((a) => a._tag === "RrwebEvent").map((a) => a.event as eventWithTime);

const deriveSteps = (artifacts: readonly Artifact[]): ViewerRunState | undefined => {
  let executedPlan: ExecutedTestPlan | undefined;
  for (const artifact of artifacts) {
    if (artifact._tag === "InitialPlan") {
      executedPlan = new ExecutedTestPlan({ ...artifact.plan, events: [] });
    } else if (artifact._tag === "SessionUpdate" && executedPlan) {
      executedPlan = executedPlan.addEvent(artifact.update);
    }
  }
  if (!executedPlan) return undefined;
  const runFinished = executedPlan.events.find((event) => event._tag === "RunFinished");
  const done = executedPlan.hasRunFinished || artifacts.some((a) => a._tag === "Done");
  return {
    title: executedPlan.title,
    status: runFinished ? runFinished.status : "running",
    summary: runFinished ? runFinished.summary : undefined,
    done,
    steps: executedPlan.steps.map((step) => ({
      stepId: step.id,
      title: step.title,
      status: step.status,
      summary: step.summary._tag === "Some" ? step.summary.value : undefined,
      startedAtMs:
        step.startedAt._tag === "Some"
          ? Number(DateTime.toEpochMillis(step.startedAt.value))
          : undefined,
      endedAtMs:
        step.endedAt._tag === "Some"
          ? Number(DateTime.toEpochMillis(step.endedAt.value))
          : undefined,
    })),
  };
};

const LiveMode = ({ testId }: { testId: string }) => {
  const addEventsRef = useRef<((newEvents: eventWithTime[]) => void) | undefined>(undefined);
  const prevEventCountRef = useRef(0);

  const artifactsQuery = useQuery({
    queryKey: ["replay-artifacts", testId],
    queryFn: () => fetchAllArtifacts(testId as PlanId),
    refetchInterval: POLL_INTERVAL_MS,
  });

  const artifacts = artifactsQuery.data ?? [];
  const events = deriveEvents(artifacts);
  const steps = deriveSteps(artifacts);
  const isRunning = !steps || (steps.status === "running" && !steps.done);

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
      autoPlay
      onAddEventsRef={handleAddEventsRef}
    />
  );
};

const DemoMode = () => {
  return <ReplayViewer events={DEMO_EVENTS} steps={DEMO_TRACE} autoPlay />;
};

const ReplayPageInner = () => {
  const searchParams = useSearchParams();
  const isDemo = searchParams.get("demo") === "true";
  const testId = searchParams.get("testId");

  if (isDemo) {
    return <DemoMode />;
  }

  if (testId) {
    return <LiveMode testId={testId} />;
  }

  return <NoEvents />;
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
