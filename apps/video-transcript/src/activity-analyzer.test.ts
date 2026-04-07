import { describe, it, expect } from "vitest";
import { computeFrameDiff, classifySegments, formatTimeline } from "./activity-analyzer";

describe("computeFrameDiff", () => {
  it("returns 0 for identical frames", () => {
    const frame = Buffer.from([0, 128, 255, 64]);
    expect(computeFrameDiff(frame, frame)).toBe(0);
  });

  it("returns 1 for maximally different frames", () => {
    const black = Buffer.from([0, 0, 0, 0]);
    const white = Buffer.from([255, 255, 255, 255]);
    expect(computeFrameDiff(black, white)).toBeCloseTo(1, 5);
  });

  it("returns 0 for empty buffers", () => {
    expect(computeFrameDiff(Buffer.alloc(0), Buffer.alloc(0))).toBe(0);
  });

  it("computes correct diff for known values", () => {
    const frameA = Buffer.from([0, 0, 0, 0]);
    const frameB = Buffer.from([255, 0, 0, 0]);
    expect(computeFrameDiff(frameA, frameB)).toBeCloseTo(0.25, 5);
  });

  it("handles frames of different sizes using the shorter length", () => {
    const short = Buffer.from([0, 0]);
    const long = Buffer.from([255, 255, 255, 255]);
    expect(computeFrameDiff(short, long)).toBeCloseTo(1, 5);
  });
});

describe("classifySegments", () => {
  it("returns empty for no diffs", () => {
    expect(classifySegments([])).toEqual([]);
  });

  it("classifies all-idle diffs as a single idle segment", () => {
    const diffs = [0.001, 0.002, 0.001, 0.003, 0.002];
    const result = classifySegments(diffs);
    expect(result.length).toBe(1);
    expect(result[0]!.type).toBe("idle");
    expect(result[0]!.startSeconds).toBe(0);
    expect(result[0]!.endSeconds).toBe(5);
  });

  it("classifies all-active diffs as a single active segment", () => {
    const diffs = [0.05, 0.08, 0.06, 0.07];
    const result = classifySegments(diffs);
    expect(result.length).toBe(1);
    expect(result[0]!.type).toBe("active");
  });

  it("detects scene changes from high diffs", () => {
    const diffs = [0.01, 0.02, 0.5, 0.01, 0.02];
    const result = classifySegments(diffs);
    const sceneChanges = result.filter((s) => s.type === "scene_change");
    expect(sceneChanges.length).toBeGreaterThanOrEqual(1);
  });

  it("merges short idle gaps between active segments", () => {
    const diffs = [0.05, 0.06, 0.07, 0.001, 0.002, 0.05, 0.06, 0.07];
    const result = classifySegments(diffs);
    const idleSegments = result.filter((s) => s.type === "idle");
    expect(idleSegments.length).toBe(0);
    expect(result.every((s) => s.type === "active")).toBe(true);
  });

  it("preserves long idle gaps between active segments", () => {
    const diffs = [0.05, 0.06, 0.001, 0.002, 0.001, 0.002, 0.05, 0.06];
    const result = classifySegments(diffs);
    const idleSegments = result.filter((s) => s.type === "idle");
    expect(idleSegments.length).toBeGreaterThanOrEqual(1);
  });
});

describe("formatTimeline", () => {
  it("formats a simple timeline", () => {
    const timeline = [
      { type: "idle" as const, startSeconds: 0, endSeconds: 3 },
      { type: "active" as const, startSeconds: 3, endSeconds: 10 },
      { type: "idle" as const, startSeconds: 10, endSeconds: 12 },
    ];
    const result = formatTimeline(timeline);
    expect(result).toContain("00:00");
    expect(result).toContain("00:03");
    expect(result).toContain("active");
    expect(result).toContain("idle");
  });

  it("formats scene changes", () => {
    const timeline = [{ type: "scene_change" as const, startSeconds: 5, endSeconds: 6 }];
    const result = formatTimeline(timeline);
    expect(result).toContain("scene change (likely navigation)");
  });

  it("formats times with minutes", () => {
    const timeline = [{ type: "active" as const, startSeconds: 65, endSeconds: 130 }];
    const result = formatTimeline(timeline);
    expect(result).toContain("01:05");
    expect(result).toContain("02:10");
  });

  it("returns empty string for empty timeline", () => {
    expect(formatTimeline([])).toBe("");
  });
});
