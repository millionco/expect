import { describe, expect, it, vi, beforeEach, afterEach } from "vite-plus/test";
import { createCiReporter } from "../src/utils/ci-reporter";

describe("createCiReporter", () => {
  let stderrOutput: string[];
  let stdoutOutput: string[];
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stderrOutput = [];
    stdoutOutput = [];
    stderrSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        stderrOutput.push(String(chunk));
        return true;
      });
    stdoutSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        stdoutOutput.push(String(chunk));
        return true;
      });
  });

  afterEach(() => {
    stderrSpy.mockRestore();
    stdoutSpy.mockRestore();
  });

  const stderrText = () => stderrOutput.join("");
  const stdoutText = () => stdoutOutput.join("");

  describe("header", () => {
    it("includes version and agent", () => {
      const reporter = createCiReporter({
        version: "1.2.3",
        agent: "claude",
        timeoutMs: undefined,
        isGitHubActions: false,
      });
      reporter.header();
      const output = stderrText();
      expect(output).toContain("expect");
      expect(output).toContain("v1.2.3");
      expect(output).toContain("claude");
    });

    it("includes timeout when specified", () => {
      const reporter = createCiReporter({
        version: "1.0.0",
        agent: "claude",
        timeoutMs: 1_800_000,
        isGitHubActions: false,
      });
      reporter.header();
      const output = stderrText();
      expect(output).toContain("timeout");
      expect(output).toContain("30m");
    });

    it("omits timeout when undefined", () => {
      const reporter = createCiReporter({
        version: "1.0.0",
        agent: "claude",
        timeoutMs: undefined,
        isGitHubActions: false,
      });
      reporter.header();
      const output = stderrText();
      expect(output).not.toContain("timeout");
    });
  });

  describe("planTitle", () => {
    it("prints title and base URL", () => {
      const reporter = createCiReporter({
        version: "1.0.0",
        agent: "claude",
        timeoutMs: undefined,
        isGitHubActions: false,
      });
      reporter.planTitle("Verify login flow", "http://localhost:3000");
      const output = stderrText();
      expect(output).toContain("Verify login flow");
      expect(output).toContain("http://localhost:3000");
    });

    it("omits base URL when undefined", () => {
      const reporter = createCiReporter({
        version: "1.0.0",
        agent: "claude",
        timeoutMs: undefined,
        isGitHubActions: false,
      });
      reporter.planTitle("Verify login flow", undefined);
      const output = stderrText();
      expect(output).toContain("Verify login flow");
      expect(output).not.toContain("localhost");
    });
  });

  describe("GHA group commands", () => {
    it("emits ::group:: and ::endgroup:: on stdout in GHA mode", () => {
      const reporter = createCiReporter({
        version: "1.0.0",
        agent: "claude",
        timeoutMs: undefined,
        isGitHubActions: true,
      });
      reporter.groupOpen();
      reporter.groupClose();
      const output = stdoutText();
      expect(output).toContain("::group::");
      expect(output).toContain("::endgroup::");
    });

    it("emits nothing outside GHA mode", () => {
      const reporter = createCiReporter({
        version: "1.0.0",
        agent: "claude",
        timeoutMs: undefined,
        isGitHubActions: false,
      });
      reporter.groupOpen();
      reporter.groupClose();
      expect(stdoutText()).toBe("");
    });
  });

  describe("step events", () => {
    it("stepStarted writes to stderr", () => {
      const reporter = createCiReporter({
        version: "1.0.0",
        agent: "claude",
        timeoutMs: undefined,
        isGitHubActions: false,
      });
      reporter.stepStarted("Navigate to login page");
      expect(stderrText()).toContain("Navigate to login page");
    });

    it("stepCompleted includes title and duration", () => {
      const reporter = createCiReporter({
        version: "1.0.0",
        agent: "claude",
        timeoutMs: undefined,
        isGitHubActions: false,
      });
      reporter.stepCompleted("Navigate to login page", 1200);
      const output = stderrText();
      expect(output).toContain("Navigate to login page");
      expect(output).toContain("1s");
    });

    it("stepCompleted works without duration", () => {
      const reporter = createCiReporter({
        version: "1.0.0",
        agent: "claude",
        timeoutMs: undefined,
        isGitHubActions: false,
      });
      reporter.stepCompleted("Navigate to login page", undefined);
      const output = stderrText();
      expect(output).toContain("Navigate to login page");
    });

    it("stepFailed includes error message on stderr", () => {
      const reporter = createCiReporter({
        version: "1.0.0",
        agent: "claude",
        timeoutMs: undefined,
        isGitHubActions: false,
      });
      reporter.stepFailed("Submit form", "Button not found", 2000);
      const output = stderrText();
      expect(output).toContain("Submit form");
      expect(output).toContain("Button not found");
    });

    it("stepFailed emits ::error on stdout in GHA mode", () => {
      const reporter = createCiReporter({
        version: "1.0.0",
        agent: "claude",
        timeoutMs: undefined,
        isGitHubActions: true,
      });
      reporter.stepFailed("Submit form", "Button not found", 2000);
      expect(stdoutText()).toContain("::error");
      expect(stdoutText()).toContain("Button not found");
    });

    it("stepFailed does not emit ::error outside GHA", () => {
      const reporter = createCiReporter({
        version: "1.0.0",
        agent: "claude",
        timeoutMs: undefined,
        isGitHubActions: false,
      });
      reporter.stepFailed("Submit form", "Button not found", 2000);
      expect(stdoutText()).toBe("");
    });

    it("stepSkipped includes title and skipped label", () => {
      const reporter = createCiReporter({
        version: "1.0.0",
        agent: "claude",
        timeoutMs: undefined,
        isGitHubActions: false,
      });
      reporter.stepSkipped("Optional step", "Not applicable");
      const output = stderrText();
      expect(output).toContain("Optional step");
      expect(output).toContain("[skipped]");
      expect(output).toContain("Not applicable");
    });
  });

  describe("summary", () => {
    it("shows passed, failed, and total", () => {
      const reporter = createCiReporter({
        version: "1.0.0",
        agent: "claude",
        timeoutMs: undefined,
        isGitHubActions: false,
      });
      reporter.summary(2, 1, 0, 3, 4100);
      const output = stderrText();
      expect(output).toContain("2 passed");
      expect(output).toContain("1 failed");
      expect(output).toContain("(3)");
      expect(output).toContain("Tests");
      expect(output).toContain("Time");
    });

    it("includes skipped count when present", () => {
      const reporter = createCiReporter({
        version: "1.0.0",
        agent: "claude",
        timeoutMs: undefined,
        isGitHubActions: false,
      });
      reporter.summary(1, 0, 2, 3, 1000);
      const output = stderrText();
      expect(output).toContain("2 skipped");
    });
  });

  describe("artifacts", () => {
    it("shows video and replay paths", () => {
      const reporter = createCiReporter({
        version: "1.0.0",
        agent: "claude",
        timeoutMs: undefined,
        isGitHubActions: false,
      });
      reporter.artifacts("/tmp/video.mp4", "file:///tmp/replay.html");
      const output = stderrText();
      expect(output).toContain("Artifacts");
      expect(output).toContain("/tmp/video.mp4");
      expect(output).toContain("file:///tmp/replay.html");
    });

    it("shows nothing when both are undefined", () => {
      const reporter = createCiReporter({
        version: "1.0.0",
        agent: "claude",
        timeoutMs: undefined,
        isGitHubActions: false,
      });
      reporter.artifacts(undefined, undefined);
      expect(stderrText()).toBe("");
    });
  });

  describe("timeoutError", () => {
    it("prints timeout message to stderr", () => {
      const reporter = createCiReporter({
        version: "1.0.0",
        agent: "claude",
        timeoutMs: undefined,
        isGitHubActions: false,
      });
      reporter.timeoutError(1_800_000);
      const output = stderrText();
      expect(output).toContain("Timeout");
      expect(output).toContain("30m");
    });

    it("emits GHA annotation in GHA mode", () => {
      const reporter = createCiReporter({
        version: "1.0.0",
        agent: "claude",
        timeoutMs: undefined,
        isGitHubActions: true,
      });
      reporter.timeoutError(1_800_000);
      expect(stdoutText()).toContain("::error");
    });
  });

  describe("heartbeat", () => {
    it("prints elapsed time", () => {
      const reporter = createCiReporter({
        version: "1.0.0",
        agent: "claude",
        timeoutMs: undefined,
        isGitHubActions: false,
      });
      reporter.heartbeat(120_000);
      const output = stderrText();
      expect(output).toContain("Still running");
      expect(output).toContain("2m");
    });
  });
});
