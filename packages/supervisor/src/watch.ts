import * as crypto from "node:crypto";
import * as path from "node:path";
import { Agent, AgentStreamOptions } from "@expect/agent";
import { type ChangedFile, type ChangesFor, type TestCoverageReport } from "@expect/shared/models";
import { buildWatchAssessmentPrompt } from "@expect/shared/prompts";
import { Effect, Layer, Option, Schema, ServiceMap, Stream } from "effect";
import { Git } from "./git/git";
import { isTestFile, TestCoverage } from "./test-coverage";
import { categorizeChangedFiles, formatFileCategories } from "./utils/categorize-changed-files";

const WATCH_FINGERPRINT_SEPARATOR = "\0";
const DOCUMENTATION_EXTENSIONS = new Set([".md", ".mdx", ".txt", ".rst"]);
const ASSET_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".webp",
  ".ico",
  ".avif",
]);
const CONFIG_BASENAMES = new Set([
  "package.json",
  "pnpm-lock.yaml",
  "package-lock.json",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
  "tsconfig.json",
  "vite.config.ts",
  "vite.config.js",
  "vitest.config.ts",
  "vitest.config.js",
  "turbo.json",
]);

export interface WatchDecision {
  readonly shouldRun: boolean;
  readonly reason: string;
  readonly source: "heuristic" | "agent";
}

export interface WatchHeuristicDecision {
  readonly action: "run" | "skip" | "borderline";
  readonly reason: string;
}

export interface WatchHeuristicInput {
  readonly changedFiles: readonly ChangedFile[];
  readonly testCoverage?: TestCoverageReport;
}

export interface WatchSnapshot {
  readonly currentBranch: string;
  readonly mainBranch: string | undefined;
  readonly changedFiles: readonly ChangedFile[];
  readonly diffPreview: string;
  readonly fingerprint: string | undefined;
}

export interface WatchState {
  readonly handledFingerprint: string | undefined;
  readonly pendingFingerprint: string | undefined;
  readonly pendingSinceMs: number | undefined;
  readonly runningFingerprint: string | undefined;
  readonly rerunQueued: boolean;
}

export interface WatchStateInput {
  readonly fingerprint: string | undefined;
  readonly hasChanges: boolean;
  readonly nowMs: number;
  readonly settleDelayMs: number;
}

export interface WatchStateAdvance {
  readonly state: WatchState;
  readonly shouldAssess: boolean;
  readonly changeDetected: boolean;
  readonly rerunQueued: boolean;
}

export interface WatchExecutionInput {
  readonly changesFor: ChangesFor;
  readonly fingerprint: string;
  readonly decision: WatchDecision;
}

export interface WatchExecutionResult {
  readonly status: "passed" | "failed";
  readonly message?: string;
}

export interface WatchEvent {
  readonly _tag:
    | "WatchStarted"
    | "ChangeDetected"
    | "Decision"
    | "RunStarted"
    | "RunCompleted"
    | "RerunQueued";
  readonly message: string;
}

export interface WatchOptions {
  readonly changesFor: ChangesFor;
  readonly userInstruction: string;
  readonly pollIntervalMs: number;
  readonly settleDelayMs: number;
  readonly onEvent?: (event: WatchEvent) => void;
  readonly shouldContinue?: () => boolean;
  readonly execute: (input: WatchExecutionInput) => Promise<WatchExecutionResult>;
}

interface WatchRunCompletion {
  readonly fingerprint: string;
  readonly result: WatchExecutionResult;
}

export const INITIAL_WATCH_STATE: WatchState = {
  handledFingerprint: undefined,
  pendingFingerprint: undefined,
  pendingSinceMs: undefined,
  runningFingerprint: undefined,
  rerunQueued: false,
};

export class WatchAssessmentResponseParseError extends Schema.ErrorClass<WatchAssessmentResponseParseError>(
  "WatchAssessmentResponseParseError",
)({
  _tag: Schema.tag("WatchAssessmentResponseParseError"),
  rawResponse: Schema.String,
}) {
  message = "Watch assessment response could not be parsed";
}

const isDocumentationPath = (filePath: string) => {
  const extension = path.extname(filePath).toLowerCase();
  const basename = path.basename(filePath).toLowerCase();
  return (
    DOCUMENTATION_EXTENSIONS.has(extension) ||
    basename === "readme" ||
    basename.startsWith("readme.") ||
    basename === "changelog" ||
    basename.startsWith("changelog.")
  );
};

const isAssetPath = (filePath: string) =>
  ASSET_EXTENSIONS.has(path.extname(filePath).toLowerCase());

const isConfigLikePath = (filePath: string) => {
  const basename = path.basename(filePath).toLowerCase();
  if (CONFIG_BASENAMES.has(basename)) return true;
  return (
    basename.startsWith("eslint.") ||
    basename.startsWith("prettier.") ||
    basename.startsWith("postcss.") ||
    basename.startsWith("tailwind.")
  );
};

const summarizeChangedFilesForWatch = (changedFiles: readonly ChangedFile[]) => {
  const filePaths = changedFiles.map((file) => file.path);
  const summary = categorizeChangedFiles(filePaths);

  if (summary.categories.length > 0) {
    return `${summary.totalFiles} files changed (${formatFileCategories(summary.categories)})`;
  }

  if (filePaths.length > 0 && filePaths.every(isTestFile)) {
    return `${filePaths.length} test file${filePaths.length === 1 ? "" : "s"} changed`;
  }

  if (
    filePaths.length > 0 &&
    filePaths.every((filePath) => isDocumentationPath(filePath) || isAssetPath(filePath))
  ) {
    return `${filePaths.length} documentation or asset file${filePaths.length === 1 ? "" : "s"} changed`;
  }

  return `${filePaths.length} file${filePaths.length === 1 ? "" : "s"} changed`;
};

const createWatchFingerprint = (snapshot: Omit<WatchSnapshot, "fingerprint">) => {
  if (snapshot.changedFiles.length === 0 && snapshot.diffPreview.trim().length === 0)
    return undefined;

  const changedFileSummary = snapshot.changedFiles
    .map((file) => `${file.status}:${file.path}`)
    .sort()
    .join("\n");

  return crypto
    .createHash("sha256")
    .update(snapshot.currentBranch)
    .update(WATCH_FINGERPRINT_SEPARATOR)
    .update(snapshot.mainBranch ?? "")
    .update(WATCH_FINGERPRINT_SEPARATOR)
    .update(changedFileSummary)
    .update(WATCH_FINGERPRINT_SEPARATOR)
    .update(snapshot.diffPreview)
    .digest("hex");
};

export const assessWatchHeuristic = ({
  changedFiles,
  testCoverage,
}: WatchHeuristicInput): WatchHeuristicDecision => {
  const filePaths = changedFiles.map((file) => file.path);
  if (filePaths.length === 0) {
    return { action: "skip", reason: "No changed files detected." };
  }

  if (filePaths.every(isTestFile)) {
    return { action: "skip", reason: "Only automated test files changed." };
  }

  if (filePaths.every((filePath) => isDocumentationPath(filePath) || isAssetPath(filePath))) {
    return { action: "skip", reason: "Only documentation or static asset files changed." };
  }

  const changedSummary = categorizeChangedFiles(filePaths);
  const browserFacingChanges = changedSummary.categories.filter(
    (category) =>
      category.label === "component" ||
      category.label === "stylesheet" ||
      category.label === "template",
  );
  if (browserFacingChanges.length > 0) {
    return {
      action: "run",
      reason: `Browser-facing files changed: ${formatFileCategories(browserFacingChanges)}.`,
    };
  }

  const uncoveredEntries = testCoverage?.entries.filter((entry) => !entry.covered) ?? [];
  if (uncoveredEntries.length > 0) {
    return {
      action: "run",
      reason: `Changed files without automated coverage: ${uncoveredEntries
        .map((entry) => entry.path)
        .slice(0, 3)
        .join(", ")}.`,
    };
  }

  if (changedSummary.totalWebFiles > 0) {
    return {
      action: "borderline",
      reason: `Shared web code changed: ${formatFileCategories(changedSummary.categories)}.`,
    };
  }

  if (filePaths.some(isConfigLikePath)) {
    return {
      action: "borderline",
      reason: "Configuration or build files changed and may affect browser behavior indirectly.",
    };
  }

  return {
    action: "borderline",
    reason: "Changed files may affect browser behavior indirectly.",
  };
};

export const parseWatchAssessmentResponse = (responseText: string): WatchDecision => {
  const firstNonEmptyLine =
    responseText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? "";

  const [prefix, verdict, ...reasonParts] = firstNonEmptyLine.split("|");
  const reason = reasonParts.join("|").trim();

  if (prefix !== "RUN_TEST" || (verdict !== "yes" && verdict !== "no") || reason.length === 0) {
    throw new WatchAssessmentResponseParseError({ rawResponse: responseText });
  }

  return {
    shouldRun: verdict === "yes",
    reason,
    source: "agent",
  };
};

export const advanceWatchState = (state: WatchState, input: WatchStateInput): WatchStateAdvance => {
  if (!input.hasChanges || !input.fingerprint) {
    return {
      state: {
        ...state,
        pendingFingerprint: undefined,
        pendingSinceMs: undefined,
      },
      shouldAssess: false,
      changeDetected: false,
      rerunQueued: false,
    };
  }

  if (state.runningFingerprint) {
    const shouldQueueRerun =
      input.fingerprint !== state.runningFingerprint && state.rerunQueued === false;

    return {
      state: shouldQueueRerun ? { ...state, rerunQueued: true } : state,
      shouldAssess: false,
      changeDetected: false,
      rerunQueued: shouldQueueRerun,
    };
  }

  if (state.handledFingerprint === input.fingerprint) {
    return {
      state: {
        ...state,
        pendingFingerprint: undefined,
        pendingSinceMs: undefined,
      },
      shouldAssess: false,
      changeDetected: false,
      rerunQueued: false,
    };
  }

  if (state.pendingFingerprint !== input.fingerprint) {
    return {
      state: {
        ...state,
        pendingFingerprint: input.fingerprint,
        pendingSinceMs: input.nowMs,
      },
      shouldAssess: false,
      changeDetected: true,
      rerunQueued: false,
    };
  }

  const pendingSinceMs = state.pendingSinceMs ?? input.nowMs;
  return {
    state,
    shouldAssess: input.nowMs - pendingSinceMs >= input.settleDelayMs,
    changeDetected: false,
    rerunQueued: false,
  };
};

export const markWatchRunStarted = (state: WatchState, fingerprint: string): WatchState => ({
  ...state,
  pendingFingerprint: undefined,
  pendingSinceMs: undefined,
  runningFingerprint: fingerprint,
  rerunQueued: false,
});

export const markWatchHandled = (state: WatchState, fingerprint: string): WatchState => ({
  ...state,
  handledFingerprint: fingerprint,
  pendingFingerprint: undefined,
  pendingSinceMs: undefined,
});

export const markWatchRunFinished = (state: WatchState): WatchState => ({
  ...state,
  runningFingerprint: undefined,
  rerunQueued: false,
});

export class Watch extends ServiceMap.Service<Watch>()("@supervisor/Watch", {
  make: Effect.gen(function* () {
    const agent = yield* Agent;
    const git = yield* Git;
    const testCoverage = yield* TestCoverage;

    const loadSnapshot = Effect.fn("Watch.loadSnapshot")(function* (changesFor: ChangesFor) {
      const [changedFiles, diffPreview, currentBranch, mainBranch] = yield* Effect.all(
        [
          git.getChangedFiles(changesFor),
          git.getDiffPreview(changesFor),
          git.getCurrentBranch,
          git.getMainBranch,
        ],
        { concurrency: "unbounded" },
      );

      const snapshotWithoutFingerprint = {
        changedFiles,
        diffPreview,
        currentBranch,
        mainBranch,
      } satisfies Omit<WatchSnapshot, "fingerprint">;

      return {
        ...snapshotWithoutFingerprint,
        fingerprint: createWatchFingerprint(snapshotWithoutFingerprint),
      } satisfies WatchSnapshot;
    });

    const collectAgentAssessment = Effect.fn("Watch.collectAgentAssessment")(function* (
      snapshot: WatchSnapshot,
      heuristicReason: string,
      userInstruction: string,
      coverage: TestCoverageReport | undefined,
    ) {
      const prompt = buildWatchAssessmentPrompt({
        userInstruction,
        currentBranch: snapshot.currentBranch,
        mainBranch: snapshot.mainBranch,
        changedFiles: snapshot.changedFiles,
        diffPreview: snapshot.diffPreview,
        heuristicReason,
        changedFileSummary: summarizeChangedFilesForWatch(snapshot.changedFiles),
        testCoverage: coverage,
      });

      const responseText = yield* agent
        .stream(
          new AgentStreamOptions({
            cwd: process.cwd(),
            sessionId: Option.none(),
            prompt,
            systemPrompt: Option.none(),
          }),
        )
        .pipe(
          Stream.runCollect,
          Effect.map((updates) =>
            updates
              .filter(
                (update) =>
                  update.sessionUpdate === "agent_message_chunk" && update.content.type === "text",
              )
              .map((update) =>
                update.sessionUpdate === "agent_message_chunk" && update.content.type === "text"
                  ? update.content.text
                  : "",
              )
              .join("")
              .trim(),
          ),
          Effect.catchTags({
            AcpProviderUnauthenticatedError: (error) =>
              Effect.gen(function* () {
                yield* Effect.logWarning("Watch assessment agent unavailable", {
                  reason: error._tag,
                });
                return "RUN_TEST|yes|agent assessment unavailable, defaulting to a browser test";
              }),
            AcpProviderUsageLimitError: (error) =>
              Effect.gen(function* () {
                yield* Effect.logWarning("Watch assessment agent unavailable", {
                  reason: error._tag,
                });
                return "RUN_TEST|yes|agent assessment unavailable, defaulting to a browser test";
              }),
            AcpSessionCreateError: (error) =>
              Effect.gen(function* () {
                yield* Effect.logWarning("Watch assessment agent unavailable", {
                  reason: error._tag,
                });
                return "RUN_TEST|yes|agent assessment unavailable, defaulting to a browser test";
              }),
            AcpStreamError: (error) =>
              Effect.gen(function* () {
                yield* Effect.logWarning("Watch assessment agent unavailable", {
                  reason: error._tag,
                });
                return "RUN_TEST|yes|agent assessment unavailable, defaulting to a browser test";
              }),
          }),
        );

      return yield* Effect.try({
        try: () => parseWatchAssessmentResponse(responseText),
        catch: () => new WatchAssessmentResponseParseError({ rawResponse: responseText }),
      }).pipe(
        Effect.catchTag("WatchAssessmentResponseParseError", (error) =>
          Effect.gen(function* () {
            yield* Effect.logWarning("Watch assessment response was invalid", {
              rawResponse: error.rawResponse,
            });
            return {
              shouldRun: true,
              reason: "Agent assessment response was invalid, defaulting to a browser test.",
              source: "agent",
            } satisfies WatchDecision;
          }),
        ),
      );
    });

    const assessSnapshot = Effect.fn("Watch.assessSnapshot")(function* (
      snapshot: WatchSnapshot,
      userInstruction: string,
    ) {
      const initialHeuristic = assessWatchHeuristic({ changedFiles: snapshot.changedFiles });
      if (initialHeuristic.action === "run") {
        return {
          shouldRun: true,
          reason: initialHeuristic.reason,
          source: "heuristic",
        } satisfies WatchDecision;
      }

      if (initialHeuristic.action === "skip") {
        return {
          shouldRun: false,
          reason: initialHeuristic.reason,
          source: "heuristic",
        } satisfies WatchDecision;
      }

      const coverage =
        snapshot.changedFiles.length > 0
          ? yield* testCoverage.analyze(snapshot.changedFiles)
          : undefined;
      const heuristicWithCoverage = assessWatchHeuristic({
        changedFiles: snapshot.changedFiles,
        testCoverage: coverage,
      });

      if (heuristicWithCoverage.action === "run") {
        return {
          shouldRun: true,
          reason: heuristicWithCoverage.reason,
          source: "heuristic",
        } satisfies WatchDecision;
      }

      if (heuristicWithCoverage.action === "skip") {
        return {
          shouldRun: false,
          reason: heuristicWithCoverage.reason,
          source: "heuristic",
        } satisfies WatchDecision;
      }

      return yield* collectAgentAssessment(
        snapshot,
        heuristicWithCoverage.reason,
        userInstruction,
        coverage,
      );
    });

    const watch = Effect.fn("Watch.watch")(function* (options: WatchOptions) {
      let state: WatchState = INITIAL_WATCH_STATE;
      let latestCompletion: WatchRunCompletion | undefined;

      const emit = (event: WatchEvent) =>
        Effect.sync(() => {
          options.onEvent?.(event);
        });

      const startExecution = (input: WatchExecutionInput) =>
        Effect.sync(() => {
          void options
            .execute(input)
            .then((result) => {
              latestCompletion = {
                fingerprint: input.fingerprint,
                result,
              };
            })
            .catch((error) => {
              latestCompletion = {
                fingerprint: input.fingerprint,
                result: {
                  status: "failed",
                  message: error instanceof Error ? error.message : String(error),
                },
              };
            });
        });

      yield* Effect.logInfo("Expect watch started", {
        scope: options.changesFor._tag,
        pollIntervalMs: options.pollIntervalMs,
        settleDelayMs: options.settleDelayMs,
      });
      yield* emit({
        _tag: "WatchStarted",
        message: "Watching for repository changes.",
      });

      while (true) {
        if (options.shouldContinue?.() === false) {
          return;
        }

        if (latestCompletion) {
          const completion = latestCompletion;
          const rerunWasQueued = state.rerunQueued;
          latestCompletion = undefined;
          state = markWatchHandled(markWatchRunFinished(state), completion.fingerprint);

          yield* Effect.logInfo("Expect watch run completed", {
            status: completion.result.status,
            rerunQueued: rerunWasQueued,
          });
          yield* emit({
            _tag: "RunCompleted",
            message:
              completion.result.message && completion.result.message.length > 0
                ? `Browser test ${completion.result.status}: ${completion.result.message}`
                : `Browser test ${completion.result.status}.`,
          });

          if (rerunWasQueued) {
            yield* emit({
              _tag: "RerunQueued",
              message: "Rechecking the latest changes after the queued rerun signal.",
            });
          }
        }

        const snapshot = yield* loadSnapshot(options.changesFor);
        const nextState = advanceWatchState(state, {
          fingerprint: snapshot.fingerprint,
          hasChanges: snapshot.changedFiles.length > 0,
          nowMs: Date.now(),
          settleDelayMs: options.settleDelayMs,
        });
        state = nextState.state;

        if (nextState.changeDetected) {
          yield* emit({
            _tag: "ChangeDetected",
            message: "Change detected. Waiting for edits to settle before assessing.",
          });
        }

        if (nextState.rerunQueued) {
          yield* emit({
            _tag: "RerunQueued",
            message: "Changes arrived during an active run. Queued one rerun.",
          });
        }

        if (nextState.shouldAssess && snapshot.fingerprint) {
          const decision = yield* assessSnapshot(snapshot, options.userInstruction);
          yield* Effect.logInfo("Expect watch assessment completed", {
            shouldRun: decision.shouldRun,
            source: decision.source,
            reason: decision.reason,
          });
          yield* emit({
            _tag: "Decision",
            message: decision.shouldRun
              ? `Running browser test: ${decision.reason}`
              : `Skipping browser test: ${decision.reason}`,
          });

          if (decision.shouldRun) {
            state = markWatchRunStarted(state, snapshot.fingerprint);
            yield* emit({
              _tag: "RunStarted",
              message: `Starting browser test (${decision.source}).`,
            });
            yield* startExecution({
              changesFor: options.changesFor,
              fingerprint: snapshot.fingerprint,
              decision,
            });
          } else {
            state = markWatchHandled(state, snapshot.fingerprint);
          }
        }

        if (options.shouldContinue?.() === false) {
          return;
        }

        yield* Effect.sleep(`${options.pollIntervalMs} millis`);
      }
    });

    return {
      watch,
    } as const;
  }),
}) {
  static layer = Layer.effect(this)(this.make);
}
