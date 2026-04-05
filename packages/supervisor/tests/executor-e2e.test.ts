import * as path from "node:path";
import { describe, it, assert } from "@effect/vitest";
import { Effect, Layer, Option, Stream } from "effect";
import { NodeServices } from "@effect/platform-node";
import { CurrentPlanId, ExecutedTestPlan, PlanId, ChangesFor } from "@expect/shared/models";
import { Agent } from "@expect/agent";
import { RrVideo } from "@expect/browser";
import { Executor } from "../src/executor";
import { ArtifactStore } from "../src/artifact-store";
import { OutputReporter } from "../src/output-reporter";
import { Reporter } from "../src/reporter";
import { Git, GitRepoRoot } from "../src/git/git";
import * as fs from "node:fs";

const FIXTURE_PATH = path.join(import.meta.dirname, "fixtures", "skosh-view-counter.ndjson");

const fixtureExists = fs.existsSync(FIXTURE_PATH);

const mockGitLayer = Layer.mock(Git, {
  withRepoRoot: () => (effect) => effect as any,
  getCurrentBranch: Effect.succeed("main"),
  getMainBranch: Effect.succeed("main"),
  isInsideWorkTree: Effect.succeed(true),
  getFileStats: () => Effect.succeed([]),
  getChangedFiles: () => Effect.succeed([]),
  getDiffPreview: () => Effect.succeed(""),
  getRecentCommits: () => Effect.succeed([]),
  getCommitSummary: () => Effect.succeed({ hash: "", shortHash: "", subject: "" }),
  getState: () =>
    Effect.succeed({
      isGitRepo: true,
      hasUntestedChanges: false,
      workingTreeFileStats: [],
    }) as any,
  computeFingerprint: () => Effect.succeed(""),
  saveTestedFingerprint: () => Effect.void,
});

const makeE2eLayer = () => {
  const tmpDir = path.join(import.meta.dirname, ".test-output");

  const artifactStoreLayer = ArtifactStore.layer.pipe(
    Layer.provide(Layer.succeed(GitRepoRoot, tmpDir)),
  );

  const planId = PlanId.makeUnsafe(crypto.randomUUID());

  return Layer.mergeAll(Executor.layer, Reporter.layer).pipe(
    Layer.provideMerge(artifactStoreLayer),
    Layer.provideMerge(OutputReporter.layerStdoutNoop({ agent: "claude", timeoutMs: undefined })),
    Layer.provide(Agent.layerTest(FIXTURE_PATH)),
    Layer.provide(mockGitLayer),
    Layer.provideMerge(RrVideo.layer),
    Layer.provideMerge(Layer.succeed(GitRepoRoot, tmpDir)),
    Layer.provideMerge(Layer.succeed(CurrentPlanId, planId)),
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

  it.effect("pushed events are readable via ArtifactStore.stream", () => {
    const layer = makeE2eLayer();
    return Effect.gen(function* () {
      const executor = yield* Executor;
      const artifactStore = yield* ArtifactStore;

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

      const payloads = yield* artifactStore
        .stream(PlanId.makeUnsafe(planId!))
        .pipe(Stream.runCollect);

      assert.isTrue(payloads.length > 0, "should read payloads from stream");
      assert.strictEqual(payloads[0]._tag, "InitialPlan");
    }).pipe(Effect.provide(layer));
  });

  it.effect("pushed events appear in listTests", () => {
    const layer = makeE2eLayer();
    return Effect.gen(function* () {
      const executor = yield* Executor;
      const artifactStore = yield* ArtifactStore;

      yield* executor
        .execute({
          changesFor: ChangesFor.makeUnsafe({ _tag: "WorkingTree" }),
          instruction:
            "Navigate to https://skosh.dev and verify the view counter increases on refresh",
          isHeadless: true,
          cookieImportProfiles: [],
        })
        .pipe(Stream.runDrain);

      const tests = yield* artifactStore.listTests();
      assert.isTrue(tests.length > 0, "should have at least one test listed");
    }).pipe(Effect.provide(layer));
  });

  it.effect("executes, generates report, and exports video", () => {
    const layer = makeE2eLayer();
    return Effect.gen(function* () {
      const executor = yield* Executor;
      const reporter = yield* Reporter;

      const finalExecuted = yield* executor
        .execute({
          changesFor: ChangesFor.makeUnsafe({ _tag: "WorkingTree" }),
          instruction:
            "Navigate to https://skosh.dev and verify the view counter increases on refresh",
          isHeadless: true,
          cookieImportProfiles: [],
        })
        .pipe(
          Stream.runLast,
          Effect.flatMap((option) => option.asEffect()),
        );

      const report = yield* reporter.report(finalExecuted);

      assert.isDefined(report);
      assert.isTrue(report.steps.length > 0, "report should have steps");
      assert.isTrue(report.summary.length > 0, "report should have a summary");

      yield* reporter.exportVideo(report);
    }).pipe(Effect.provide(layer));
  });
});
