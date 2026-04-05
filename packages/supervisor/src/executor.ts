import {
  AcpProviderUnauthenticatedError,
  AcpProviderUsageLimitError,
  AcpSessionCreateError,
  AcpStreamError,
  Agent,
  AgentStreamOptions,
} from "@expect/agent";
import {
  Effect,
  FileSystem,
  Layer,
  Option,
  Schema,
  ServiceMap,
  Stream,
  String as Str,
  Array,
  pipe,
  identity,
} from "effect";
import { ArtifactStore } from "./artifact-store";
import { OutputReporter } from "./output-reporter";
import {
  type AcpConfigOption,
  AcpSessionUpdate,
  type ChangesFor,
  type ChangedFile,
  type CommitSummary,
  CurrentPlanId,
  Done,
  ExecutedTestPlan,
  InitialPlan,
  PlanId,
  RunStarted,
  type SavedFlow,
  SessionUpdate,
  type TestCoverageReport,
  TestPlan,
} from "@expect/shared/models";
import { buildExecutionPrompt, type DevServerHint } from "@expect/shared/prompts";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { Git } from "./git/git";
import { EXPECT_BASE_URL_ENV_NAME } from "@expect/browser/mcp";
import { BrowserJson, type Browser } from "@expect/cookies";
import { EXPECT_BROWSER_PROFILE_ENV_NAME, EXPECT_HEADED_ENV_NAME } from "@expect/browser/mcp";
import {
  ALL_STEPS_TERMINAL_GRACE_MS,
  EXECUTION_CONTEXT_FILE_LIMIT,
  EXECUTION_RECENT_COMMIT_LIMIT,
} from "./constants";

const encodeSessionUpdate = Schema.encodeEffect(
  Schema.fromJsonString(Schema.toCodecJson(AcpSessionUpdate)),
);

const encodeBrowserProfile = Schema.encodeEffect(BrowserJson);

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
  readonly cookieImportProfiles: readonly Browser[];
  readonly baseUrl?: string;
  readonly savedFlow?: SavedFlow;
  readonly learnings?: string;
  readonly testCoverage?: TestCoverageReport;
  readonly onConfigOptions?: (configOptions: readonly AcpConfigOption[]) => void;
  readonly modelPreference?: { configId: string; value: string };
  readonly devServerHints?: readonly DevServerHint[];
  readonly captureFixturePath?: string;
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
    const artifactStore = yield* ArtifactStore;
    const outputReporter = yield* OutputReporter;
    const fileSystem = yield* FileSystem.FileSystem;
    const planId = yield* CurrentPlanId;

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
        cookieBrowserCount: options.cookieImportProfiles.length,
      });

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
        cookieImportProfiles: options.cookieImportProfiles,
        savedFlow: options.savedFlow,
        learnings: options.learnings,
        testCoverage: options.testCoverage,
        devServerHints: options.devServerHints,
      });

      console.log("USER PROMPT: ");
      console.log(prompt);

      const syntheticPlan = new TestPlan({
        id: planId,
        changesFor: options.changesFor,
        currentBranch: context.currentBranch,
        diffPreview: context.diffPreview,
        fileStats: [],
        instruction: options.instruction,
        baseUrl: options.baseUrl ? Option.some(options.baseUrl) : Option.none(),
        isHeadless: options.isHeadless,
        cookieImportProfiles: options.cookieImportProfiles,
        testCoverage: options.testCoverage ? Option.some(options.testCoverage) : Option.none(),
        title: options.instruction,
        rationale: "Direct execution",
        steps: [],
      });

      const initial = new ExecutedTestPlan({
        ...syntheticPlan,
        events: [new RunStarted({ plan: syntheticPlan })],
      });

      yield* artifactStore.push(planId, new InitialPlan({ plan: syntheticPlan }));

      const mcpEnv: Array<{ name: string; value: string }> = [];
      if (options.baseUrl) {
        mcpEnv.push({
          name: EXPECT_BASE_URL_ENV_NAME,
          value: options.baseUrl,
        });
      }
      if (!options.isHeadless) {
        mcpEnv.push({ name: EXPECT_HEADED_ENV_NAME, value: "true" });
      }
      if (options.cookieImportProfiles.length > 0) {
        const profileJson = yield* encodeBrowserProfile(options.cookieImportProfiles[0]).pipe(
          Effect.orDie,
        );
        mcpEnv.push({
          name: EXPECT_BROWSER_PROFILE_ENV_NAME,
          value: profileJson,
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
        systemPrompt: Option.none(),
        mcpEnv,
        modelPreference: options.modelPreference,
      });

      return agent.stream(streamOptions).pipe(
        Stream.tap((update) => {
          if (update.sessionUpdate === "tool_call_update") {
            const CONTEXT_LINES = 5;
            const lines = pipe(
              Array.fromIterable(Str.linesIterator(JSON.stringify(update, null, 2))),
              Array.take(CONTEXT_LINES + 1),
              Array.map((line) => `    ${line}`),
              Array.join("\n"),
            );

            return Effect.logDebug(`Tool call update:\n${lines}`);
          }
          if (update.sessionUpdate === "tool_call") {
            return Effect.logDebug(`    Tool call: ${update.title}`);
          }
          const callback = options.onConfigOptions;
          if (update.sessionUpdate === "config_option_update" && callback) {
            return Effect.sync(() => callback(update.configOptions));
          }
          return Effect.void;
        }),
        Stream.tap((update) => artifactStore.push(planId, new SessionUpdate({ update }))),
        Stream.mapAccum(
          () => initial,
          (executed, part) => {
            const next = executed.addEvent(part);
            return [next, [next]] as const;
          },
        ),
        Stream.tap((executed) => outputReporter.onExecutedPlan(executed)),
        Stream.takeUntil((executed) => executed.hasRunFinished),
        Stream.mapError((reason) => new ExecutionError({ reason })),
        Stream.ensuring(artifactStore.push(planId, new Done())),
      );
    }, Stream.unwrap);

    return { execute } as const;
  }),
}) {
  static layer = Layer.effect(this)(this.make).pipe(
    Layer.provide(ArtifactStore.layer),
    Layer.provide(NodeServices.layer),
    Layer.provide(Git.layer),
  );
}
