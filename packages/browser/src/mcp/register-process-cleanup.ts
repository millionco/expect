import type { Signal } from "node:process";

const UNIX_SIGNALS = ["SIGINT", "SIGTERM", "SIGHUP"] as const;
const WINDOWS_SIGNALS = ["SIGINT", "SIGTERM", "SIGBREAK"] as const;

type SignalShutdownReason = (typeof UNIX_SIGNALS)[number] | (typeof WINDOWS_SIGNALS)[number];

export type ShutdownReason =
  | SignalShutdownReason
  | "beforeExit"
  | "disconnect"
  | "stdin-close"
  | "stdin-end";

interface RegisterProcessCleanupOptions {
  readonly cleanup: (reason: ShutdownReason) => Promise<void>;
  readonly afterCleanup?: (reason: ShutdownReason) => Promise<void> | void;
  readonly watchStdin?: boolean;
}

let cleanupRegistered = false;

const SIGNALS: readonly SignalShutdownReason[] =
  process.platform === "win32" ? WINDOWS_SIGNALS : UNIX_SIGNALS;

const formatError = (error: unknown) => (error instanceof Error ? error.stack ?? error.message : String(error));

const writeShutdownError = (stage: "cleanup" | "afterCleanup", reason: ShutdownReason, error: unknown) => {
  process.stderr.write(
    `expect mcp ${stage} failed during ${reason}: ${formatError(error)}\n`,
  );
};

export const registerProcessCleanup = (options: RegisterProcessCleanupOptions) => {
  if (cleanupRegistered) return;
  cleanupRegistered = true;

  let exitAfterCleanup = false;
  let shutdownPromise: Promise<void> | undefined;

  const requestShutdown = (reason: ShutdownReason, shouldExit: boolean) => {
    exitAfterCleanup = exitAfterCleanup || shouldExit;
    if (shutdownPromise) return;

    shutdownPromise = options.cleanup(reason)
      .catch((error) => {
        writeShutdownError("cleanup", reason, error);
      })
      .then(() => options.afterCleanup?.(reason))
      .catch((error) => {
        writeShutdownError("afterCleanup", reason, error);
      })
      .then(() => {
        if (exitAfterCleanup) {
          process.exit(0);
        }
      });
  };

  for (const signal of SIGNALS) {
    process.once(signal as Signal, () => {
      requestShutdown(signal, true);
    });
  }

  process.once("beforeExit", () => {
    requestShutdown("beforeExit", false);
  });

  process.once("disconnect", () => {
    requestShutdown("disconnect", true);
  });

  if (options.watchStdin) {
    if (process.stdin.readableEnded) {
      requestShutdown("stdin-end", true);
      return;
    }
    if (process.stdin.destroyed) {
      requestShutdown("stdin-close", true);
      return;
    }
    process.stdin.once("end", () => {
      requestShutdown("stdin-end", true);
    });
    process.stdin.once("close", () => {
      requestShutdown("stdin-close", true);
    });
  }
};
