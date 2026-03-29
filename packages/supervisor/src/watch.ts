import { Data, Effect, Layer, Option, Ref, Schedule, Schema, ServiceMap, Stream } from "effect";
import { Agent, AgentStreamOptions } from "@expect/agent";
import {
  AcpAgentMessageChunk,
  type ChangedFile,
  type ChangesFor,
  type ExecutedTestPlan,
} from "@expect/shared/models";
import { buildWatchAssessmentPrompt } from "@expect/shared/prompts";
import { Git, GitRepoRoot } from "./git/git";
import type { ExecuteOptions } from "./executor";
import { Executor } from "./executor";

const WATCH_POLL_INTERVAL_MS = 2000;
const WATCH_SETTLE_DELAY_MS = 3000;
const ASSESSMENT_BACKOFF_LIMIT = 2;

export type WatchDecision = "run" | "skip";

export type WatchEvent = Data.TaggedEnum<{
  Polling: {};
  ChangeDetected: { readonly fingerprint: string };
  Settling: {};
  Assessing: {};
  RunStarting: { readonly fingerprint: string };
  RunUpdate: { readonly executedPlan: ExecutedTestPlan };
  RunCompleted: { readonly executedPlan: ExecutedTestPlan; readonly fingerprint: string };
  Skipped: { readonly fingerprint: string };
  Error: { readonly error: unknown };
  Stopped: {};
}>;
export const WatchEvent = Data.taggedEnum<WatchEvent>();

interface WatchState {
  readonly lastTestedFingerprint: string | undefined;
  readonly assessmentFailures: number;
  readonly lastAssessedFingerprint: string | undefined;
}

export class WatchAssessmentError extends Schema.ErrorClass<WatchAssessmentError>(
  "WatchAssessmentError",
)({
  _tag: Schema.tag("WatchAssessmentError"),
  response: Schema.String,
}) {
  message = `Unparseable watch assessment response: ${this.response}`;
}

export interface WatchOptions {
  readonly changesFor: ChangesFor;
  readonly instruction: string;
  readonly isHeadless: boolean;
  readonly cookieBrowserKeys: readonly string[];
  readonly baseUrl?: string;
  readonly onEvent: (event: WatchEvent) => void;
}

export const parseAssessmentResponse = (raw: string): WatchDecision | undefined => {
  const trimmed = raw.trim().toLowerCase();
  if (trimmed === "run") return "run";
  if (trimmed === "skip") return "skip";
  if (trimmed.startsWith("run")) return "run";
  if (trimmed.startsWith("skip")) return "skip";
  return undefined;
};

const handleAgentAssessmentError = (error: Error) =>
  Effect.gen(function* () {
    yield* Effect.logWarning("Agent error during watch assessment, defaulting to run", {
      error: error.message,
    });
    return "run" as WatchDecision;
  });

export class Watch extends ServiceMap.Service<Watch>()("@supervisor/Watch", {
  make: Effect.gen(function* () {
    const agent = yield* Agent;
    const git = yield* Git;
    const executor = yield* Executor;

    const assess = Effect.fn("Watch.assess")(function* (
      changedFiles: readonly ChangedFile[],
      diffPreview: string,
      instruction: string,
    ) {
      const repoRoot = yield* GitRepoRoot;
      const prompt = buildWatchAssessmentPrompt({ diffPreview, changedFiles, instruction });

      const streamOptions = new AgentStreamOptions({
        cwd: repoRoot,
        sessionId: Option.none(),
        prompt,
        systemPrompt: Option.none(),
        mcpEnv: [],
      });

      const responseText: string = yield* agent.stream(streamOptions).pipe(
        Stream.filter(
          (update): update is AcpAgentMessageChunk =>
            update.sessionUpdate === "agent_message_chunk",
        ),
        Stream.map((update) => (update.content.type === "text" ? update.content.text : "")),
        Stream.runFold(
          () => "",
          (accumulated: string, chunk: string) => accumulated + chunk,
        ),
      );

      const decision = parseAssessmentResponse(responseText);
      if (!decision) {
        return yield* new WatchAssessmentError({ response: responseText });
      }

      yield* Effect.logInfo("Watch assessment completed", {
        decision,
        responseLength: responseText.length,
      });
      return decision;
    });

    const run = Effect.fn("Watch.run")(function* (options: WatchOptions) {
      const stateRef = yield* Ref.make<WatchState>({
        lastTestedFingerprint: undefined,
        assessmentFailures: 0,
        lastAssessedFingerprint: undefined,
      });

      const completionRef = yield* Ref.make<Option.Option<ExecutedTestPlan>>(Option.none());

      const pollOnce = Effect.gen(function* () {
        const fingerprint = yield* git.computeFingerprint();
        if (!fingerprint) return;

        const state = yield* Ref.get(stateRef);

        if (fingerprint === state.lastTestedFingerprint) {
          options.onEvent(WatchEvent.Polling());
          return;
        }

        options.onEvent(WatchEvent.ChangeDetected({ fingerprint }));

        options.onEvent(WatchEvent.Settling());
        yield* Effect.sleep(`${WATCH_SETTLE_DELAY_MS} millis`);

        const settledFingerprint = yield* git.computeFingerprint();
        if (settledFingerprint !== fingerprint) return;

        const changedFiles = yield* git.getChangedFiles(options.changesFor);
        const diffPreview = yield* git.getDiffPreview(options.changesFor);

        const shouldResetBackoff = state.lastAssessedFingerprint !== fingerprint;

        if (shouldResetBackoff) {
          yield* Ref.update(stateRef, (current) => ({
            ...current,
            assessmentFailures: 0,
            lastAssessedFingerprint: fingerprint,
          }));
        }

        const currentState = yield* Ref.get(stateRef);

        let decision: WatchDecision;
        if (currentState.assessmentFailures >= ASSESSMENT_BACKOFF_LIMIT) {
          yield* Effect.logWarning("Assessment backoff reached, defaulting to run");
          decision = "run";
        } else {
          options.onEvent(WatchEvent.Assessing());
          const assessResult = yield* assess(changedFiles, diffPreview, options.instruction).pipe(
            Effect.catchTag("WatchAssessmentError", (assessmentError) =>
              Effect.gen(function* () {
                yield* Ref.update(stateRef, (current) => ({
                  ...current,
                  assessmentFailures: current.assessmentFailures + 1,
                }));
                yield* Effect.logWarning("Assessment failed, will retry or backoff", {
                  response: assessmentError.response,
                });
                return "run" as WatchDecision;
              }),
            ),
            Effect.catchTags({
              AcpStreamError: handleAgentAssessmentError,
              AcpSessionCreateError: handleAgentAssessmentError,
              AcpProviderUnauthenticatedError: handleAgentAssessmentError,
              AcpProviderUsageLimitError: handleAgentAssessmentError,
            }),
          );
          decision = assessResult;
        }

        if (decision === "skip") {
          options.onEvent(WatchEvent.Skipped({ fingerprint }));
          yield* Ref.update(stateRef, (current) => ({
            ...current,
            lastTestedFingerprint: fingerprint,
          }));
          return;
        }

        options.onEvent(WatchEvent.RunStarting({ fingerprint }));

        const executeOptions: ExecuteOptions = {
          changesFor: options.changesFor,
          instruction: options.instruction,
          isHeadless: options.isHeadless,
          cookieBrowserKeys: options.cookieBrowserKeys,
          baseUrl: options.baseUrl,
        };

        const finalExecuted = yield* executor.execute(executeOptions).pipe(
          Stream.tap((executed) =>
            Effect.sync(() => options.onEvent(WatchEvent.RunUpdate({ executedPlan: executed }))),
          ),
          Stream.runLast,
          Effect.map((option) => (option._tag === "Some" ? option.value : undefined)),
          Effect.catchTag("ExecutionError", (executionError) =>
            Effect.gen(function* () {
              options.onEvent(WatchEvent.Error({ error: executionError }));
              yield* Effect.logWarning("Watch run execution error", {
                error: executionError.message,
              });
              return undefined;
            }),
          ),
        );

        if (finalExecuted) {
          const completed = finalExecuted.finalizeTextBlock().synthesizeRunFinished();
          yield* Ref.set(completionRef, Option.some(completed));
          options.onEvent(WatchEvent.RunCompleted({ executedPlan: completed, fingerprint }));
          yield* git.saveTestedFingerprint().pipe(
            Effect.catchTag("PlatformError", (error) =>
              Effect.logWarning("Failed to save tested fingerprint", {
                error: error.message,
              }),
            ),
          );
        }

        yield* Ref.update(stateRef, (current) => ({
          ...current,
          lastTestedFingerprint: fingerprint,
        }));
      });

      const loop = pollOnce.pipe(
        Effect.repeat(Schedule.spaced(`${WATCH_POLL_INTERVAL_MS} millis`)),
      );

      return { loop, completionRef };
    });

    return { assess, run } as const;
  }),
}) {
  static layer = Layer.effect(this)(this.make);
}
