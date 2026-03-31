/**
 * Captures a real executor session to an ndjson fixture file.
 *
 * Usage:
 *   npx tsx tests/capture-fixture.ts
 *
 * Runs a full Executor.execute with real agent + MCP browser tools,
 * captures every AcpSessionUpdate to tests/fixtures/skosh-view-counter.ndjson.
 */
import * as path from "node:path";
import { Effect, Layer, Stream } from "effect";
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Agent } from "@expect/agent";
import { ChangesFor } from "@expect/shared/models";
import { Executor } from "../src/executor";
import { LiveViewer } from "../src/live-viewer";
import { Git } from "../src/git/git";

const FIXTURE_PATH = path.join(import.meta.dirname, "fixtures", "skosh-view-counter.ndjson");

const program = Effect.gen(function* () {
  const executor = yield* Executor;

  yield* executor
    .execute({
      changesFor: ChangesFor.makeUnsafe({ _tag: "WorkingTree" }),
      instruction:
        "Navigate to https://skosh.dev, note the view counter in the footer. Refresh the page and confirm the view counter increased by 1.",
      isHeadless: false,
      cookieImportProfiles: [],
      captureFixturePath: FIXTURE_PATH,
    })
    .pipe(
      Stream.tap((executed) =>
        Effect.sync(() => {
          const eventCount = executed.events.length;
          const stepCount = executed.steps.length;
          process.stderr.write(`[capture] events=${eventCount} steps=${stepCount}\n`);
        }),
      ),
      Stream.runDrain,
    );

  yield* Effect.logInfo(`Fixture captured to ${FIXTURE_PATH}`);
});

const gitLayer = Git.withRepoRoot(process.cwd());
const liveViewerLayer = LiveViewer.layer.pipe(Layer.provide(gitLayer));

const MainLayer = Layer.mergeAll(
  Executor.layer.pipe(Layer.provide(gitLayer), Layer.provide(liveViewerLayer)),
  gitLayer,
).pipe(Layer.provide(Agent.layerFor("claude")), Layer.provide(NodeServices.layer));

NodeRuntime.runMain(program.pipe(Effect.provide(MainLayer)));
