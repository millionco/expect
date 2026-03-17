import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { CDPSession, Page } from "playwright";
import {
  LIVE_VIEW_MJPEG_BOUNDARY,
  LIVE_VIEW_PAGE_POLL_INTERVAL_MS,
  LIVE_VIEW_SCREENCAST_EVERY_NTH_FRAME,
  LIVE_VIEW_SCREENCAST_MAX_HEIGHT_PX,
  LIVE_VIEW_SCREENCAST_MAX_WIDTH_PX,
  LIVE_VIEW_SCREENCAST_QUALITY,
} from "./constants.js";

export interface LiveViewServer {
  url: string;
  close: () => Promise<void>;
}

interface StartLiveViewServerOptions {
  liveViewUrl: string;
  getPage: () => Page | undefined;
}

interface ScreencastFrameParams {
  data: string;
  sessionId: number;
  metadata: unknown;
}

type MjpegClient = ServerResponse<IncomingMessage>;

const VIEWER_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Browser Tester Live View</title>
    <style>
      :root { color-scheme: dark }
      body { margin: 0; font-family: ui-sans-serif, system-ui, sans-serif; background: #111827; color: #f9fafb }
      main { min-height: 100vh; display: grid; place-items: center; padding: 24px; box-sizing: border-box }
      img { max-width: min(100%, 1200px); width: 100%; border-radius: 12px; background: #030712; box-shadow: 0 20px 60px rgba(0,0,0,.45) }
    </style>
  </head>
  <body>
    <main><img src="/stream.mjpeg" alt="Live browser stream" /></main>
  </body>
</html>`;

const NO_CACHE_HEADERS = { "Cache-Control": "no-store" } as const;

const respondText = (response: MjpegClient, status: number, body: string): void => {
  response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8", ...NO_CACHE_HEADERS });
  response.end(body);
};

const writeMjpegFrame = (client: MjpegClient, frameBuffer: Buffer): void => {
  client.write(
    `--${LIVE_VIEW_MJPEG_BOUNDARY}\r\nContent-Type: image/jpeg\r\nContent-Length: ${frameBuffer.length}\r\n\r\n`,
  );
  client.write(frameBuffer);
  client.write("\r\n");
};

export const startLiveViewServer = async ({
  liveViewUrl,
  getPage,
}: StartLiveViewServerOptions): Promise<LiveViewServer> => {
  const parsedUrl = new URL(liveViewUrl);
  const viewers = new Set<MjpegClient>();
  let latestFrame: Buffer | undefined;
  let cdpSession: CDPSession | undefined;
  let screencastPage: Page | undefined;

  const broadcastFrame = (frameBuffer: Buffer): void => {
    latestFrame = frameBuffer;
    for (const viewer of viewers) {
      if (viewer.destroyed) {
        viewers.delete(viewer);
        continue;
      }
      try {
        writeMjpegFrame(viewer, frameBuffer);
      } catch {
        viewers.delete(viewer);
        viewer.end();
      }
    }
  };

  const stopScreencast = async (): Promise<void> => {
    if (!cdpSession) return;
    const activeCdpSession = cdpSession;
    cdpSession = undefined;
    screencastPage = undefined;
    try {
      await activeCdpSession.send("Page.stopScreencast");
      await activeCdpSession.detach();
    } catch {
      // HACK: CDP session may already be detached if the page closed
    }
  };

  const startScreencast = async (page: Page): Promise<void> => {
    if (screencastPage === page) return;
    await stopScreencast();

    screencastPage = page;
    const cdp = await page.context().newCDPSession(page);
    cdpSession = cdp;

    cdp.on("Page.screencastFrame", (params: ScreencastFrameParams) => {
      broadcastFrame(Buffer.from(params.data, "base64"));
      // HACK: fire-and-forget ack — failure is non-critical and the CDP session may be gone
      cdp.send("Page.screencastFrameAck", { sessionId: params.sessionId }).catch(() => {});
    });

    await cdp.send("Page.startScreencast", {
      format: "jpeg",
      quality: LIVE_VIEW_SCREENCAST_QUALITY,
      maxWidth: LIVE_VIEW_SCREENCAST_MAX_WIDTH_PX,
      maxHeight: LIVE_VIEW_SCREENCAST_MAX_HEIGHT_PX,
      everyNthFrame: LIVE_VIEW_SCREENCAST_EVERY_NTH_FRAME,
    });

    page.once("close", () => {
      if (screencastPage === page) void stopScreencast();
    });
  };

  const syncScreencast = (): void => {
    if (viewers.size === 0) {
      if (screencastPage) void stopScreencast();
      return;
    }
    const page = getPage();
    if (!page || page.isClosed()) {
      if (screencastPage) void stopScreencast();
      return;
    }
    if (page !== screencastPage) {
      // HACK: best-effort screencast start — page may close before setup completes
      startScreencast(page).catch(() => {});
    }
  };

  const pollInterval = setInterval(syncScreencast, LIVE_VIEW_PAGE_POLL_INTERVAL_MS);

  const handleStreamRequest = (request: IncomingMessage, response: MjpegClient): void => {
    response.writeHead(200, {
      "Content-Type": `multipart/x-mixed-replace; boundary=${LIVE_VIEW_MJPEG_BOUNDARY}`,
      Connection: "keep-alive",
      ...NO_CACHE_HEADERS,
    });
    response.flushHeaders();
    viewers.add(response);
    syncScreencast();

    if (latestFrame) writeMjpegFrame(response, latestFrame);

    request.on("close", () => {
      viewers.delete(response);
      if (viewers.size === 0) void stopScreencast();
    });
  };

  const routeRequest = (request: IncomingMessage, response: MjpegClient): void => {
    const pathname = new URL(request.url ?? "/", parsedUrl).pathname;

    if (pathname === "/") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", ...NO_CACHE_HEADERS });
      response.end(VIEWER_HTML);
      return;
    }

    if (pathname === "/latest.jpg") {
      if (!latestFrame) {
        respondText(response, 503, "Waiting for the first browser frame.");
        return;
      }
      response.writeHead(200, {
        "Content-Type": "image/jpeg",
        "Content-Length": latestFrame.length,
        ...NO_CACHE_HEADERS,
      });
      response.end(latestFrame);
      return;
    }

    if (pathname === "/stream.mjpeg") {
      handleStreamRequest(request, response);
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
      await stopScreencast();
      for (const viewer of viewers) viewer.end();
      viewers.clear();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
};
