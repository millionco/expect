import type { ServerResponse } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Effect, Fiber, PubSub, Queue, Ref } from "effect";
import type { ReplayBroadcast } from "./replay-broadcast";

const VIEWER_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../viewer");

export interface LiveViewHandle {
  readonly url: string;
  readonly close: Effect.Effect<void>;
}

const drainToSse = (broadcast: ReplayBroadcast, response: ServerResponse) =>
  Effect.scoped(
    Effect.gen(function* () {
      const snapshot = yield* broadcast.snapshotEvents;
      if (snapshot.length > 0) {
        response.write(`event: replay\ndata: ${JSON.stringify(snapshot)}\n\n`);
      }

      const runState = yield* broadcast.snapshotRunState;
      if (runState) {
        response.write(`event: steps\ndata: ${JSON.stringify(runState)}\n\n`);
      }

      const eventsQueue = yield* PubSub.subscribe(broadcast.eventsPubSub);
      const stepsQueue = yield* PubSub.subscribe(broadcast.runStatePubSub);

      const forwardEvents = Effect.forever(
        Effect.gen(function* () {
          const batch = yield* Queue.take(eventsQueue);
          response.write(`event: replay\ndata: ${JSON.stringify(batch)}\n\n`);
        }),
      );

      const forwardSteps = Effect.forever(
        Effect.gen(function* () {
          const state = yield* Queue.take(stepsQueue);
          response.write(`event: steps\ndata: ${JSON.stringify(state)}\n\n`);
        }),
      );

      yield* Effect.all([forwardEvents, forwardSteps], { concurrency: "unbounded" });
    }),
  );

export const startLiveViewServer = Effect.fn("LiveViewServer.start")(function* (
  liveViewUrl: string,
  broadcast: ReplayBroadcast,
) {
  const parsedUrl = new URL(liveViewUrl);
  const activeFibers = yield* Ref.make<Map<ServerResponse, Fiber.Fiber<unknown>>>(new Map());

  const { createServer: createViteServer } = yield* Effect.tryPromise({
    try: () => import("vite"),
    catch: (cause) => new Error(`Failed to load vite: ${cause}`),
  });

  const viteServer = yield* Effect.tryPromise({
    try: () =>
      createViteServer({
        root: VIEWER_ROOT,
        server: {
          host: parsedUrl.hostname,
          port: Number(parsedUrl.port),
          strictPort: true,
        },
        logLevel: "silent",
        plugins: [
          {
            name: "expect-sse",
            configureServer(server) {
              server.middlewares.use((request, response, next) => {
                if (request.url === "/events") {
                  response.writeHead(200, {
                    "Content-Type": "text/event-stream",
                    "Cache-Control": "no-cache",
                    Connection: "keep-alive",
                  });

                  const fiber = Effect.runFork(drainToSse(broadcast, response));
                  Ref.getUnsafe(activeFibers).set(response, fiber);

                  request.on("close", () => {
                    Ref.getUnsafe(activeFibers).delete(response);
                    Effect.runFork(Fiber.interrupt(fiber));
                  });
                  return;
                }

                if (request.url === "/latest.json") {
                  Effect.runPromise(broadcast.snapshotEvents).then((events) => {
                    response.writeHead(200, { "Content-Type": "application/json" });
                    response.end(JSON.stringify(events));
                  });
                  return;
                }

                if (request.url === "/run-state.json") {
                  Effect.runPromise(broadcast.snapshotRunState).then((runState) => {
                    response.writeHead(200, { "Content-Type": "application/json" });
                    response.end(JSON.stringify(runState ?? undefined));
                  });
                  return;
                }

                next();
              });
            },
          },
        ],
      }),
    catch: (cause) => new Error(`Failed to create Vite server: ${cause}`),
  });

  yield* Effect.tryPromise({
    try: () => viteServer.listen(),
    catch: (cause) => new Error(`Failed to start Vite server: ${cause}`),
  });

  return {
    url: parsedUrl.toString(),
    close: Effect.gen(function* () {
      const fibers = yield* Ref.get(activeFibers);
      yield* Effect.forEach([...fibers.values()], (fiber) => Fiber.interrupt(fiber), {
        concurrency: "unbounded",
      });
      yield* Effect.tryPromise({
        try: () => viteServer.close(),
        catch: () => new Error("Failed to close Vite server"),
      });
    }),
  } satisfies LiveViewHandle;
});
