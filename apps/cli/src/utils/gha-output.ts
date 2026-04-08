import { Config, Effect, Option } from "effect";
import * as fs from "node:fs";

export const writeGhaOutputs = Effect.fn("GhaOutput.writeGhaOutputs")(function* (
  status: string,
  videoPath: string | undefined,
) {
  const githubOutputPath = yield* Config.option(Config.string("GITHUB_OUTPUT"));
  if (Option.isNone(githubOutputPath)) return;

  const outputLines: string[] = [`result=${status}`];
  if (videoPath) {
    outputLines.push(`video_path=${videoPath}`);
  }

  yield* Effect.sync(() =>
    fs.appendFileSync(githubOutputPath.value, outputLines.join("\n") + "\n"),
  );
});

export const writeGhaStepSummary = Effect.fn("GhaOutput.writeGhaStepSummary")(function* (
  reportText: string,
  status: string,
  videoPath: string | undefined,
) {
  const summaryPath = yield* Config.option(Config.string("GITHUB_STEP_SUMMARY"));
  if (Option.isNone(summaryPath)) return;

  const badge = status === "passed" ? "**Result: PASSED**" : "**Result: FAILED**";
  const artifactLines: string[] = [];
  if (videoPath) {
    artifactLines.push("**Video:** uploaded as artifact (see workflow artifacts above)");
  }
  const artifactSection = artifactLines.length > 0 ? `\n${artifactLines.join("\n")}\n` : "";
  const maxBacktickRun = (reportText.match(/`+/g) ?? []).reduce(
    (max, run) => Math.max(max, run.length),
    2,
  );
  const fence = "`".repeat(maxBacktickRun + 1);
  const summary = `## expect test results\n\n${badge}\n\n${fence}\n${reportText}\n${fence}\n${artifactSection}`;

  yield* Effect.sync(() => fs.appendFileSync(summaryPath.value, summary));
});
