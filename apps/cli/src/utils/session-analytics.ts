import { Effect } from "effect";
import { Analytics, type EventMap } from "@expect/shared/observability";
import { detectParentAgent } from "@expect/shared/launched-from";
import { usePreferencesStore } from "../stores/use-preferences";

const analyticsLayer = Analytics.layerPostHog;

export const trackEvent = <K extends keyof EventMap>(
  eventName: K,
  ...[properties]: EventMap[K] extends undefined ? [] : [EventMap[K]]
) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const analytics = yield* Analytics;
      const captureEffect: Effect.Effect<void> = (analytics.capture as Function).call(
        analytics,
        eventName,
        ...(properties !== undefined ? [properties] : []),
      );
      yield* captureEffect;
    }).pipe(
      Effect.catchCause(() => Effect.void),
      Effect.provide(analyticsLayer),
    ),
  );

export const trackSessionStarted = (agent: string) =>
  trackEvent("session:started", {
    mode: "interactive",
    agent,
    parent_agent: detectParentAgent(),
    browser_headed: usePreferencesStore.getState().browserHeaded,
  });

export const flushSession = (sessionStartedAt: number) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const analytics = yield* Analytics;
      yield* analytics.capture("session:ended", {
        session_ms: Date.now() - sessionStartedAt,
      });
      yield* analytics.flush;
    }).pipe(Effect.provide(analyticsLayer)),
  );
