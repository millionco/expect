import { describe, expect, it } from "vite-plus/test";
import { Schema } from "effect";
import { CiResultOutput, CiStepResult } from "../src/models";

describe("CiStepResult", () => {
  it("creates a passed step", () => {
    const step = new CiStepResult({
      title: "Navigate to login",
      status: "passed",
      duration_ms: 1200,
    });
    expect(step.title).toBe("Navigate to login");
    expect(step.status).toBe("passed");
    expect(step.duration_ms).toBe(1200);
    expect(step.error).toBeUndefined();
  });

  it("creates a failed step with error", () => {
    const step = new CiStepResult({
      title: "Submit form",
      status: "failed",
      duration_ms: 2100,
      error: "Submit button not found",
    });
    expect(step.status).toBe("failed");
    expect(step.error).toBe("Submit button not found");
  });

  it("creates a step without optional fields", () => {
    const step = new CiStepResult({
      title: "Skipped step",
      status: "skipped",
    });
    expect(step.duration_ms).toBeUndefined();
    expect(step.error).toBeUndefined();
  });

  it("accepts not-run status", () => {
    const step = new CiStepResult({
      title: "Pending step",
      status: "not-run",
    });
    expect(step.status).toBe("not-run");
  });
});

describe("CiResultOutput", () => {
  it("creates a passing result", () => {
    const result = new CiResultOutput({
      version: "0.1.0",
      status: "passed",
      title: "Verify login flow",
      duration_ms: 4100,
      steps: [
        new CiStepResult({ title: "Navigate", status: "passed", duration_ms: 1000 }),
        new CiStepResult({ title: "Submit", status: "passed", duration_ms: 3100 }),
      ],
      artifacts: { video: "/tmp/video.mp4" },
      summary: "2 passed, 0 failed out of 2 steps",
    });
    expect(result.status).toBe("passed");
    expect(result.steps.length).toBe(2);
    expect(result.artifacts.video).toBe("/tmp/video.mp4");
    expect(result.artifacts.replay).toBeUndefined();
  });

  it("creates a failing result", () => {
    const result = new CiResultOutput({
      version: "0.1.0",
      status: "failed",
      title: "Verify login flow",
      duration_ms: 2000,
      steps: [
        new CiStepResult({
          title: "Submit form",
          status: "failed",
          duration_ms: 2000,
          error: "Button not found",
        }),
      ],
      artifacts: {},
      summary: "0 passed, 1 failed out of 1 step",
    });
    expect(result.status).toBe("failed");
    expect(result.steps[0].error).toBe("Button not found");
  });

  it("encodes to JSON via Schema.encodeSync", () => {
    const result = new CiResultOutput({
      version: "0.1.0",
      status: "passed",
      title: "Test",
      duration_ms: 1000,
      steps: [new CiStepResult({ title: "Step 1", status: "passed", duration_ms: 1000 })],
      artifacts: { video: "/tmp/v.mp4", replay: "/tmp/r.html" },
      summary: "1 passed",
    });
    const encoded = Schema.encodeSync(CiResultOutput)(result);
    expect(encoded.version).toBe("0.1.0");
    expect(encoded.status).toBe("passed");
    expect(encoded.steps.length).toBe(1);
    expect(encoded.artifacts.video).toBe("/tmp/v.mp4");
    expect(encoded.artifacts.replay).toBe("/tmp/r.html");
  });

  it("round-trips through encode and decode", () => {
    const original = new CiResultOutput({
      version: "0.1.0",
      status: "failed",
      title: "Test run",
      duration_ms: 5000,
      steps: [
        new CiStepResult({ title: "Step A", status: "passed", duration_ms: 2000 }),
        new CiStepResult({ title: "Step B", status: "failed", error: "Oops" }),
      ],
      artifacts: {},
      summary: "1 passed, 1 failed",
    });
    const encoded = Schema.encodeSync(CiResultOutput)(original);
    const decoded = Schema.decodeSync(CiResultOutput)(encoded);
    expect(decoded.version).toBe(original.version);
    expect(decoded.status).toBe(original.status);
    expect(decoded.steps.length).toBe(2);
    expect(decoded.steps[1].error).toBe("Oops");
  });
});
