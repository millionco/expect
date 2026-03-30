import { describe, it, assert } from "@effect/vitest";
import { Effect, FileSystem, Layer, Option, Stream } from "effect";
import { PlanId, TestPlan, ChangesFor } from "@expect/shared/models";
import type { LiveUpdatePayload } from "@expect/shared/rpcs";
import { LiveViewer } from "../src/live-viewer";
import { Tail } from "../src/tail";
import { GitRepoRoot } from "../src/git/git";

const makePlan = (id: string, title: string): TestPlan =>
  new TestPlan({
    id: PlanId.makeUnsafe(id),
    title,
    rationale: "test",
    steps: [],
    changesFor: ChangesFor.makeUnsafe({ _tag: "WorkingTree" }),
    currentBranch: "main",
    diffPreview: "",
    fileStats: [],
    instruction: title,
    baseUrl: Option.none(),
    isHeadless: false,
    requiresCookies: false,
    testCoverage: Option.none(),
  });

const makeRrwebBatch = (count: number): LiveUpdatePayload => ({
  _tag: "RrwebBatch",
  events: Array.from({ length: count }, (_, index) => ({
    type: 0,
    timestamp: index,
  })),
});

const makeTestLayer = () => {
  const files = new Map<string, Uint8Array>();

  const mockFs = Layer.mock(FileSystem.FileSystem, {
    makeDirectory: () => Effect.void,
    exists: (filePath) => Effect.succeed(files.has(filePath)),
    writeFileString: (filePath, content, options) =>
      Effect.sync(() => {
        const data = new TextEncoder().encode(content);
        if (options?.flag === "a") {
          const existing = files.get(filePath) ?? new Uint8Array(0);
          const merged = new Uint8Array(existing.length + data.length);
          merged.set(existing);
          merged.set(data, existing.length);
          files.set(filePath, merged);
        } else {
          files.set(filePath, data);
        }
      }),
    readDirectory: (dirPath) =>
      Effect.sync(() =>
        [...files.keys()]
          .filter((key) => key.startsWith(dirPath + "/"))
          .map((key) => key.slice(dirPath.length + 1))
          .filter((name) => !name.includes("/")),
      ),
    stream: (filePath, options) => {
      const content = files.get(filePath);
      if (!content) return Stream.die(new Error(`File not found: ${filePath}`));
      const offset = Number(options?.offset ?? 0);
      const bytesToRead = options?.bytesToRead
        ? Number(options.bytesToRead)
        : content.length - offset;
      return Stream.make(content.slice(offset, offset + bytesToRead));
    },
    stat: (filePath) =>
      Effect.sync(() => ({
        type: "File" as const,
        size: FileSystem.Size(files.get(filePath)?.length ?? 0),
        mtime: Option.none(),
        atime: Option.none(),
        ctime: Option.none(),
        dev: 0,
        ino: undefined,
        mode: 0o644,
        nlink: 1,
        uid: 0,
        gid: 0,
        rdev: 0,
        blksize: undefined,
        blocks: undefined,
      })),
  });

  const tailLayer = Layer.effect(Tail)(Tail.make).pipe(Layer.provide(mockFs));

  const layer = Layer.effect(LiveViewer)(LiveViewer.make).pipe(
    Layer.provide(Layer.succeed(GitRepoRoot, "/test-repo")),
    Layer.provide(tailLayer),
    Layer.provide(mockFs),
  );

  return { layer, files };
};

describe("LiveViewer", () => {
  it.effect("push writes InitialPlan to ndjson file", () => {
    const { layer, files } = makeTestLayer();
    return Effect.gen(function* () {
      const liveViewer = yield* LiveViewer;
      const plan = makePlan("plan-001", "Test plan one");
      yield* liveViewer.push(plan.id, { _tag: "InitialPlan", plan });

      const ndjsonPath = "/test-repo/.expect/replays/plan-001.ndjson";
      assert.isTrue(files.has(ndjsonPath));
      const content = new TextDecoder().decode(files.get(ndjsonPath)!);
      const parsed = JSON.parse(content.trim());
      assert.strictEqual(parsed._tag, "InitialPlan");
    }).pipe(Effect.provide(layer));
  });

  it.effect("push appends multiple payloads to ndjson file", () => {
    const { layer, files } = makeTestLayer();
    return Effect.gen(function* () {
      const liveViewer = yield* LiveViewer;
      const plan = makePlan("plan-002", "Multi push");
      yield* liveViewer.push(plan.id, { _tag: "InitialPlan", plan });
      yield* liveViewer.push(plan.id, makeRrwebBatch(2));
      yield* liveViewer.push(plan.id, makeRrwebBatch(3));

      const ndjsonPath = "/test-repo/.expect/replays/plan-002.ndjson";
      const content = new TextDecoder().decode(files.get(ndjsonPath)!);
      const lines = content.trim().split("\n");
      assert.strictEqual(lines.length, 3);

      const parsed = lines.map((line) => JSON.parse(line));
      assert.strictEqual(parsed[0]._tag, "InitialPlan");
      assert.strictEqual(parsed[1]._tag, "RrwebBatch");
      assert.strictEqual(parsed[2]._tag, "RrwebBatch");
    }).pipe(Effect.provide(layer));
  });

  it.effect("stream reads payloads from file", () => {
    const { layer } = makeTestLayer();
    return Effect.gen(function* () {
      const liveViewer = yield* LiveViewer;
      const plan = makePlan("plan-003", "Stream test");
      yield* liveViewer.push(plan.id, { _tag: "InitialPlan", plan });
      yield* liveViewer.push(plan.id, makeRrwebBatch(3));
      yield* liveViewer.push(plan.id, { _tag: "Done" });

      const payloads = yield* liveViewer.stream(plan.id).pipe(Stream.runCollect);

      assert.strictEqual(payloads.length, 2);
      assert.strictEqual(payloads[0]._tag, "InitialPlan");
      assert.strictEqual(payloads[1]._tag, "RrwebBatch");
    }).pipe(Effect.provide(layer));
  });

  it.effect("listTests returns plans from disk", () => {
    const { layer } = makeTestLayer();
    return Effect.gen(function* () {
      const liveViewer = yield* LiveViewer;
      yield* liveViewer.push(PlanId.makeUnsafe("plan-a"), {
        _tag: "InitialPlan",
        plan: makePlan("plan-a", "Plan A"),
      });
      yield* liveViewer.push(PlanId.makeUnsafe("plan-b"), {
        _tag: "InitialPlan",
        plan: makePlan("plan-b", "Plan B"),
      });

      const tests = yield* liveViewer.listTests();
      const ids = tests.map((test) => test.id as string);
      assert.isTrue(ids.includes("plan-a"));
      assert.isTrue(ids.includes("plan-b"));
    }).pipe(Effect.provide(layer));
  });

  it.effect("listTests round-trips TestPlan through ndjson", () => {
    const { layer } = makeTestLayer();
    return Effect.gen(function* () {
      const liveViewer = yield* LiveViewer;
      const plan = makePlan("plan-rt", "Round trip");
      yield* liveViewer.push(plan.id, { _tag: "InitialPlan", plan });

      const tests = yield* liveViewer.listTests();
      assert.strictEqual(tests.length, 1);
      assert.strictEqual(tests[0].title, "Round trip");
      assert.strictEqual(tests[0].id, plan.id);
    }).pipe(Effect.provide(layer));
  });

  it.effect("stream replays all pushed events", () => {
    const { layer } = makeTestLayer();
    return Effect.gen(function* () {
      const liveViewer = yield* LiveViewer;
      const plan = makePlan("plan-replay", "Replay test");
      yield* liveViewer.push(plan.id, { _tag: "InitialPlan", plan });
      yield* liveViewer.push(plan.id, makeRrwebBatch(1));
      yield* liveViewer.push(plan.id, makeRrwebBatch(2));
      yield* liveViewer.push(plan.id, makeRrwebBatch(3));
      yield* liveViewer.push(plan.id, { _tag: "Done" });

      const payloads = yield* liveViewer.stream(plan.id).pipe(Stream.runCollect);

      assert.strictEqual(payloads.length, 4);
      assert.strictEqual(payloads[0]._tag, "InitialPlan");
      assert.strictEqual(payloads[1]._tag, "RrwebBatch");
      assert.strictEqual(payloads[2]._tag, "RrwebBatch");
      assert.strictEqual(payloads[3]._tag, "RrwebBatch");
    }).pipe(Effect.provide(layer));
  });
});
