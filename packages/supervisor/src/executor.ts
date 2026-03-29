import * as path from "node:path";
import {
  AcpProviderUnauthenticatedError,
  AcpProviderUsageLimitError,
  AcpSessionCreateError,
  AcpStreamError,
  Agent,
  AgentStreamOptions,
} from "@expect/agent";
import { Effect, Fiber, Layer, Option, Queue, Ref, Schema, ServiceMap, Stream } from "effect";
import {
  type ChangesFor,
  type ChangedFile,
  type CommitSummary,
  ExecutedTestPlan,
  PlanId,
  RunStarted,
  type SavedFlow,
  type TestCoverageReport,
  TestPlan,
} from "@expect/shared/models";
import { buildExecutionPrompt } from "@expect/shared/prompts";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { Git } from "./git/git";
import {
  EXPECT_LIVE_VIEW_URL_ENV_NAME,
  EXPECT_COOKIE_BROWSERS_ENV_NAME,
} from "@expect/browser/mcp";
import {
  ALL_STEPS_TERMINAL_GRACE_MS,
  EXECUTION_CONTEXT_FILE_LIMIT,
  EXECUTION_RECENT_COMMIT_LIMIT,
  EXPECT_REPLAY_OUTPUT_ENV_NAME,
  EXPECT_STATE_DIR,
} from "./constants";

export class ExecutionError extends Schema.ErrorClass<ExecutionError>("@supervisor/ExecutionError")(
  {
    _tag: Schema.tag("ExecutionError"),
    reason: Schema.Union([
      AcpStreamError,
      AcpSessionCreateError,
      AcpProviderUnauthenticatedError,
      AcpProviderUsageLimitError,
    ]),
  },
) {
  displayName = this.reason.displayName ?? `Browser testing failed`;
  message = this.reason.message;
}

export interface ExecuteOptions {
  readonly changesFor: ChangesFor;
  readonly instruction: string;
  readonly isHeadless: boolean;
  readonly cookieBrowserKeys: readonly string[];
  readonly baseUrl?: string;
  readonly savedFlow?: SavedFlow;
  readonly learnings?: string;
  readonly liveViewUrl?: string;
  readonly testCoverage?: TestCoverageReport;
}

interface ExecutorAccumState {
  readonly plan: ExecutedTestPlan;
  readonly allTerminalSince: number | undefined;
}

const resolveTerminalTimestamp = (executed: ExecutedTestPlan, previous: number | undefined) => {
  if (!executed.allStepsTerminal) return undefined;
  return previous ?? Date.now();
};

export class Executor extends ServiceMap.Service<Executor>()("@supervisor/Executor", {
  make: Effect.gen(function* () {
    const agent = yield* Agent;
    const git = yield* Git;

    const gatherContext = Effect.fn("Executor.gatherContext")(function* (changesFor: ChangesFor) {
      const currentBranch = yield* git.getCurrentBranch;
      const mainBranch = yield* git.getMainBranch;
      const changedFiles = yield* git.getChangedFiles(changesFor);
      const diffPreview = yield* git.getDiffPreview(changesFor);

      const commitRange =
        changesFor._tag === "Branch" || changesFor._tag === "Changes"
          ? `${changesFor.mainBranch}..HEAD`
          : changesFor._tag === "Commit"
            ? `-1 ${changesFor.hash}`
            : `HEAD~${EXECUTION_RECENT_COMMIT_LIMIT}..HEAD`;

      const recentCommits = yield* git.getRecentCommits(commitRange);

      return {
        currentBranch,
        mainBranch,
        changedFiles: changedFiles.slice(0, EXECUTION_CONTEXT_FILE_LIMIT) as ChangedFile[],
        recentCommits: recentCommits.slice(0, EXECUTION_RECENT_COMMIT_LIMIT) as CommitSummary[],
        diffPreview,
      };
    });

    const execute = Effect.fn("Executor.execute")(function* (options: ExecuteOptions) {
      const context = yield* gatherContext(options.changesFor);

      const prompt = buildExecutionPrompt({
        userInstruction: options.instruction,
        scope: options.changesFor._tag,
        currentBranch: context.currentBranch,
        mainBranch: context.mainBranch,
        changedFiles: context.changedFiles,
        recentCommits: context.recentCommits,
        diffPreview: context.diffPreview,
        baseUrl: options.baseUrl,
        isHeadless: options.isHeadless,
        cookieBrowserKeys: options.cookieBrowserKeys,
        savedFlow: options.savedFlow,
        learnings: options.learnings,
        testCoverage: options.testCoverage,
      });

      const planId = PlanId.makeUnsafe(crypto.randomUUID());
      const replayOutputPath = path.join(
        process.cwd(),
        EXPECT_STATE_DIR,
        "replays",
        `${planId}.ndjson`,
      );

      const syntheticPlan = new TestPlan({
        id: planId,
        changesFor: options.changesFor,
        currentBranch: context.currentBranch,
        diffPreview: context.diffPreview,
        fileStats: [],
        instruction: options.instruction,
        baseUrl: options.baseUrl ? Option.some(options.baseUrl) : Option.none(),
        isHeadless: options.isHeadless,
        cookieBrowserKeys: options.cookieBrowserKeys,
        testCoverage: options.testCoverage ? Option.some(options.testCoverage) : Option.none(),
        title: options.instruction,
        rationale: "Direct execution",
        steps: [],
      });

      const initial = new ExecutedTestPlan({
        ...syntheticPlan,
        events: [new RunStarted({ plan: syntheticPlan })],
      });

      const mcpEnv = [{ name: EXPECT_REPLAY_OUTPUT_ENV_NAME, value: replayOutputPath }];
      if (options.liveViewUrl) {
        mcpEnv.push({
          name: EXPECT_LIVE_VIEW_URL_ENV_NAME,
          value: options.liveViewUrl,
        });
      }
      if (options.cookieBrowserKeys.length > 0) {
        mcpEnv.push({
          name: EXPECT_COOKIE_BROWSERS_ENV_NAME,
          value: options.cookieBrowserKeys.join(","),
        });
      }

      const streamOptions = new AgentStreamOptions({
        cwd: process.cwd(),
        sessionId: Option.none(),
        prompt,
        systemPrompt: Option.none(),
        mcpEnv,
      });

      return yield* Effect.gen(function* () {
        const outputQueue = yield* Queue.unbounded<ExecutedTestPlan, ExecutionError>();
        const terminalGraceFiberRef = yield* Ref.make<Option.Option<Fiber.RuntimeFiber<void, never>>>(
          Option.none(),
        );

        const emit = (executed: ExecutedTestPlan) => Queue.offer(outputQueue, executed);
        yield* emit(initial);
        const cancelTerminalGraceWatcher = Effect.gen(function* () {
          const currentFiber = yield* Ref.get(terminalGraceFiberRef);
          if (Option.isNone(currentFiber)) return;
          yield* Fiber.interrupt(currentFiber.value);
          yield* Ref.set(terminalGraceFiberRef, Option.none());
        });
        const updateTerminalGraceWatcher = (executed: ExecutedTestPlan) =>
          Effect.gen(function* () {
            if (executed.hasRunFinished || !executed.allStepsTerminal) {
              yield* cancelTerminalGraceWatcher;
              return;
            }

            const currentFiber = yield* Ref.get(terminalGraceFiberRef);
            if (Option.isSome(currentFiber)) {
              return;
            }

            const graceFiber = yield* Effect.gen(function* () {
              yield* Effect.sleep(`${ALL_STEPS_TERMINAL_GRACE_MS} millis`);
              yield* emit(executed.synthesizeRunFinished());
              yield* Queue.end(outputQueue);
              yield* Ref.set(terminalGraceFiberRef, Option.none());
            }).pipe(Effect.forkScoped);

            yield* Ref.set(terminalGraceFiberRef, Option.some(graceFiber));
          });

        const runStream = agent.stream(streamOptions).pipe(
          Stream.runFoldEffect(
            {
              plan: initial,
              allTerminalSince: undefined,
            } satisfies ExecutorAccumState,
            (state, part) =>
              Effect.gen(function* () {
                const updated = state.plan.addEvent(part);
                const terminalTimestamp = resolveTerminalTimestamp(updated, state.allTerminalSince);
                const finalized =
                  terminalTimestamp !== undefined &&
                  !updated.hasRunFinished &&
                  Date.now() - terminalTimestamp >= ALL_STEPS_TERMINAL_GRACE_MS
                    ? updated.synthesizeRunFinished()
                    : updated;

                yield* emit(finalized);
                yield* updateTerminalGraceWatcher(finalized);
                if (finalized.hasRunFinished) {
                  yield* Queue.end(outputQueue);
                }

                return {
                  plan: finalized,
                  allTerminalSince: terminalTimestamp,
                } satisfies ExecutorAccumState;
              }),
          ),
          Effect.flatMap((finalState) =>
            Effect.gen(function* () {
              const finalizedPlan = finalState.plan.finalizeTextBlock();
              const finalizedTerminalTimestamp = resolveTerminalTimestamp(
                finalizedPlan,
                finalState.allTerminalSince,
              );
              const completedPlan =
                finalizedTerminalTimestamp !== undefined && !finalizedPlan.hasRunFinished
                  ? finalizedPlan.synthesizeRunFinished()
                  : finalizedPlan;

              if (completedPlan !== finalState.plan) {
                yield* emit(completedPlan);
              }
              yield* updateTerminalGraceWatcher(completedPlan);
              yield* Queue.end(outputQueue);
            }),
          ),
          Effect.catchTag("AcpStreamError", (reason) =>
            Queue.fail(outputQueue, new ExecutionError({ reason })),
          ),
          Effect.catchTag("AcpSessionCreateError", (reason) =>
            Queue.fail(outputQueue, new ExecutionError({ reason })),
          ),
          Effect.catchTag("AcpProviderUnauthenticatedError", (reason) =>
            Queue.fail(outputQueue, new ExecutionError({ reason })),
          ),
          Effect.catchTag("AcpProviderUsageLimitError", (reason) =>
            Queue.fail(outputQueue, new ExecutionError({ reason })),
          ),
          Effect.forkScoped,
        );

        yield* runStream;

        return Stream.fromQueue(outputQueue);
      }).pipe(Stream.unwrap);
    }, Stream.unwrap);

    return { execute } as const;
  }),
}) {
  static layer = Layer.effect(this)(this.make).pipe(Layer.provide(NodeServices.layer));
}
