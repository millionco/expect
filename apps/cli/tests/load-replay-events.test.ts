import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import { Effect } from "effect";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { loadReplayEvents } from "../src/utils/load-replay-events";

const TEMP_DIR_PREFIX = "load-replay-events-test-";

const run = <A, E>(effect: Effect.Effect<A, E>) =>
  Effect.runPromise(effect.pipe(Effect.provide(NodeFileSystem.layer)));

const createReplayServer = async (events: unknown[]) => {
  let server: Server | undefined;
  const url = await new Promise<string>((resolve) => {
    server = createServer((request, response) => {
      if (request.url !== "/latest.json") {
        response.writeHead(404);
        response.end();
        return;
      }

      const body = JSON.stringify(events);
      response.writeHead(200, {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      });
      response.end(body);
    });

    server.listen(0, "127.0.0.1", () => {
      const address = server?.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve(`http://127.0.0.1:${port}`);
    });
  });

  return {
    url,
    close: async () =>
      new Promise<void>((resolve) => {
        server?.close(() => resolve());
      }),
  };
};

describe("loadReplayEvents", () => {
  let tempDir: string | undefined;
  let closeServer: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (closeServer) {
      await closeServer();
      closeServer = undefined;
    }

    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it("prefers finalized replay artifacts over the live endpoint", async () => {
    tempDir = mkdtempSync(join(tmpdir(), TEMP_DIR_PREFIX));
    const replaySessionPath = join(tempDir, "session.ndjson");
    const finalizedEvents = [
      { type: 2, timestamp: 1000, data: { href: "https://expect.dev" } },
      { type: 3, timestamp: 2000, data: { source: 0 } },
    ];
    writeFileSync(
      replaySessionPath,
      finalizedEvents.map((event) => JSON.stringify(event)).join("\n") + "\n",
    );

    const replayServer = await createReplayServer([]);
    closeServer = replayServer.close;

    const events = await run(
      loadReplayEvents({
        liveViewUrl: replayServer.url,
        replaySessionPath,
      }),
    );

    expect(events).toEqual(finalizedEvents);
  });

  it("falls back to the live endpoint when the finalized artifact is unavailable", async () => {
    const liveEvents = [
      { type: 2, timestamp: 3000, data: { href: "https://million.dev" } },
      { type: 3, timestamp: 4000, data: { source: 1 } },
    ];
    const replayServer = await createReplayServer(liveEvents);
    closeServer = replayServer.close;

    const events = await run(
      loadReplayEvents({
        liveViewUrl: replayServer.url,
        replaySessionPath: "/tmp/does-not-exist.ndjson",
      }),
    );

    expect(events).toEqual(liveEvents);
  });
});
