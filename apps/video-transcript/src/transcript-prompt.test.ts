import { describe, it, expect } from "vitest";
import { buildTranscriptPrompt } from "./transcript-prompt";

describe("buildTranscriptPrompt", () => {
  it("returns base prompt when timeline is undefined", () => {
    const result = buildTranscriptPrompt(undefined);
    expect(result).toContain("screen recording");
    expect(result).toContain("[MM:SS] ACTION:");
    expect(result).not.toContain("Activity timeline");
  });

  it("returns base prompt when timeline is empty", () => {
    const result = buildTranscriptPrompt([]);
    expect(result).toContain("screen recording");
    expect(result).not.toContain("Activity timeline");
  });

  it("appends timeline section when timeline is provided", () => {
    const timeline = [
      { type: "idle" as const, startSeconds: 0, endSeconds: 2 },
      { type: "active" as const, startSeconds: 2, endSeconds: 10 },
      { type: "idle" as const, startSeconds: 10, endSeconds: 12 },
    ];
    const result = buildTranscriptPrompt(timeline);
    expect(result).toContain("Activity timeline (from frame analysis):");
    expect(result).toContain("active");
    expect(result).toContain("idle");
    expect(result).toContain("Focus your transcript on the active segments");
  });

  it("includes scene change labels in timeline", () => {
    const timeline = [
      { type: "active" as const, startSeconds: 0, endSeconds: 5 },
      { type: "scene_change" as const, startSeconds: 5, endSeconds: 6 },
      { type: "active" as const, startSeconds: 6, endSeconds: 12 },
    ];
    const result = buildTranscriptPrompt(timeline);
    expect(result).toContain("scene change (likely navigation)");
  });

  it("always includes the structured format instructions", () => {
    const result = buildTranscriptPrompt([
      { type: "active" as const, startSeconds: 0, endSeconds: 10 },
    ]);
    expect(result).toContain("ACTION:");
    expect(result).toContain("TARGET:");
    expect(result).toContain("RESULT:");
    expect(result).toContain("URL:");
  });
});
