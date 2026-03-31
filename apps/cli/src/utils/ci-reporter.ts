import pc from "picocolors";
import figures from "figures";
import prettyMs from "pretty-ms";
import { formatElapsedTime } from "./format-elapsed-time";

interface CiReporterOptions {
  version: string;
  agent: string;
  timeoutMs: number | undefined;
  isGitHubActions: boolean;
}

const ghaEscape = (text: string) => text.replace(/\r?\n/g, " ").replace(/::/g, ": :");

const writeStderr = (text: string) => process.stderr.write(text + "\n");
const writeStdout = (text: string) => process.stdout.write(text + "\n");

export const createCiReporter = (options: CiReporterOptions) => {
  const header = () => {
    const timeoutLabel =
      options.timeoutMs !== undefined
        ? ` · timeout ${prettyMs(options.timeoutMs, { compact: true })}`
        : "";
    writeStderr("");
    writeStderr(
      ` ${pc.bold(pc.cyan("expect"))} ${pc.dim(`v${options.version}`)}  ${pc.dim("CI")} · ${pc.dim(options.agent)}${pc.dim(timeoutLabel)}`,
    );
  };

  const planTitle = (title: string, baseUrl: string | undefined) => {
    writeStderr("");
    writeStderr(` ${pc.bold(title)}`);
    if (baseUrl) {
      writeStderr(` ${pc.dim(baseUrl)}`);
    }
  };

  const groupOpen = () => {
    if (options.isGitHubActions) {
      writeStdout("::group::expect test execution");
    }
  };

  const groupClose = () => {
    if (options.isGitHubActions) {
      writeStdout("::endgroup::");
    }
  };

  const stepStarted = (title: string) => {
    writeStderr(` ${pc.dim(figures.circle)} ${pc.dim(title)}`);
  };

  const stepCompleted = (title: string, durationMs: number | undefined) => {
    const timeLabel =
      durationMs !== undefined ? ` ${pc.dim(`(${formatElapsedTime(durationMs)})`)}` : "";
    writeStderr(` ${pc.green(figures.tick)} ${title}${timeLabel}`);
  };

  const stepFailed = (title: string, message: string, durationMs: number | undefined) => {
    const timeLabel =
      durationMs !== undefined ? ` ${pc.dim(`(${formatElapsedTime(durationMs)})`)}` : "";
    writeStderr(` ${pc.red(figures.cross)} ${title}${timeLabel}`);
    writeStderr(`   ${pc.red(message)}`);
    if (options.isGitHubActions) {
      writeStdout(`::error title=${ghaEscape(title)} failed::${ghaEscape(message)}`);
    }
  };

  const stepSkipped = (title: string, reason: string) => {
    writeStderr(` ${pc.yellow(figures.arrowRight)} ${title} ${pc.yellow("[skipped]")}`);
    if (reason) {
      writeStderr(`   ${pc.dim(reason)}`);
    }
  };

  const heartbeat = (elapsedMs: number) => {
    writeStderr(pc.dim(` Still running… (${prettyMs(elapsedMs, { compact: true })} elapsed)`));
  };

  const summary = (
    passed: number,
    failed: number,
    skipped: number,
    total: number,
    durationMs: number,
  ) => {
    writeStderr("");
    const parts: string[] = [];
    if (passed > 0) parts.push(pc.green(`${passed} passed`));
    if (failed > 0) parts.push(pc.red(`${failed} failed`));
    if (skipped > 0) parts.push(pc.yellow(`${skipped} skipped`));
    writeStderr(` ${pc.bold("Tests")}  ${parts.join(pc.dim(" | "))} ${pc.dim(`(${total})`)}`);
    writeStderr(` ${pc.bold("Time")}   ${formatElapsedTime(durationMs)}`);
  };

  const artifacts = (
    videoPath?: string,
    replayUrl?: string,
    screenshotPaths?: readonly string[],
  ) => {
    if (!videoPath && !replayUrl && (!screenshotPaths || screenshotPaths.length === 0)) return;
    writeStderr("");
    writeStderr(` ${pc.bold("Artifacts")}`);
    if (videoPath) {
      writeStderr(`   ${pc.dim("Video")}        ${videoPath}`);
    }
    if (replayUrl) {
      writeStderr(`   ${pc.dim("Replay")}       ${replayUrl}`);
    }
    if (screenshotPaths && screenshotPaths.length > 0) {
      for (const screenshotPath of screenshotPaths) {
        writeStderr(`   ${pc.dim("Screenshot")}   ${screenshotPath}`);
      }
    }
  };

  const timeoutError = (timeoutMs: number) => {
    const message = `Execution timed out after ${prettyMs(timeoutMs, { compact: true })}`;
    writeStderr("");
    writeStderr(` ${pc.red(figures.cross)} ${pc.red(pc.bold("Timeout"))} ${pc.red(message)}`);
    if (options.isGitHubActions) {
      writeStdout(`::error title=Execution timed out::${ghaEscape(message)}`);
    }
  };

  return {
    header,
    planTitle,
    groupOpen,
    groupClose,
    stepStarted,
    stepCompleted,
    stepFailed,
    stepSkipped,
    heartbeat,
    summary,
    artifacts,
    timeoutError,
  } as const;
};

export type CiReporter = ReturnType<typeof createCiReporter>;
