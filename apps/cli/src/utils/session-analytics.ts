import { Effect, ManagedRuntime } from "effect";
import { Analytics, type EventMap } from "@expect/shared/observability";
import { usePreferencesStore } from "../stores/use-preferences";

const analyticsRuntime = ManagedRuntime.make(Analytics.layerPostHog);

export const trackEvent = <K extends keyof EventMap>(
  eventName: K,
  ...[properties]: EventMap[K] extends undefined ? [] : [EventMap[K]]
) =>
  analyticsRuntime.runPromise(
    Effect.gen(function* () {
      const analytics = yield* Analytics;
      const captureEffect: Effect.Effect<void> = (analytics.capture as Function).call(
        analytics,
        eventName,
        ...(properties !== undefined ? [properties] : []),
      );
      yield* captureEffect;
    }).pipe(
      Effect.catchCause((cause) => Effect.logDebug("Analytics capture failed", { eventName, cause })),
    ),
  );

export const trackSessionStarted = () =>
  trackEvent("session:started", {
    mode: "interactive",
    skip_planning: false,
    browser_headed: usePreferencesStore.getState().browserHeaded,
  });

export const flushSession = (sessionStartedAt: number) =>
  analyticsRuntime.runPromise(
    Effect.gen(function* () {
      const analytics = yield* Analytics;
      yield* analytics.capture("session:ended", {
        session_ms: Date.now() - sessionStartedAt,
      });
      yield* analytics.flush;
    }).pipe(
      Effect.catchCause((cause) => Effect.logDebug("Analytics flush failed", { cause })),
    ),
  );
