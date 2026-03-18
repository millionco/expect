import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { Page } from "playwright";
import {
  LIVE_VIEW_CAPTURE_INTERVAL_MS,
  LIVE_VIEW_JPEG_QUALITY,
  LIVE_VIEW_MJPEG_BOUNDARY,
} from "./constants";

export interface LiveViewServer {
  url: string;
  close: () => Promise<void>;
}

interface StartLiveViewServerOptions {
  liveViewUrl: string;
  getPage: () => Page | null;
}

const getViewerHtml = (): string => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Browser Tester Live View</title>
    <style>
      :root {
        color-scheme: dark;
      }

      body {
        margin: 0;
        font-family: ui-sans-serif, system-ui, sans-serif;
        background: #111827;
        color: #f9fafb;
      }

      main {
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
        box-sizing: border-box;
      }

      img {
        max-width: min(100%, 1200px);
        width: 100%;
        border-radius: 12px;
        background: #030712;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.45);
      }
    </style>
  </head>
  <body>
    <main>
      <img src="/stream.mjpeg" alt="Live browser stream" />
    </main>
  </body>
</html>
`;

const writeMjpegFrame = (response: ServerResponse<IncomingMessage>, frameBuffer: Buffer): void => {
  response.write(`--${LIVE_VIEW_MJPEG_BOUNDARY}\r\n`);
  response.write("Content-Type: image/jpeg\r\n");
  response.write(`Content-Length: ${frameBuffer.length}\r\n\r\n`);
  response.write(frameBuffer);
  response.write("\r\n");
};

export const startLiveViewServer = async ({
  liveViewUrl,
  getPage,
}: StartLiveViewServerOptions): Promise<LiveViewServer> => {
  const resolvedLiveViewUrl = new URL(liveViewUrl);
  const clientResponses = new Set<ServerResponse<IncomingMessage>>();
  let latestFrameBuffer: Buffer | null = null;
  let captureInProgress = false;

  const server = createServer((request, response) => {
    const requestUrl = new URL(request.url ?? "/", resolvedLiveViewUrl);

    if (requestUrl.pathname === "/") {
      response.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      });
      response.end(getViewerHtml());
      return;
    }

    if (requestUrl.pathname === "/latest.jpg") {
      if (!latestFrameBuffer) {
        response.writeHead(503, {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
        });
        response.end("Waiting for the first browser frame.");
        return;
      }

      response.writeHead(200, {
        "Content-Type": "image/jpeg",
        "Content-Length": latestFrameBuffer.length,
        "Cache-Control": "no-store",
      });
      response.end(latestFrameBuffer);
      return;
    }

    if (requestUrl.pathname === "/stream.mjpeg") {
      response.writeHead(200, {
        "Content-Type": `multipart/x-mixed-replace; boundary=${LIVE_VIEW_MJPEG_BOUNDARY}`,
        "Cache-Control": "no-store",
        Connection: "keep-alive",
      });
      response.flushHeaders();
      clientResponses.add(response);

      if (latestFrameBuffer) {
        writeMjpegFrame(response, latestFrameBuffer);
      }

      request.on("close", () => {
        clientResponses.delete(response);
      });
      return;
    }

    response.writeHead(404, {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    });
    response.end("Not found");
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(
      {
        host: resolvedLiveViewUrl.hostname,
        port: Number(resolvedLiveViewUrl.port),
      },
      () => {
        server.off("error", reject);
        resolve();
      },
    );
  });

  const captureInterval = setInterval(() => {
    const page = getPage();
    if (!page || page.isClosed() || captureInProgress) return;

    captureInProgress = true;

    void page
      .screenshot({
        type: "jpeg",
        quality: LIVE_VIEW_JPEG_QUALITY,
      })
      .then((frameBuffer) => {
        latestFrameBuffer = Buffer.from(frameBuffer);

        for (const response of clientResponses) {
          if (response.destroyed) {
            clientResponses.delete(response);
            continue;
          }

          try {
            writeMjpegFrame(response, latestFrameBuffer);
          } catch {
            clientResponses.delete(response);
            response.end();
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        captureInProgress = false;
      });
  }, LIVE_VIEW_CAPTURE_INTERVAL_MS);

  return {
    url: resolvedLiveViewUrl.toString(),
    close: async () => {
      clearInterval(captureInterval);

      for (const response of clientResponses) {
        response.end();
      }

      clientResponses.clear();

      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    },
  };
};
