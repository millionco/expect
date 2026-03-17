import { afterEach, describe, expect, it } from "vite-plus/test";
import { startLiveViewServer, type LiveViewServer } from "../src/mcp/live-view-server";

const findAvailablePort = async (): Promise<number> => {
  const { createServer } = await import("node:http");
  return new Promise((resolve) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
};

describe("startLiveViewServer", () => {
  let server: LiveViewServer | undefined;

  afterEach(async () => {
    if (server) {
      await server.close();
      server = undefined;
    }
  });

  it("starts and serves the HTML viewer at /", async () => {
    const port = await findAvailablePort();
    const collectedEvents: eventWithTime[] = [];

    server = await startLiveViewServer({
      liveViewUrl: `http://127.0.0.1:${port}`,
      getPage: () => undefined,
      onEventsCollected: (events) => collectedEvents.push(...events),
    });

    const response = await fetch(`http://127.0.0.1:${port}/`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    const html = await response.text();
    expect(html).toContain("Browser Tester Live View");
    expect(html).toContain("rrweb-player");
    expect(html).toContain("EventSource");
  });

  it("returns 404 for unknown routes", async () => {
    const port = await findAvailablePort();

    server = await startLiveViewServer({
      liveViewUrl: `http://127.0.0.1:${port}`,
      getPage: () => undefined,
      onEventsCollected: () => {},
    });

    const response = await fetch(`http://127.0.0.1:${port}/unknown`);
    expect(response.status).toBe(404);
  });

  it("serves accumulated events at /latest.json", async () => {
    const port = await findAvailablePort();

    server = await startLiveViewServer({
      liveViewUrl: `http://127.0.0.1:${port}`,
      getPage: () => undefined,
      onEventsCollected: () => {},
    });

    const response = await fetch(`http://127.0.0.1:${port}/latest.json`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    const events = await response.json();
    expect(events).toEqual([]);
  });

  it("exposes the server url", async () => {
    const port = await findAvailablePort();

    server = await startLiveViewServer({
      liveViewUrl: `http://127.0.0.1:${port}`,
      getPage: () => undefined,
      onEventsCollected: () => {},
    });

    expect(server.url).toBe(`http://127.0.0.1:${port}/`);
  });

  it("opens an SSE connection at /events", async () => {
    const port = await findAvailablePort();

    server = await startLiveViewServer({
      liveViewUrl: `http://127.0.0.1:${port}`,
      getPage: () => undefined,
      onEventsCollected: () => {},
    });

    const response = await fetch(`http://127.0.0.1:${port}/events`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");

    response.body?.cancel();
  });
});
