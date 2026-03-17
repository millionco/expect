import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Effect } from "effect";
import { NodeFileSystem } from "@effect/platform-node";
import { describe, expect, it, afterEach } from "vite-plus/test";
import type { eventWithTime } from "@rrweb/types";
import { saveSession, loadSession } from "../src/recorder";

const run = <A, E>(effect: Effect.Effect<A, E>) =>
  Effect.runPromise(effect.pipe(Effect.provide(NodeFileSystem.layer)));

const TEMP_DIR_PREFIX = "recorder-test-";

const fakeEvent = (type: number, timestamp: number): eventWithTime =>
  ({ type, timestamp, data: {} }) as eventWithTime;

describe("saveSession", () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  });

  it("writes events as NDJSON with trailing newline", async () => {
    tempDir = mkdtempSync(join(tmpdir(), TEMP_DIR_PREFIX));
    const outputPath = join(tempDir, "session.ndjson");
    const events = [fakeEvent(2, 1000), fakeEvent(3, 2000)];

    await run(saveSession(events, outputPath));

    const content = readFileSync(outputPath, "utf-8");
    const lines = content.trimEnd().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0])).toEqual(events[0]);
    expect(JSON.parse(lines[1])).toEqual(events[1]);
    expect(content.endsWith("\n")).toBe(true);
  });

  it("writes empty NDJSON for empty events array", async () => {
    tempDir = mkdtempSync(join(tmpdir(), TEMP_DIR_PREFIX));
    const outputPath = join(tempDir, "empty.ndjson");

    await run(saveSession([], outputPath));

    const content = readFileSync(outputPath, "utf-8");
    expect(content).toBe("\n");
  });
});

describe("loadSession", () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  });

  it("reads NDJSON and returns parsed events", async () => {
    tempDir = mkdtempSync(join(tmpdir(), TEMP_DIR_PREFIX));
    const sessionPath = join(tempDir, "session.ndjson");
    const events = [fakeEvent(2, 1000), fakeEvent(3, 2000), fakeEvent(3, 3000)];
    writeFileSync(sessionPath, events.map((event) => JSON.stringify(event)).join("\n") + "\n");

    const loaded = await run(loadSession(sessionPath));

    expect(loaded).toHaveLength(3);
    expect(loaded[0]).toEqual(events[0]);
    expect(loaded[2]).toEqual(events[2]);
  });

  it("fails with SessionLoadError for nonexistent file", async () => {
    const result = await Effect.runPromiseExit(
      loadSession("/nonexistent/path/session.ndjson").pipe(Effect.provide(NodeFileSystem.layer)),
    );

    expect(result._tag).toBe("Failure");
    if (result._tag === "Failure") {
      const error = result.cause;
      expect(String(error)).toContain("SessionLoadError");
    }
  });

  it("fails with SessionLoadError for invalid JSON line", async () => {
    tempDir = mkdtempSync(join(tmpdir(), TEMP_DIR_PREFIX));
    const sessionPath = join(tempDir, "bad.ndjson");
    writeFileSync(sessionPath, '{"type":2}\nnot-json\n{"type":3}\n');

    const result = await Effect.runPromiseExit(
      loadSession(sessionPath).pipe(Effect.provide(NodeFileSystem.layer)),
    );

    expect(result._tag).toBe("Failure");
    if (result._tag === "Failure") {
      expect(String(result.cause)).toContain("SessionLoadError");
      expect(String(result.cause)).toContain("line 2");
    }
  });

  it("round-trips through saveSession and loadSession", async () => {
    tempDir = mkdtempSync(join(tmpdir(), TEMP_DIR_PREFIX));
    const sessionPath = join(tempDir, "roundtrip.ndjson");
    const events = [fakeEvent(2, 100), fakeEvent(3, 200), fakeEvent(4, 300)];

    await run(saveSession(events, sessionPath));
    const loaded = await run(loadSession(sessionPath));

    expect(loaded).toEqual(events);
  });
});
