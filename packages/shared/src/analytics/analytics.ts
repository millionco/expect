import { Effect, Layer, Schema, ServiceMap } from "effect";
import { ChildProcess } from "effect/unstable/process";
import { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner";
import { NodeServices } from "@effect/platform-node";
import { machineId } from "node-machine-id";
import { hash } from "ohash";
import { PostHog } from "posthog-node";

import type { EventMap } from "./analytics-events";

const POSTHOG_API_KEY = "phc_t5FKk9mlc4pKbbBimiIlrM5Acq9meRp1FSuNjmwxjAX";
const POSTHOG_DEFAULT_HOST = "https://us.i.posthog.com";

const posthogClient = new PostHog(POSTHOG_API_KEY, { host: POSTHOG_DEFAULT_HOST });

const ClaudeAuthStatusResponse = Schema.Struct({
  email: Schema.String,
});

const getClaudeCodeEmail = Effect.fn("getClaudeCodeEmail")(function* () {
  const spawner = yield* ChildProcessSpawner;
  const stdout = yield* spawner
    .string(ChildProcess.make("claude", ["auth", "status"]))
    .pipe(Effect.timeout("5 seconds"));
  const status = yield* Schema.decodeEffect(Schema.fromJsonString(ClaudeAuthStatusResponse))(
    stdout,
  );
  return status.email;
});

// ---------------------------------------------------------------------------
// AnalyticsProvider — abstract provider that Analytics delegates to
// ---------------------------------------------------------------------------

export interface AnalyticsProviderShape {
  readonly capture: (event: {
    readonly eventName: string;
    readonly properties: Record<string, unknown>;
    readonly distinctId: string;
  }) => Effect.Effect<void>;
  readonly identify: (params: {
    readonly distinctId: string;
    readonly email: string;
  }) => Effect.Effect<void>;
  readonly flush: Effect.Effect<void>;
}

export class AnalyticsProvider extends ServiceMap.Service<
  AnalyticsProvider,
  AnalyticsProviderShape
>()("@expect/AnalyticsProvider") {
  static layerPostHog = Layer.succeed(this)({
    capture: (event) =>
      Effect.sync(() => {
        posthogClient.captureImmediate({
          event: event.eventName,
          properties: event.properties,
          distinctId: event.distinctId,
        });
      }),
    identify: (params) =>
      Effect.sync(() => {
        posthogClient.identify({
          distinctId: params.distinctId,
          properties: { email: params.email },
        });
      }),
    flush: Effect.tryPromise({
      try: () => posthogClient.flush(),
      catch: (cause) => cause,
    }).pipe(Effect.ignore),
  });

  static layerDev = Layer.succeed(this)({
    capture: (event) =>
      Effect.logInfo("Tracked event", {
        eventName: event.eventName,
        distinctId: event.distinctId,
        ...event.properties,
      }).pipe(Effect.annotateLogs({ module: "Analytics" })),
    identify: (params) =>
      Effect.logInfo("Identified user", {
        distinctId: params.distinctId,
        email: params.email,
      }).pipe(Effect.annotateLogs({ module: "Analytics" })),
    flush: Effect.void,
  });
}

// ---------------------------------------------------------------------------
// Analytics — public service
// ---------------------------------------------------------------------------

export class Analytics extends ServiceMap.Service<Analytics>()("@expect/Analytics", {
  make: Effect.gen(function* () {
    const provider = yield* AnalyticsProvider;

    const distinctId = yield* Effect.tryPromise({
      try: () => machineId(),
      catch: () => "unknown",
    });
    const projectId = hash(process.cwd());

    yield* getClaudeCodeEmail().pipe(
      Effect.tap((email) => provider.identify({ distinctId, email })),
      Effect.catchTag("PlatformError", () => Effect.void),
      Effect.catchTag("TimeoutError", () => Effect.void),
      Effect.catchTag("SchemaError", () => Effect.void),
      Effect.forkDetach,
    );

    const capture = <K extends keyof EventMap>(
      eventName: K,
      ...[properties]: EventMap[K] extends undefined ? [] : [EventMap[K]]
    ) =>
      Effect.gen(function* () {
        const commonProperties = {
          timestamp: new Date().toISOString(),
          projectId,
        };

        yield* provider.capture({
          eventName: eventName as string,
          properties: { ...commonProperties, ...(properties ?? {}) },
          distinctId,
        });
      }).pipe(
        Effect.catchCause((cause) =>
          Effect.logWarning("Analytics capture failed", {
            eventName,
            cause,
          }).pipe(Effect.annotateLogs({ module: "Analytics" })),
        ),
      );

    const track: {
      <K extends keyof EventMap>(
        eventName: K & (EventMap[K] extends undefined ? K : never),
      ): <A, E, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>;

      <K extends keyof EventMap, A>(
        eventName: K & (EventMap[K] extends undefined ? never : K),
        deriveProperties: (result: A) => EventMap[K],
      ): <E, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>;
    } = (<K extends keyof EventMap, A>(
      eventName: K,
      deriveProperties?: (result: A) => EventMap[K],
    ) =>
      <E, R>(self: Effect.Effect<A, E, R>) =>
        Effect.tap(self, (result) => {
          const props = deriveProperties ? deriveProperties(result) : undefined;
          return (capture as Function).call(
            undefined,
            eventName,
            ...(props !== undefined ? [props] : []),
          );
        })) as never;

    return { capture, track, flush: provider.flush } as const;
  }),
}) {
  static layerPostHog = Layer.effect(this)(this.make).pipe(
    Layer.provide(AnalyticsProvider.layerPostHog),
    Layer.provide(NodeServices.layer),
  );
  static layerDev = Layer.effect(this)(this.make).pipe(
    Layer.provide(AnalyticsProvider.layerDev),
    Layer.provide(NodeServices.layer),
  );
}
