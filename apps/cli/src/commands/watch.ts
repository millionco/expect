import { Command } from "commander";
import { Effect, Option } from "effect";
import { changesForDisplayName, Watch } from "@expect/supervisor";
import type { AgentBackend } from "@expect/agent";
import {
  CI_EXECUTION_TIMEOUT_MS,
  VERSION,
  WATCH_IDLE_STATUS_INTERVAL_MS,
  WATCH_POLL_INTERVAL_MS,
  WATCH_SETTLE_DELAY_MS,
} from "../constants";
import { layerCli } from "../layers";
import { isHeadless } from "../utils/is-headless";
import { isRunningInAgent } from "../utils/is-running-in-agent";
import {
  DEFAULT_INSTRUCTION,
  isTarget,
  resolveChangesForEffect,
  TARGETS,
} from "../utils/resolve-changes-for";
import type { Target } from "../utils/resolve-changes-for";
import { executeHeadlessEffect } from "../utils/run-test";
import { stripUndefinedRequirement } from "../utils/strip-undefined-requirement";
import { sendWatchIssueNotification } from "../utils/watch-notifications";

export interface WatchCommandOpts {
  readonly message?: string;
  readonly agent?: AgentBackend;
  readonly target?: Target;
  readonly verbose?: boolean;
  readonly headed?: boolean;
  readonly noCookies?: boolean;
  readonly ci?: boolean;
  readonly timeout?: number;
}

const configureWatchOptions = (command: Command) =>
  command
    .option("-m, --message <instruction>", "natural language instruction for what to test")
    .option("-a, --agent <provider>", "agent provider to use (claude or codex)")
    .option("-t, --target <target>", "what to watch: unstaged, branch, or changes", "unstaged")
    .option("--verbose", "enable verbose logging")
    .option("--headed", "show a visible browser window during tests")
    .option("--no-cookies", "skip system browser cookie extraction")
    .option("--ci", "force CI mode: headless, no cookies, 30-minute timeout")
    .option("--timeout <ms>", "execution timeout in milliseconds", Number.parseInt);

const configureWatchHelp = (command: Command) =>
  command.addHelpText(
    "after",
    `
Examples:
  $ expect watch
  $ expect watch -m "smoke test the dashboard"
  $ expect-watch --target branch
  $ expect-watch --headed`,
  );

export const runWatchCommand = async (opts: WatchCommandOpts) => {
  const ciMode = opts.ci || isRunningInAgent() || isHeadless();
  const timeoutMs = opts.timeout
    ? Option.some(opts.timeout)
    : ciMode
      ? Option.some(CI_EXECUTION_TIMEOUT_MS)
      : Option.none();
  const target = opts.target ?? "unstaged";
  const agent = opts.agent ?? "claude";
  const verbose = opts.verbose ?? false;
  const headed = ciMode ? false : (opts.headed ?? false);
  const requiresCookies = !(opts.noCookies ?? false) && !ciMode;

  let lastStatusAt = Date.now();
  const log = (message: string) => {
    console.log(message);
    lastStatusAt = Date.now();
  };
  const quietInterval = setInterval(() => {
    if (Date.now() - lastStatusAt < WATCH_IDLE_STATUS_INTERVAL_MS) return;
    log("Still watching for repository changes...");
  }, WATCH_IDLE_STATUS_INTERVAL_MS);

  const stopWatching = () => {
    clearInterval(quietInterval);
  };

  process.once("SIGINT", () => {
    stopWatching();
    process.exit(0);
  });
  process.once("SIGTERM", () => {
    stopWatching();
    process.exit(0);
  });

  const watchEffect = Effect.gen(function* () {
    const watch = yield* Watch;
    const { changesFor } = yield* resolveChangesForEffect(target);

    yield* Effect.sync(() => {
      log(`expect-watch v${VERSION}`);
      log(`Target: ${changesForDisplayName(changesFor)}`);
      log(`Watching for changes every ${WATCH_POLL_INTERVAL_MS}ms.`);
    });

    return yield* watch.watch({
      changesFor,
      userInstruction: opts.message ?? DEFAULT_INSTRUCTION,
      pollIntervalMs: WATCH_POLL_INTERVAL_MS,
      settleDelayMs: WATCH_SETTLE_DELAY_MS,
      onEvent: (event) => {
        log(event.message);
      },
      execute: (input) =>
        Effect.runPromise(
          stripUndefinedRequirement(
            executeHeadlessEffect({
              changesFor: input.changesFor,
              instruction: opts.message ?? DEFAULT_INSTRUCTION,
              headed,
              ci: ciMode,
              timeoutMs,
              requiresCookies,
              includeBanner: false,
              playCompletionSound: false,
            }).pipe(
              Effect.tap((result) =>
                result.status === "failed"
                  ? Effect.promise(() =>
                      sendWatchIssueNotification(
                        result.failureMessage ?? "A watched browser test failed.",
                      ),
                    )
                  : Effect.void,
              ),
              Effect.provide(layerCli({ verbose, agent })),
            ),
          ),
        ),
    });
  }).pipe(Effect.provide(layerCli({ verbose, agent })));

  return Effect.runPromise(stripUndefinedRequirement(watchEffect)).finally(stopWatching);
};

const attachWatchAction = (command: Command) =>
  command.action(async (opts: WatchCommandOpts, actionCommand: Command) => {
    const target = opts.target ?? "unstaged";
    if (!isTarget(target)) {
      actionCommand.error(`Unknown target: ${target}. Use ${TARGETS.join(", ")}.`);
    }
    await runWatchCommand(opts);
  });

export const registerWatchCommand = (program: Command) => {
  const command = configureWatchHelp(
    configureWatchOptions(
      program
        .command("watch")
        .description("watch repository changes and run browser tests when needed"),
    ),
  );

  attachWatchAction(command);
  return command;
};

export const createWatchProgram = () => {
  const command = configureWatchHelp(
    configureWatchOptions(
      new Command()
        .name("expect-watch")
        .description("watch repository changes and run browser tests when needed"),
    ),
  );

  attachWatchAction(command);
  return command;
};
