import {
  AcpProviderUnauthenticatedError,
  AcpProviderUsageLimitError,
  AcpSessionCreateError,
  AcpStreamError,
  Agent,
  AgentStreamOptions,
} from "@expect/agent";
import { Effect, Layer, Option, Schema, ServiceMap, Stream } from "effect";
import {
  type AcpConfigOption,
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
import {
  buildExecutionPrompt,
  buildExecutionSystemPrompt,
  type DevServerHint,
} from "@expect/shared/prompts";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { Git } from "./git/git";
import {
  EXPECT_COOKIE_BROWSERS_ENV_NAME,
  EXPECT_CDP_URL_ENV_NAME,
  EXPECT_BASE_URL_ENV_NAME,
  EXPECT_HEADED_ENV_NAME,
  EXPECT_PROFILE_ENV_NAME,
} from "@expect/browser/mcp";
import {
  ALL_STEPS_TERMINAL_GRACE_MS,
  EXECUTION_CONTEXT_FILE_LIMIT,
  EXECUTION_RECENT_COMMIT_LIMIT,
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
  readonly cdpUrl?: string;
  readonly profileName?: string;
  readonly savedFlow?: SavedFlow;
  readonly learnings?: string;
  readonly testCoverage?: TestCoverageReport;
  readonly onConfigOptions?: (configOptions: readonly AcpConfigOption[]) => void;
  readonly modelPreference?: { configId: string; value: string };
  readonly devServerHints?: readonly DevServerHint[];
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
      yield* Effect.annotateCurrentSpan({ changesFor: changesFor._tag });

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

      yield* Effect.logDebug("Execution context gathered", {
        currentBranch,
        mainBranch,
        changedFileCount: changedFiles.length,
        commitCount: recentCommits.length,
        diffPreviewLength: diffPreview.length,
      });

      return {
        currentBranch,
        mainBranch,
        changedFiles: changedFiles.slice(0, EXECUTION_CONTEXT_FILE_LIMIT) as ChangedFile[],
        recentCommits: recentCommits.slice(0, EXECUTION_RECENT_COMMIT_LIMIT) as CommitSummary[],
        diffPreview,
      };
    });

    const execute = Effect.fn("Executor.execute")(function* (options: ExecuteOptions) {
      yield* Effect.annotateCurrentSpan({
        changesFor: options.changesFor._tag,
        isHeadless: options.isHeadless,
      });
      yield* Effect.logInfo("Execution started", {
        instructionLength: options.instruction.length,
        changesFor: options.changesFor._tag,
        isHeadless: options.isHeadless,
        cookieBrowserCount: options.cookieBrowserKeys.length,
      });

      const context = yield* gatherContext(options.changesFor);

      const systemPrompt = buildExecutionSystemPrompt();

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
        devServerHints: options.devServerHints,
      });

      const planId = PlanId.makeUnsafe(crypto.randomUUID());

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

      const mcpEnv: Array<{ name: string; value: string }> = [];
      if (options.cdpUrl) {
        mcpEnv.push({ name: EXPECT_CDP_URL_ENV_NAME, value: options.cdpUrl });
      }
      if (options.baseUrl) {
        mcpEnv.push({ name: EXPECT_BASE_URL_ENV_NAME, value: options.baseUrl });
      }
      mcpEnv.push({
        name: EXPECT_HEADED_ENV_NAME,
        value: options.isHeadless ? "false" : "true",
      });
      if (options.profileName) {
        mcpEnv.push({ name: EXPECT_PROFILE_ENV_NAME, value: options.profileName });
      }
      if (options.cookieBrowserKeys.length > 0) {
        mcpEnv.push({
          name: EXPECT_COOKIE_BROWSERS_ENV_NAME,
          value: options.cookieBrowserKeys.join(","),
        });
      }

      yield* Effect.logInfo("Agent stream starting", {
        planId,
        promptLength: prompt.length,
        mcpEnvCount: mcpEnv.length,
      });

      const streamOptions = new AgentStreamOptions({
        cwd: process.cwd(),
        sessionId: Option.none(),
        prompt,
        systemPrompt: Option.some(systemPrompt),
        mcpEnv,
        modelPreference: options.modelPreference,
      });

      return agent.stream(streamOptions).pipe(
        Stream.tap((update) => {
          const callback = options.onConfigOptions;
          if (update.sessionUpdate === "config_option_update" && callback) {
            return Effect.sync(() => callback(update.configOptions));
          }
          return Effect.void;
        }),
        Stream.mapAccum(
          (): ExecutorAccumState => ({
            plan: initial,
            allTerminalSince: undefined,
          }),
          (state, part) => {
            const updated = state.plan.addEvent(part);
            const terminalTimestamp = resolveTerminalTimestamp(updated, state.allTerminalSince);
            const finalized =
              terminalTimestamp !== undefined &&
              !updated.hasRunFinished &&
              Date.now() - terminalTimestamp >= ALL_STEPS_TERMINAL_GRACE_MS
                ? updated.synthesizeRunFinished()
                : updated;

            return [{ plan: finalized, allTerminalSince: terminalTimestamp }, [finalized]] as const;
          },
        ),
        Stream.takeUntil((executed) => executed.hasRunFinished),
        Stream.mapError((reason) => new ExecutionError({ reason })),
      );
    }, Stream.unwrap);

    return { execute } as const;
  }),
}) {
  static layer = Layer.effect(this)(this.make).pipe(Layer.provide(NodeServices.layer));
}
