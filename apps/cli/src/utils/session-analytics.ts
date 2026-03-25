import { Effect, ManagedRuntime } from "effect";
import { Analytics } from "@expect/shared/observability";
import { usePreferencesStore } from "../stores/use-preferences";

const analyticsRuntime = ManagedRuntime.make(Analytics.layerPostHog);

export const trackSessionStarted = () =>
  analyticsRuntime.runPromise(
    Effect.gen(function* () {
      const analytics = yield* Analytics;
      yield* analytics.capture("session:started", {
        mode: "interactive",
        skip_planning: false,
        browser_headed: usePreferencesStore.getState().browserHeaded,
      });
    }),
  );

export const flushSession = (sessionStartedAt: number) =>
  analyticsRuntime.runPromise(
    Effect.gen(function* () {
      const analytics = yield* Analytics;
      yield* analytics.capture("session:ended", {
        session_ms: Date.now() - sessionStartedAt,
      });
      yield* analytics.flush;
    }),
  );
