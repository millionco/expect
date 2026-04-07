import { execFile } from "node:child_process";
import * as fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Effect, Schema } from "effect";
import which from "which";
import { FFMPEG_TIMEOUT_MS, FRAME_PADDING_PX } from "./constants";

const WALLPAPER_FILENAME = "wallpaper.webp";

export const resolveWallpaperPath = (): string | undefined => {
  try {
    const currentDir = dirname(fileURLToPath(import.meta.url));
    return [
      join(currentDir, "..", "assets", WALLPAPER_FILENAME),
      join(currentDir, "assets", WALLPAPER_FILENAME),
    ].find(fs.existsSync);
  } catch {
    return undefined;
  }
};

const MPDECIMATE_HI = "64*1000";
const MPDECIMATE_LO = "64*500";
const MPDECIMATE_FRAC = "0.1";

export class VideoProcessError extends Schema.ErrorClass<VideoProcessError>("VideoProcessError")({
  _tag: Schema.tag("VideoProcessError"),
  cause: Schema.Unknown,
}) {
  message = `Video processing failed: ${String(this.cause)}`;
}

let cachedFfmpegMode: "system" | "wasm" | "none" | undefined;
let cachedSystemPath: string | undefined;

const probeSystemFfmpeg = (): string | undefined => {
  return which.sync("ffmpeg", { nothrow: true }) ?? undefined;
};

const runSystemFfmpeg = Effect.fn("runSystemFfmpeg")(function* (args: string[]) {
  const binaryPath = cachedSystemPath;
  if (!binaryPath) return yield* new VideoProcessError({ cause: "system ffmpeg not available" });

  yield* Effect.callback<void, VideoProcessError>((resume) => {
    const child = execFile(
      binaryPath,
      args,
      { timeout: FFMPEG_TIMEOUT_MS },
      (error, _stdout, stderr) => {
        if (error) {
          return resume(Effect.fail(new VideoProcessError({ cause: stderr || error.message })));
        }
        resume(Effect.void);
      },
    );
    return Effect.sync(() => child.kill());
  });
});

const runWasmFfmpeg = Effect.fn("runWasmFfmpeg")(function* (
  args: string[],
  inputFiles: readonly string[],
  outputFile: string,
) {
  yield* Effect.tryPromise({
    try: async () => {
      const { FFmpeg } = await import("@ffmpeg/ffmpeg");
      const { fetchFile } = await import("@ffmpeg/util");

      const ffmpeg = new FFmpeg();
      await ffmpeg.load();

      for (const filePath of inputFiles) {
        const data = await fetchFile(filePath);
        await ffmpeg.writeFile(filePath.split("/").pop()!, data);
      }

      const rewrittenArgs = args.map((arg) => {
        for (const filePath of inputFiles) {
          if (arg === filePath) return filePath.split("/").pop()!;
        }
        if (arg === outputFile) return "output" + outputFile.slice(outputFile.lastIndexOf("."));
        return arg;
      });

      const outputName = "output" + outputFile.slice(outputFile.lastIndexOf("."));
      await ffmpeg.exec(rewrittenArgs);

      const outputData = await ffmpeg.readFile(outputName);
      fs.writeFileSync(outputFile, Buffer.from(outputData as Uint8Array));
      ffmpeg.terminate();
    },
    catch: (error) => new VideoProcessError({ cause: error }),
  });
});

const runFfmpeg = Effect.fn("runFfmpeg")(function* (
  args: string[],
  inputFiles: readonly string[],
  outputFile: string,
) {
  if (cachedFfmpegMode === undefined) {
    cachedSystemPath = probeSystemFfmpeg();
    cachedFfmpegMode = cachedSystemPath ? "system" : "wasm";
  }

  if (cachedFfmpegMode === "system") {
    yield* runSystemFfmpeg(args);
    return;
  }

  yield* Effect.logDebug("System ffmpeg not found, using wasm fallback");
  yield* runWasmFfmpeg(args, inputFiles, outputFile);
});

// HACK: not currently called in the close handler because mpdecimate is too
// aggressive for pages with CSS animations (glow, spinner). Kept for future
// use when we find better idle-detection thresholds.
export const stripIdleFrames = Effect.fn("stripIdleFrames")(function* (
  inputPath: string,
  outputPath: string,
) {
  yield* Effect.annotateCurrentSpan({ inputPath, outputPath });

  if (!fs.existsSync(inputPath)) {
    return yield* new VideoProcessError({ cause: `Input file not found: ${inputPath}` });
  }

  yield* Effect.logInfo("Stripping idle frames from video", { inputPath });

  yield* runFfmpeg(
    [
      "-i",
      inputPath,
      "-vf",
      `mpdecimate=hi=${MPDECIMATE_HI}:lo=${MPDECIMATE_LO}:frac=${MPDECIMATE_FRAC},setpts=N/FRAME_RATE/TB`,
      "-an",
      "-y",
      outputPath,
    ],
    [inputPath],
    outputPath,
  );

  yield* Effect.logInfo("Idle frames stripped", { outputPath });
});

export const frameWithWallpaper = Effect.fn("frameWithWallpaper")(function* (
  inputPath: string,
  outputPath: string,
  wallpaperPath: string | undefined,
) {
  yield* Effect.annotateCurrentSpan({ inputPath, outputPath });

  if (!fs.existsSync(inputPath)) {
    return yield* new VideoProcessError({ cause: `Input file not found: ${inputPath}` });
  }

  if (!wallpaperPath || !fs.existsSync(wallpaperPath)) {
    yield* Effect.logDebug("Wallpaper not found, copying video without framing");
    yield* Effect.try({
      try: () => fs.copyFileSync(inputPath, outputPath),
      catch: (error) => new VideoProcessError({ cause: error }),
    });
    return;
  }

  yield* Effect.logInfo("Framing video with wallpaper", { inputPath });

  yield* runFfmpeg(
    [
      "-i",
      inputPath,
      "-loop",
      "1",
      "-i",
      wallpaperPath,
      "-filter_complex",
      `[1:v][0:v]scale2ref=iw+${FRAME_PADDING_PX * 2}:ih+${FRAME_PADDING_PX * 2}[bg][ref];[bg][ref]overlay=(W-w)/2:(H-h)/2:shortest=1[out]`,
      "-map",
      "[out]",
      "-an",
      "-y",
      outputPath,
    ],
    [inputPath, wallpaperPath],
    outputPath,
  );

  yield* Effect.logInfo("Video framed with wallpaper", { outputPath });
});

export const concatVideos = Effect.fn("concatVideos")(function* (
  inputPaths: readonly string[],
  outputPath: string,
) {
  yield* Effect.annotateCurrentSpan({ inputCount: inputPaths.length, outputPath });

  const validPaths = inputPaths.filter((filePath) => fs.existsSync(filePath));
  if (validPaths.length === 0) {
    return yield* new VideoProcessError({ cause: "No valid input videos to concatenate" });
  }

  if (validPaths.length === 1) {
    yield* Effect.try({
      try: () => fs.copyFileSync(validPaths[0], outputPath),
      catch: (error) => new VideoProcessError({ cause: error }),
    });
    return;
  }

  yield* Effect.logInfo("Concatenating video segments", { count: validPaths.length });

  const concatListPath = `${outputPath}.concat.txt`;
  const concatList = validPaths
    .map((filePath) => `file '${filePath.replaceAll("'", "'\\''")}'`)
    .join("\n");
  yield* Effect.try({
    try: () => fs.writeFileSync(concatListPath, concatList),
    catch: (error) => new VideoProcessError({ cause: error }),
  });

  yield* Effect.ensuring(
    runFfmpeg(
      ["-f", "concat", "-safe", "0", "-i", concatListPath, "-c", "copy", "-an", "-y", outputPath],
      validPaths,
      outputPath,
    ),
    Effect.try({
      try: () => fs.unlinkSync(concatListPath),
      catch: (error) => new VideoProcessError({ cause: error }),
    }).pipe(
      Effect.catchTag("VideoProcessError", (error) =>
        Effect.logDebug("Failed to clean up concat list file", { error: error.message }),
      ),
    ),
  );

  yield* Effect.logInfo("Videos concatenated", { outputPath });
});
