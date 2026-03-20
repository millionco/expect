import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { Page } from "playwright";
import type { eventWithTime } from "@rrweb/types";
import { LIVE_VIEW_PAGE_POLL_INTERVAL_MS } from "./constants.js";
import { EVENT_COLLECT_INTERVAL_MS } from "../constants.js";
import { evaluateRuntime } from "../utils/evaluate-runtime.js";
import { Effect } from "effect";

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

const VIEWER_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Browser Tester Live View</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/rrweb-player@2.0.0-alpha.18/dist/style.css" />
    <style>
      :root { color-scheme: dark }
      body { margin: 0; font-family: ui-sans-serif, system-ui, sans-serif; background: #111827; color: #f9fafb }
      main { min-height: 100vh; display: grid; place-items: center; padding: 24px; box-sizing: border-box }
      #player-container { max-width: min(100%, 1200px); width: 100%; border-radius: 12px; background: #030712; box-shadow: 0 20px 60px rgba(0,0,0,.45); overflow: hidden }
      .status { text-align: center; padding: 16px; font-size: 14px; color: #9ca3af }
    </style>
  </head>
  <body>
    <main>
      <div id="player-container">
        <div class="status" id="status">Connecting...</div>
      </div>
    </main>
    <script type="module">
      import rrwebPlayer from 'https://cdn.jsdelivr.net/npm/rrweb-player@2.0.0-alpha.18/dist/rrweb-player.js';

      const container = document.getElementById('player-container');
      const statusEl = document.getElementById('status');
      let player = null;
      let allEvents = [];

      const initPlayer = (events) => {
        if (player) {
          player.getReplayer().addEvent(events[events.length - 1]);
          return;
        }
        if (events.length < 2) return;
        statusEl.remove();
        player = new rrwebPlayer({
          target: container,
          props: {
            events: events,
            width: 960,
            height: 540,
            autoPlay: true,
            showController: false,
            liveMode: true,
          },
        });
        player.getReplayer().startLive();
      };

      const response = await fetch('/latest.json');
      if (response.ok) {
        const initial = await response.json();
        allEvents = initial;
        if (allEvents.length >= 2) initPlayer(allEvents);
      }

      const eventSource = new EventSource('/events');
      eventSource.onmessage = (msg) => {
        try {
          const batch = JSON.parse(msg.data);
          for (const event of batch) {
            allEvents.push(event);
            if (player) {
              player.getReplayer().addEvent(event);
            }
          }
          if (!player && allEvents.length >= 2) initPlayer(allEvents);
          statusEl && (statusEl.textContent = 'Events: ' + allEvents.length);
        } catch {}
      };
      eventSource.onerror = () => {
        if (statusEl) statusEl.textContent = 'Connection lost. Retrying...';
      };
    </script>
  </body>
</html>`;

const NO_CACHE_HEADERS = { "Cache-Control": "no-store" } as const;

const respondText = (response: SseClient, status: number, body: string): void => {
  response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8", ...NO_CACHE_HEADERS });
  response.end(body);
};

export const startLiveViewServer = async ({
  liveViewUrl,
  getPage,
  onEventsCollected,
}: StartLiveViewServerOptions): Promise<LiveViewServer> => {
  const parsedUrl = new URL(liveViewUrl);
  const sseClients = new Set<SseClient>();
  const accumulatedEvents: eventWithTime[] = [];
  let currentPage: Page | undefined;

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
      response.end(VIEWER_HTML);
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

    respondText(response, 404, "Not found");
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
