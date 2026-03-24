import * as crypto from "node:crypto";
import { Effect, Option, Stream } from "effect";
import { changesForDisplayName, type ChangesFor } from "@browser-tester/shared/models";
import {
  DraftId,
  Executor,
  ExecutedTestPlan,
  Git,
  Planner,
  Reporter,
  TestPlanDraft,
} from "@browser-tester/supervisor";
import type { AgentBackend } from "@browser-tester/agent";
import figures from "figures";
import { VERSION } from "../constants.js";
import { layerCli } from "../layers.js";

interface HeadlessRunOptions {
  changesFor: ChangesFor;
  instruction: string;
  agent: AgentBackend;
  verbose: boolean;
}

export const runHeadless = (options: HeadlessRunOptions) =>
  Effect.gen(function* () {
    const planner = yield* Planner;
    const git = yield* Git;
    const executor = yield* Executor;
    const reporter = yield* Reporter;

    console.log(`testie v${VERSION}`);
    console.log(`Testing ${changesForDisplayName(options.changesFor)}`);
    console.log("Planning browser flow...");

    const currentBranch = yield* git.getCurrentBranch;
    const fileStats = yield* git.getFileStats(options.changesFor);
    const diffPreview = yield* git.getDiffPreview(options.changesFor);

    const draft = new TestPlanDraft({
      id: DraftId.makeUnsafe(crypto.randomUUID()),
      changesFor: options.changesFor,
      currentBranch,
      diffPreview,
      fileStats: [...fileStats],
      instruction: options.instruction,
      baseUrl: Option.none(),
      isHeadless: false,
      requiresCookies: false,
    });

    const testPlan = yield* planner.plan(draft);
    yield* Effect.logInfo(`Plan: ${testPlan.title} (${testPlan.steps.length} steps)`);

    const seenEvents = new Set<string>();
    const finalExecuted = yield* executor.executePlan(testPlan).pipe(
      Stream.tap((executed) =>
        Effect.sync(() => {
          for (const event of executed.events) {
            if (seenEvents.has(event.id)) continue;
            seenEvents.add(event.id);
            switch (event._tag) {
              case "RunStarted":
                console.log(`Starting ${event.plan.title}`);
                break;
              case "StepStarted":
                console.log(`${figures.arrowRight} ${event.stepId} ${event.title}`);
                break;
              case "StepCompleted":
                console.log(`  ${figures.tick} ${event.stepId} ${event.summary}`);
                break;
              case "StepFailed":
                console.log(`  ${figures.cross} ${event.stepId} ${event.message}`);
                break;
            }
          }
        }),
      ),
      Stream.runLast,
      Effect.map((option) =>
        option._tag === "Some" ? option.value : new ExecutedTestPlan({ ...testPlan, events: [] }),
      ),
    );

    const report = yield* reporter.report(finalExecuted);

    console.error(`\n${report.toPlainText}`);
    process.exit(report.status === "passed" ? 0 : 1);
  }).pipe(
    Effect.provide(layerCli({ verbose: options.verbose, agent: options.agent })),
    Effect.runPromise,
  );
