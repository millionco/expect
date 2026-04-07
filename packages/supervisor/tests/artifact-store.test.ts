import { describe, it, assert } from "@effect/vitest";
import { Effect, FileSystem, Layer, Option, Sink, Stream } from "effect";
import {
  type Artifact,
  Done,
  InitialPlan,
  PlanId,
  TestPlan,
  ChangesFor,
  RrwebEvent,
} from "@expect/shared/models";
import { ArtifactStore } from "../src/artifact-store";
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
    cookieImportProfiles: [],
    testCoverage: Option.none(),
  });

const makeRrwebEvents = (count: number): Artifact[] =>
  Array.from(
    { length: count },
    (_, index) => new RrwebEvent({ event: { type: 0, timestamp: index } }),
  );

const makeTestLayer = () => {
  const files = new Map<string, Uint8Array>();

  const mockFs = Layer.mock(FileSystem.FileSystem, {
    sink: () => Sink.drain,
    "~effect/platform/FileSystem": "~effect/platform/FileSystem",
    makeDirectory: () => Effect.void,
    exists: (filePath: string) => Effect.succeed(files.has(filePath)),
    writeFileString: (filePath: string, content: string, options) =>
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
    readDirectory: (dirPath: string) =>
      Effect.sync(() =>
        [...files.keys()]
          .filter((key) => key.startsWith(dirPath + "/"))
          .map((key) => key.slice(dirPath.length + 1))
          .filter((name) => !name.includes("/")),
      ),
    stream: (filePath: string, options) => {
      const content = files.get(filePath);
      if (!content) return Stream.die(new Error(`File not found: ${filePath}`));
      const offset = Number(options?.offset ?? 0);
      const bytesToRead = options?.bytesToRead
        ? Number(options.bytesToRead)
        : content.length - offset;
      return Stream.make(content.slice(offset, offset + bytesToRead));
    },
    stat: (filePath: string) =>
      Effect.sync(() => ({
        type: "File",
        size: FileSystem.Size(files.get(filePath)?.length ?? 0),
        mtime: Option.none(),
        atime: Option.none(),
        birthtime: Option.none(),
        dev: 0,
        ino: Option.none(),
        mode: 0o644,
        nlink: Option.none(),
        uid: Option.none(),
        gid: Option.none(),
        rdev: Option.none(),
        blksize: Option.none(),
        blocks: Option.none(),
      })),
  } satisfies Partial<FileSystem.FileSystem>);

  const tailLayer = Layer.effect(Tail)(Tail.make).pipe(Layer.provide(mockFs));

  const layer = Layer.effect(ArtifactStore)(ArtifactStore.make).pipe(
    Layer.provide(Layer.succeed(GitRepoRoot, "/test-repo")),
    Layer.provide(tailLayer),
    Layer.provide(mockFs),
  );

  return { layer, files };
};

describe("ArtifactStore", () => {
  it.effect("push writes InitialPlan to ndjson file", () => {
    const { layer, files } = makeTestLayer();
    return Effect.gen(function* () {
      const artifactStore = yield* ArtifactStore;
      const plan = makePlan("plan-001", "Test plan one");
      yield* artifactStore.push(plan.id, new InitialPlan({ plan }));

      const ndjsonPath = "/test-repo/.expect/artifacts/plan-001.ndjson";
      assert.isTrue(files.has(ndjsonPath));
      const content = new TextDecoder().decode(files.get(ndjsonPath)!);
      const parsed = JSON.parse(content.trim());
      assert.strictEqual(parsed._tag, "InitialPlan");
    }).pipe(Effect.provide(layer));
  });

  it.effect("push appends multiple artifacts to ndjson file", () => {
    const { layer, files } = makeTestLayer();
    return Effect.gen(function* () {
      const artifactStore = yield* ArtifactStore;
      const plan = makePlan("plan-002", "Multi push");
      yield* artifactStore.push(plan.id, new InitialPlan({ plan }));
      for (const event of makeRrwebEvents(5)) {
        yield* artifactStore.push(plan.id, event);
      }

      const ndjsonPath = "/test-repo/.expect/artifacts/plan-002.ndjson";
      const content = new TextDecoder().decode(files.get(ndjsonPath)!);
      const lines = content.trim().split("\n");
      assert.strictEqual(lines.length, 6);

      const parsed = lines.map((line) => JSON.parse(line));
      assert.strictEqual(parsed[0]._tag, "InitialPlan");
      assert.strictEqual(parsed[1]._tag, "RrwebEvent");
      assert.strictEqual(parsed[5]._tag, "RrwebEvent");
    }).pipe(Effect.provide(layer));
  });

  it.effect("stream reads artifacts from file", () => {
    const { layer } = makeTestLayer();
    return Effect.gen(function* () {
      const artifactStore = yield* ArtifactStore;
      const plan = makePlan("plan-003", "Stream test");
      yield* artifactStore.push(plan.id, new InitialPlan({ plan }));
      for (const event of makeRrwebEvents(3)) {
        yield* artifactStore.push(plan.id, event);
      }
      yield* artifactStore.push(plan.id, new Done());

      const artifacts = yield* artifactStore.stream(plan.id).pipe(Stream.runCollect);

      assert.strictEqual(artifacts.length, 4);
      assert.strictEqual(artifacts[0]._tag, "InitialPlan");
      assert.strictEqual(artifacts[1]._tag, "RrwebEvent");
    }).pipe(Effect.provide(layer));
  });

  it.effect("listTests returns plans from disk", () => {
    const { layer } = makeTestLayer();
    return Effect.gen(function* () {
      const artifactStore = yield* ArtifactStore;
      yield* artifactStore.push(
        PlanId.makeUnsafe("plan-a"),
        new InitialPlan({ plan: makePlan("plan-a", "Plan A") }),
      );
      yield* artifactStore.push(
        PlanId.makeUnsafe("plan-b"),
        new InitialPlan({ plan: makePlan("plan-b", "Plan B") }),
      );

      const tests = yield* artifactStore.listTests();
      const ids = tests.map((test) => test.id as string);
      assert.isTrue(ids.includes("plan-a"));
      assert.isTrue(ids.includes("plan-b"));
    }).pipe(Effect.provide(layer));
  });

  it.effect("listTests round-trips TestPlan through ndjson", () => {
    const { layer } = makeTestLayer();
    return Effect.gen(function* () {
      const artifactStore = yield* ArtifactStore;
      const plan = makePlan("plan-rt", "Round trip");
      yield* artifactStore.push(plan.id, new InitialPlan({ plan }));

      const tests = yield* artifactStore.listTests();
      assert.strictEqual(tests.length, 1);
      assert.strictEqual(tests[0].title, "Round trip");
      assert.strictEqual(tests[0].id, plan.id);
    }).pipe(Effect.provide(layer));
  });

  it.effect("stream replays all pushed events", () => {
    const { layer } = makeTestLayer();
    return Effect.gen(function* () {
      const artifactStore = yield* ArtifactStore;
      const plan = makePlan("plan-replay", "Replay test");
      yield* artifactStore.push(plan.id, new InitialPlan({ plan }));
      for (const event of makeRrwebEvents(3)) {
        yield* artifactStore.push(plan.id, event);
      }
      yield* artifactStore.push(plan.id, new Done());

      const artifacts = yield* artifactStore.stream(plan.id).pipe(Stream.runCollect);

      assert.strictEqual(artifacts.length, 4);
      assert.strictEqual(artifacts[0]._tag, "InitialPlan");
      assert.strictEqual(artifacts[1]._tag, "RrwebEvent");
      assert.strictEqual(artifacts[2]._tag, "RrwebEvent");
      assert.strictEqual(artifacts[3]._tag, "RrwebEvent");
    }).pipe(Effect.provide(layer));
  });
});
