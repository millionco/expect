import { describe, expect, it } from "vite-plus/test";
import { buildReplayViewerHtml } from "../src/replay-viewer";

describe("buildReplayViewerHtml", () => {
  it("escapes HTML entities in title", () => {
    const html = buildReplayViewerHtml({ title: '<script>alert("xss")</script>' });
    expect(html).toContain("&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert");
  });

  it("includes rrweb player with live mode in SSE mode", () => {
    const html = buildReplayViewerHtml({ title: "Live", eventsSource: "sse" });
    expect(html).toContain("rrweb-player");
    expect(html).toContain("EventSource");
    expect(html).toContain("liveMode: true");
    expect(html).toContain("autoPlay: true");
    expect(html).toContain("showController: false");
  });

  it("includes rrweb player with controller in NDJSON mode", () => {
    const html = buildReplayViewerHtml({
      title: "Replay",
      eventsSource: { ndjsonPath: "/session.ndjson" },
    });
    expect(html).toContain("rrweb-player");
    expect(html).toContain("/session.ndjson");
    expect(html).not.toContain("EventSource");
    expect(html).toContain("autoPlay: false");
    expect(html).toContain("showController: true");
  });

  it("omits replay section when no eventsSource", () => {
    const html = buildReplayViewerHtml({ title: "No Replay" });
    expect(html).not.toContain('<div id="replay-container">');
    expect(html).not.toContain("rrweb-player.js");
  });

  it("renders steps panel with initial step data", () => {
    const html = buildReplayViewerHtml({
      title: "Steps Test",
      steps: {
        title: "My Run",
        status: "running",
        summary: undefined,
        steps: [
          { stepId: "1", title: "Navigate", status: "passed", summary: undefined },
          { stepId: "2", title: "Click button", status: "active", summary: "clicking" },
        ],
      },
    });
    expect(html).toContain("steps-panel");
    expect(html).toContain("My Run");
  });

  it("includes bodyHtml when provided", () => {
    const html = buildReplayViewerHtml({
      title: "Custom",
      bodyHtml: "<h2>Extra content here</h2>",
    });
    expect(html).toContain("<h2>Extra content here</h2>");
  });

  it("escapes single quotes in NDJSON path", () => {
    const html = buildReplayViewerHtml({
      title: "Escape",
      eventsSource: { ndjsonPath: "/path/with'quote.ndjson" },
    });
    expect(html).toContain("\\'");
    expect(html).not.toContain("with'quote");
  });

  it("includes rrweb player CSS only when eventsSource is provided", () => {
    const withSource = buildReplayViewerHtml({ title: "A", eventsSource: "sse" });
    const withoutSource = buildReplayViewerHtml({ title: "B" });
    expect(withSource).toContain("rrweb-player@");
    expect(withoutSource).not.toContain("rrweb-player@");
  });

  it("produces valid HTML document structure", () => {
    const html = buildReplayViewerHtml({ title: "Structure" });
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("<html>");
    expect(html).toContain("</html>");
    expect(html).toContain('<meta charset="utf-8"');
  });
});
