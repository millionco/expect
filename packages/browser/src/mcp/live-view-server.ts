import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { Page } from "playwright";
import type { eventWithTime } from "@rrweb/types";
import { Effect, Fiber, Predicate, PubSub, Schedule, Stream } from "effect";
import { EVENT_COLLECT_INTERVAL_MS } from "../constants";
import { buildReplayViewerHtml } from "../replay-viewer";
import { evaluateRuntime } from "../utils/evaluate-runtime";
import type { ViewerRunState } from "./viewer-events";

const isViewerRunState = (value: unknown): value is ViewerRunState =>
  Predicate.isObject(value) &&
  "status" in value &&
  "steps" in value &&
  Array.isArray((value as Record<string, unknown>).steps);

export interface LiveViewHandle {
  readonly url: string;
  readonly pushRunState: (state: ViewerRunState) => void;
  readonly getLatestRunState: () => ViewerRunState | undefined;
  readonly close: Effect.Effect<void>;
}

interface StartLiveViewServerOptions {
  readonly liveViewUrl: string;
  readonly getPage: () => Page | undefined;
  readonly onEventsCollected: (events: eventWithTime[]) => void;
}

type SseClient = ServerResponse<IncomingMessage>;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

const NO_CACHE_HEADERS = { "Cache-Control": "no-store" } as const;

const listenServer = (server: Server, host: string, port: number) =>
  Effect.callback<void, Error>((resume) => {
    const onError = (error: Error) => resume(Effect.fail(error));
    server.once("error", onError);
    server.listen({ host, port }, () => {
      server.off("error", onError);
      resume(Effect.void);
    });
  });

const closeServer = (server: Server) =>
  Effect.callback<void>((resume) => {
    server.close(() => resume(Effect.void));
  });

export const startLiveViewServer = Effect.fn("LiveViewServer.start")(function* (
  options: StartLiveViewServerOptions,
) {
  const parsedUrl = new URL(options.liveViewUrl);
  const sseClients = new Set<SseClient>();
  const accumulatedReplayEvents: eventWithTime[] = [];
  let latestRunState: ViewerRunState | undefined;

  const stepsPubSub = yield* PubSub.unbounded<ViewerRunState>();

  const viewerHtml = buildReplayViewerHtml({
    title: "Expect Live View",
    eventsSource: "sse",
  });

  const broadcastSse = (eventType: string, data: string): void => {
    const message = `event: ${eventType}\ndata: ${data}\n\n`;
    for (const client of sseClients) {
      if (client.destroyed) {
        sseClients.delete(client);
        continue;
      }
      try {
        client.write(message);
      } catch {
        sseClients.delete(client);
        client.end();
      }
    }
  };

  const broadcastReplayEvents = (events: eventWithTime[]): void => {
    if (events.length === 0) return;
    accumulatedReplayEvents.push(...events);
    options.onEventsCollected(events);
    broadcastSse("replay", JSON.stringify(events));
  };

  const broadcastRunState = (state: ViewerRunState): void => {
    latestRunState = state;
    broadcastSse("steps", JSON.stringify(state));
  };

  const handleSseRequest = (request: IncomingMessage, response: SseClient): void => {
    response.writeHead(200, {
      "Content-Type": "text/event-stream",
      Connection: "keep-alive",
      ...CORS_HEADERS,
      ...NO_CACHE_HEADERS,
    });
    response.flushHeaders();
    sseClients.add(response);
    request.on("close", () => sseClients.delete(response));
  };

  const handleStepsPost = (request: IncomingMessage, response: SseClient): void => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      try {
        const body = Buffer.concat(chunks).toString("utf-8");
        const parsed: unknown = JSON.parse(body);
        if (!isViewerRunState(parsed)) {
          response.writeHead(400, {
            "Content-Type": "text/plain",
            ...CORS_HEADERS,
            ...NO_CACHE_HEADERS,
          });
          response.end("Invalid step state: missing status or steps");
          return;
        }
        broadcastRunState(parsed);
        response.writeHead(204, { ...CORS_HEADERS, ...NO_CACHE_HEADERS });
        response.end();
      } catch {
        response.writeHead(400, {
          "Content-Type": "text/plain",
          ...CORS_HEADERS,
          ...NO_CACHE_HEADERS,
        });
        response.end("Invalid JSON");
      }
    });
  };

  const routeRequest = (request: IncomingMessage, response: SseClient): void => {
    if (request.method === "OPTIONS") {
      response.writeHead(204, CORS_HEADERS);
      response.end();
      return;
    }

    const pathname = new URL(request.url ?? "/", parsedUrl).pathname;

    if (pathname === "/") {
      response.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        ...CORS_HEADERS,
        ...NO_CACHE_HEADERS,
      });
      response.end(viewerHtml);
      return;
    }

    if (pathname === "/events") {
      handleSseRequest(request, response);
      return;
    }

    if (pathname === "/latest.json") {
      const body = JSON.stringify(accumulatedReplayEvents);
      response.writeHead(200, {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
        ...CORS_HEADERS,
        ...NO_CACHE_HEADERS,
      });
      response.end(body);
      return;
    }

    if (pathname === "/steps") {
      if (request.method === "POST") {
        handleStepsPost(request, response);
        return;
      }
      const body = JSON.stringify(latestRunState ?? { title: "", status: "running", steps: [] });
      response.writeHead(200, {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
        ...CORS_HEADERS,
        ...NO_CACHE_HEADERS,
      });
      response.end(body);
      return;
    }

    response.writeHead(404, {
      "Content-Type": "text/plain; charset=utf-8",
      ...CORS_HEADERS,
      ...NO_CACHE_HEADERS,
    });
    response.end("Not found");
  };

  const server = createServer(routeRequest);

  yield* listenServer(server, parsedUrl.hostname, Number(parsedUrl.port));

  const pollPage = Effect.sync(() => options.getPage()).pipe(
    Effect.flatMap((page) => {
      if (!page || page.isClosed()) return Effect.void;
      return evaluateRuntime(page, "startRecording").pipe(
        Effect.catchCause(() => Effect.void),
        Effect.flatMap(() => evaluateRuntime(page, "getEvents")),
        Effect.tap((events) =>
          Effect.sync(() => {
            if (Array.isArray(events) && events.length > 0) {
              broadcastReplayEvents(events);
            }
          }),
        ),
        Effect.catchCause((cause) => Effect.logDebug("Replay event collection failed", { cause })),
      );
    }),
  );

  const replayPollFiber = yield* pollPage.pipe(
    Effect.repeat(Schedule.spaced(EVENT_COLLECT_INTERVAL_MS)),
    Effect.forkDetach,
  );

  const stepsBroadcastFiber = yield* Stream.fromPubSub(stepsPubSub).pipe(
    Stream.tap((state) => Effect.sync(() => broadcastRunState(state))),
    Stream.runDrain,
    Effect.forkDetach,
  );

  return {
    url: parsedUrl.toString(),
    pushRunState: (state: ViewerRunState) => {
      PubSub.publishUnsafe(stepsPubSub, state);
    },
    getLatestRunState: () => latestRunState,
    close: Effect.gen(function* () {
      yield* Fiber.interrupt(replayPollFiber);
      yield* Fiber.interrupt(stepsBroadcastFiber);
      for (const client of sseClients) client.end();
      sseClients.clear();
      yield* closeServer(server);
    }),
  } satisfies LiveViewHandle;
});
