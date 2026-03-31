import * as path from "node:path";
import { describe, it, assert } from "@effect/vitest";
import { Effect, Layer, Option, Stream } from "effect";
import { NodeServices } from "@effect/platform-node";
import { ExecutedTestPlan, PlanId, ChangesFor } from "@expect/shared/models";
import { Agent } from "@expect/agent";
import { Executor } from "../src/executor";
import { LiveViewer } from "../src/live-viewer";
import { Git, GitRepoRoot } from "../src/git/git";
import * as fs from "node:fs";

const FIXTURE_PATH = path.join(import.meta.dirname, "fixtures", "skosh-view-counter.ndjson");

const fixtureExists = fs.existsSync(FIXTURE_PATH);

const mockGitLayer = Layer.mock(Git, {
  getCurrentBranch: Effect.succeed("main"),
  getMainBranch: Effect.succeed("main"),
  getChangedFiles: () => Effect.succeed([]),
  getDiffPreview: () => Effect.succeed(""),
  getRecentCommits: () => Effect.succeed([]),
  getRepoRoot: () => Effect.succeed("/test-repo"),
  saveTestedFingerprint: () => Effect.void,
});

const makeE2eLayer = () => {
  const tmpDir = path.join(import.meta.dirname, ".test-output");

  const liveViewerLayer = LiveViewer.layer.pipe(Layer.provide(Layer.succeed(GitRepoRoot, tmpDir)));

  return Executor.layer.pipe(
    Layer.provideMerge(liveViewerLayer),
    Layer.provide(Agent.layerTest(FIXTURE_PATH)),
    Layer.provide(mockGitLayer),
    Layer.provideMerge(Layer.succeed(GitRepoRoot, tmpDir)),
    Layer.provide(NodeServices.layer),
  );
};

describe("Executor e2e (fixture replay)", () => {
  it.effect("executes a full test plan from fixture and produces events", () => {
    const layer = makeE2eLayer();
    return Effect.gen(function* () {
      const executor = yield* Executor;
      const executedPlans: ExecutedTestPlan[] = [];

      const finalExecuted = yield* executor
        .execute({
          changesFor: ChangesFor.makeUnsafe({ _tag: "WorkingTree" }),
          instruction:
            "Navigate to https://skosh.dev and verify the view counter increases on refresh",
          isHeadless: true,
          cookieImportProfiles: [],
        })
        .pipe(
          Stream.tap((executed) =>
            Effect.sync(() => {
              executedPlans.push(executed);
            }),
          ),
          Stream.runLast,
          Effect.map((option) => (option._tag === "Some" ? option.value : undefined)),
        );

      assert.isDefined(finalExecuted);
      assert.isTrue(executedPlans.length > 0, "should have received at least one update");
      assert.isTrue(finalExecuted!.events.length > 0, "final plan should have events");
    }).pipe(Effect.provide(layer));
  });

  it.effect("pushed events are readable via LiveViewer.stream", () => {
    const layer = makeE2eLayer();
    return Effect.gen(function* () {
      const executor = yield* Executor;
      const liveViewer = yield* LiveViewer;

      let planId: string | undefined;

      yield* executor
        .execute({
          changesFor: ChangesFor.makeUnsafe({ _tag: "WorkingTree" }),
          instruction:
            "Navigate to https://skosh.dev and verify the view counter increases on refresh",
          isHeadless: true,
          cookieImportProfiles: [],
        })
        .pipe(
          Stream.tap((executed) =>
            Effect.sync(() => {
              planId = executed.id;
            }),
          ),
          Stream.runDrain,
        );

      assert.isDefined(planId);

      const payloads = yield* liveViewer.stream(PlanId.makeUnsafe(planId!)).pipe(Stream.runCollect);

      assert.isTrue(payloads.length > 0, "should read payloads from stream");
      assert.strictEqual(payloads[0]._tag, "InitialPlan");
    }).pipe(Effect.provide(layer));
  });

  it.effect("pushed events appear in listTests", () => {
    const layer = makeE2eLayer();
    return Effect.gen(function* () {
      const executor = yield* Executor;
      const liveViewer = yield* LiveViewer;

      yield* executor
        .execute({
          changesFor: ChangesFor.makeUnsafe({ _tag: "WorkingTree" }),
          instruction:
            "Navigate to https://skosh.dev and verify the view counter increases on refresh",
          isHeadless: true,
          cookieImportProfiles: [],
        })
        .pipe(Stream.runDrain);

      const tests = yield* liveViewer.listTests();
      assert.isTrue(tests.length > 0, "should have at least one test listed");
    }).pipe(Effect.provide(layer));
  });
});
