import * as path from "node:path";
import { AcpSessionCreateError, AcpStreamError, Agent, AgentStreamOptions } from "@expect/agent";
import { Effect, Layer, Option, Schema, ServiceMap, Stream } from "effect";
import {
  type ChangesFor,
  type ChangedFile,
  type CommitSummary,
  ExecutedTestPlan,
  PlanId,
  RunStarted,
  type SavedFlow,
  TestPlan,
} from "@expect/shared/models";
import { buildExecutionPrompt } from "@expect/shared/prompts";
import { NodeServices } from "@effect/platform-node";
import { Git } from "./git/git";
import { EXPECT_LIVE_VIEW_URL_ENV_NAME } from "@expect/browser/mcp";
import {
  EXECUTION_CONTEXT_FILE_LIMIT,
  EXECUTION_RECENT_COMMIT_LIMIT,
  EXPECT_REPLAY_OUTPUT_ENV_NAME,
  EXPECT_STATE_DIR,
} from "./constants";

export class ExecutionError extends Schema.ErrorClass<ExecutionError>("@supervisor/ExecutionError")(
  {
    _tag: Schema.tag("@supervisor/ExecutionError"),
    reason: Schema.Union([AcpStreamError, AcpSessionCreateError]),
  },
) {
  message = `Execution failed: ${this.reason.message}`;
}

export interface ExecuteOptions {
  readonly changesFor: ChangesFor;
  readonly instruction: string;
  readonly isHeadless: boolean;
  readonly requiresCookies: boolean;
  readonly baseUrl?: string;
  readonly savedFlow?: SavedFlow;
  readonly learnings?: string;
  readonly liveViewUrl?: string;
}

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
        requiresCookies: options.requiresCookies,
        savedFlow: options.savedFlow,
        learnings: options.learnings,
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
        requiresCookies: options.requiresCookies,
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
        mcpEnv.push({ name: EXPECT_LIVE_VIEW_URL_ENV_NAME, value: options.liveViewUrl });
      }

      const streamOptions = new AgentStreamOptions({
        cwd: process.cwd(),
        sessionId: Option.none(),
        prompt,
        systemPrompt: Option.none(),
        mcpEnv,
      });

      return agent.stream(streamOptions).pipe(
        Stream.mapAccum(
          () => initial,
          (executed, part) => {
            const next = executed.addEvent(part);
            return [next, [next]] as const;
          },
        ),
        Stream.mapError((reason) => new ExecutionError({ reason })),
      );
    }, Stream.unwrap);

    return { execute } as const;
  }),
}) {
  static layer = Layer.effect(this)(this.make).pipe(Layer.provide(NodeServices.layer));
}
