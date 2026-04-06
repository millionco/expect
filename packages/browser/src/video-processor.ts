import { execFile, execFileSync } from "node:child_process";
import { copyFileSync, existsSync, writeFileSync } from "node:fs";
import { Effect, Schema } from "effect";

// HACK: resolve the wallpaper path using import.meta.url (works in ESM bundles)
// with a fallback chain for different directory layouts. If none found, the framing
// step gracefully skips since existsSync("") returns false.
export const DEFAULT_WALLPAPER_PATH = (() => {
  try {
    const { join, dirname } = require("node:path") as typeof import("node:path");
    const { existsSync: exists } = require("node:fs") as typeof import("node:fs");
    const { fileURLToPath } = require("node:url") as typeof import("node:url");
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const candidates = [
      join(currentDir, "..", "assets", "wallpaper.webp"),
      join(currentDir, "assets", "wallpaper.webp"),
      join(dirname(process.argv[1] ?? ""), "assets", "wallpaper.webp"),
    ];
    return candidates.find(exists) ?? "";
  } catch {
    return "";
  }
})();

const FFMPEG_TIMEOUT_MS = 120_000;
const MPDECIMATE_HI = "64*1000";
const MPDECIMATE_LO = "64*500";
const MPDECIMATE_FRAC = "0.1";
const FRAME_PADDING_PX = 48;

export class VideoProcessError extends Schema.ErrorClass<VideoProcessError>("VideoProcessError")({
  _tag: Schema.tag("VideoProcessError"),
  cause: Schema.String,
}) {
  message = `Video processing failed: ${this.cause}`;
}

// HACK: require() instead of import because @ffmpeg-installer/ffmpeg uses
// CJS-only exports with a dynamic platform-specific binary path that can't
// be statically resolved by ESM import at build time.
const resolveFfmpegPath = (): string | undefined => {
  try {
    const binaryPath = (require("@ffmpeg-installer/ffmpeg") as { path: string }).path;
    execFileSync(binaryPath, ["-version"], { timeout: 5_000, stdio: "ignore" });
    return binaryPath;
  } catch {
    return undefined;
  }
};

export const runFfmpeg = Effect.fn("runFfmpeg")(function* (ffmpegBinary: string, args: string[]) {
  yield* Effect.callback<void, VideoProcessError>((resume) => {
    execFile(ffmpegBinary, args, { timeout: FFMPEG_TIMEOUT_MS }, (error, _stdout, stderr) => {
      if (error) {
        return resume(
          Effect.fail(
            new VideoProcessError({
              cause: stderr || error.message,
            }),
          ),
        );
      }
      resume(Effect.void);
    });
  });
});

export const stripIdleFrames = Effect.fn("stripIdleFrames")(function* (
  inputPath: string,
  outputPath: string,
) {
  yield* Effect.annotateCurrentSpan({ inputPath, outputPath });

  if (!existsSync(inputPath)) {
    return yield* new VideoProcessError({ cause: `Input file not found: ${inputPath}` });
  }

  const ffmpegBinary = resolveFfmpegPath();
  if (!ffmpegBinary) {
    yield* Effect.logDebug("ffmpeg not available, copying video without processing");
    yield* Effect.sync(() => copyFileSync(inputPath, outputPath));
    return;
  }

  yield* Effect.logInfo("Stripping idle frames from video", { inputPath });

  yield* runFfmpeg(ffmpegBinary, [
    "-i",
    inputPath,
    "-vf",
    `mpdecimate=hi=${MPDECIMATE_HI}:lo=${MPDECIMATE_LO}:frac=${MPDECIMATE_FRAC},setpts=N/FRAME_RATE/TB`,
    "-an",
    "-y",
    outputPath,
  ]);

  yield* Effect.logInfo("Idle frames stripped", { outputPath });
});

export const frameWithWallpaper = Effect.fn("frameWithWallpaper")(function* (
  inputPath: string,
  outputPath: string,
  wallpaperPath: string,
) {
  yield* Effect.annotateCurrentSpan({ inputPath, outputPath });

  if (!existsSync(inputPath)) {
    return yield* new VideoProcessError({ cause: `Input file not found: ${inputPath}` });
  }

  if (!existsSync(wallpaperPath)) {
    yield* Effect.logDebug("Wallpaper not found, copying video without framing");
    yield* Effect.sync(() => copyFileSync(inputPath, outputPath));
    return;
  }

  const ffmpegBinary = resolveFfmpegPath();
  if (!ffmpegBinary) {
    yield* Effect.logDebug("ffmpeg not available, copying video without framing");
    yield* Effect.sync(() => copyFileSync(inputPath, outputPath));
    return;
  }

  yield* Effect.logInfo("Framing video with wallpaper", { inputPath });

  const pad = FRAME_PADDING_PX;

  yield* runFfmpeg(ffmpegBinary, [
    "-i",
    inputPath,
    "-loop",
    "1",
    "-i",
    wallpaperPath,
    "-filter_complex",
    `[1:v][0:v]scale2ref=iw+${pad * 2}:ih+${pad * 2}[bg][ref];[bg][ref]overlay=(W-w)/2:(H-h)/2:shortest=1[out]`,
    "-map",
    "[out]",
    "-an",
    "-y",
    outputPath,
  ]);

  yield* Effect.logInfo("Video framed with wallpaper", { outputPath });
});

export const concatVideos = Effect.fn("concatVideos")(function* (
  inputPaths: readonly string[],
  outputPath: string,
) {
  yield* Effect.annotateCurrentSpan({ inputCount: inputPaths.length, outputPath });

  const validPaths = inputPaths.filter((filePath) => existsSync(filePath));
  if (validPaths.length === 0) {
    return yield* new VideoProcessError({ cause: "No valid input videos to concatenate" });
  }

  if (validPaths.length === 1) {
    yield* Effect.sync(() => copyFileSync(validPaths[0], outputPath));
    return;
  }

  const ffmpegBinary = resolveFfmpegPath();
  if (!ffmpegBinary) {
    yield* Effect.logDebug("ffmpeg not available, using last video segment");
    yield* Effect.sync(() => copyFileSync(validPaths[validPaths.length - 1], outputPath));
    return;
  }

  yield* Effect.logInfo("Concatenating video segments", { count: validPaths.length });

  const concatListPath = `${outputPath}.concat.txt`;
  const concatList = validPaths.map((filePath) => `file '${filePath}'`).join("\n");
  yield* Effect.sync(() => writeFileSync(concatListPath, concatList));

  yield* runFfmpeg(ffmpegBinary, [
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    concatListPath,
    "-c",
    "copy",
    "-an",
    "-y",
    outputPath,
  ]);

  yield* Effect.sync(() => {
    try {
      require("node:fs").unlinkSync(concatListPath);
    } catch {}
  });

  yield* Effect.logInfo("Videos concatenated", { outputPath });
});
