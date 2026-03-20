import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { Page } from "playwright";
import type { eventWithTime } from "@rrweb/types";
import { LIVE_VIEW_PAGE_POLL_INTERVAL_MS } from "./constants";
import { EVENT_COLLECT_INTERVAL_MS } from "../constants";
import { evaluateRuntime } from "../utils/evaluate-runtime";
import { Effect } from "effect";
import { buildReplayViewerHtml } from "../replay-viewer";

export interface LiveViewServer {
  url: string;
  close: () => Promise<void>;
}

export interface StartLiveViewServerOptions {
  liveViewUrl: string;
  getPage: () => Page | undefined;
  onEventsCollected: (events: eventWithTime[]) => void;
}

type SseClient = ServerResponse<IncomingMessage>;

const NO_CACHE_HEADERS = { "Cache-Control": "no-store" } as const;

export const startLiveViewServer = async ({
  liveViewUrl,
  getPage,
  onEventsCollected,
}: StartLiveViewServerOptions): Promise<LiveViewServer> => {
  const parsedUrl = new URL(liveViewUrl);
  const sseClients = new Set<SseClient>();
  const accumulatedEvents: eventWithTime[] = [];
  let currentPage: Page | undefined;

  const viewerHtml = buildReplayViewerHtml({
    title: "Browser Tester Live View",
    eventsSource: "sse",
  });

  const broadcastEvents = (events: eventWithTime[]): void => {
    if (events.length === 0) return;
    accumulatedEvents.push(...events);
    onEventsCollected(events);

    const data = `data: ${JSON.stringify(events)}\n\n`;
    for (const client of sseClients) {
      if (client.destroyed) {
        sseClients.delete(client);
        continue;
      }
      try {
        client.write(data);
      } catch {
        sseClients.delete(client);
        client.end();
      }
    }
  };

  const collectFromPage = async (page: Page): Promise<void> => {
    try {
      const events = await Effect.runPromise(evaluateRuntime(page, "getEvents"));
      if (events && Array.isArray(events) && events.length > 0) {
        broadcastEvents(events as eventWithTime[]);
      }
    } catch {
      // HACK: page may have closed or runtime not yet initialized
    }
  };

  const syncPage = (): void => {
    const page = getPage();
    if (!page || page.isClosed()) {
      currentPage = undefined;
      return;
    }
    currentPage = page;
  };

  const pollEvents = (): void => {
    syncPage();
    if (currentPage) {
      // HACK: fire-and-forget — next poll will catch up if this one fails
      collectFromPage(currentPage).catch(() => {});
    }
  };

  const pollInterval = setInterval(pollEvents, EVENT_COLLECT_INTERVAL_MS);
  const pageCheckInterval = setInterval(syncPage, LIVE_VIEW_PAGE_POLL_INTERVAL_MS);

  const handleSseRequest = (request: IncomingMessage, response: SseClient): void => {
    response.writeHead(200, {
      "Content-Type": "text/event-stream",
      Connection: "keep-alive",
      ...NO_CACHE_HEADERS,
    });
    response.flushHeaders();
    sseClients.add(response);

    request.on("close", () => {
      sseClients.delete(response);
    });
  };

  const routeRequest = (request: IncomingMessage, response: SseClient): void => {
    const pathname = new URL(request.url ?? "/", parsedUrl).pathname;

    if (pathname === "/") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", ...NO_CACHE_HEADERS });
      response.end(viewerHtml);
      return;
    }

    if (pathname === "/events") {
      handleSseRequest(request, response);
      return;
    }

    if (pathname === "/latest.json") {
      const body = JSON.stringify(accumulatedEvents);
      response.writeHead(200, {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
        ...NO_CACHE_HEADERS,
      });
      response.end(body);
      return;
    }

    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8", ...NO_CACHE_HEADERS });
    response.end("Not found");
  };

  const server = createServer(routeRequest);

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen({ host: parsedUrl.hostname, port: Number(parsedUrl.port) }, () => {
      server.off("error", reject);
      resolve();
    });
  });

  return {
    url: parsedUrl.toString(),
    close: async () => {
      clearInterval(pollInterval);
      clearInterval(pageCheckInterval);
      for (const client of sseClients) client.end();
      sseClients.clear();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
};
