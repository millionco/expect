import { Effect } from "effect";
import { NodeFileSystem } from "@effect/platform-node";
import { describe, expect, it } from "vite-plus/test";
import type { eventWithTime } from "@rrweb/types";
import { buildViewerHtml } from "../src/viewer-server";
import { ViewerRunState } from "../src/viewer-events";

const run = <A, E>(effect: Effect.Effect<A, E>) =>
  Effect.runPromise(effect.pipe(Effect.provide(NodeFileSystem.layer)));

const fakeEvent = (type: number, timestamp: number): eventWithTime =>
  ({ type, timestamp, data: {} }) as eventWithTime;

describe("buildViewerHtml", () => {
  it("produces a self-contained HTML string with embedded data", async () => {
    const events = [fakeEvent(2, 1000), fakeEvent(3, 2000)];
    const stepState = new ViewerRunState({
      title: "Login Flow",
      status: "running",
      summary: "In progress",
      steps: [],
    });

    const html = await run(buildViewerHtml({ events, stepState }));

    expect(html).toContain("<!doctype html");
    expect(html).toContain("window.__VIEWER_DATA__=");
    expect(html).toContain("Login Flow");
    expect(html).toContain("In progress");
  });

  it("uses default run state when stepState is omitted", async () => {
    const html = await run(buildViewerHtml({ events: [] }));

    expect(html).toContain("window.__VIEWER_DATA__=");
    expect(html).toContain("running");
  });

  it("escapes angle brackets in serialized data to prevent script injection", async () => {
    const events = [
      { type: 2, timestamp: 1000, data: { text: "</script><img onerror=alert(1)>" } },
      fakeEvent(3, 2000),
    ] as eventWithTime[];

    const html = await run(buildViewerHtml({ events }));

    expect(html).not.toContain("</script><img");
    expect(html).toContain("\\u003c/script");
  });
});
