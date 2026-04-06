import { execFile, execFileSync } from "node:child_process";
import { copyFileSync, existsSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Effect, Schema } from "effect";

// HACK: resolve the wallpaper path using import.meta.url (works in ESM bundles)
// with a fallback chain for different directory layouts. If none found, the framing
// step gracefully skips since existsSync("") returns false.
export const DEFAULT_WALLPAPER_PATH = (() => {
  try {
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const candidates = [
      join(currentDir, "..", "assets", "wallpaper.webp"),
      join(currentDir, "assets", "wallpaper.webp"),
      join(dirname(process.argv[1] ?? ""), "assets", "wallpaper.webp"),
    ];
    return candidates.find(existsSync) ?? "";
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
let cachedFfmpegPath: string | undefined;
let ffmpegProbed = false;
const resolveFfmpegPath = (): string | undefined => {
  if (ffmpegProbed) return cachedFfmpegPath;
  ffmpegProbed = true;
  try {
    const binaryPath = (require("@ffmpeg-installer/ffmpeg") as { path: string }).path;
    execFileSync(binaryPath, ["-version"], { timeout: 5_000, stdio: "ignore" });
    cachedFfmpegPath = binaryPath;
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

// HACK: not currently called in the close handler because mpdecimate is too
// aggressive for pages with CSS animations (glow, spinner). Kept for future
// use when we find better idle-detection thresholds.
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
    yield* Effect.try({ try: () => copyFileSync(inputPath, outputPath), catch: () => undefined });
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
    yield* Effect.try({ try: () => copyFileSync(inputPath, outputPath), catch: () => undefined });
    return;
  }

  const ffmpegBinary = resolveFfmpegPath();
  if (!ffmpegBinary) {
    yield* Effect.logDebug("ffmpeg not available, copying video without framing");
    yield* Effect.try({ try: () => copyFileSync(inputPath, outputPath), catch: () => undefined });
    return;
  }

  yield* Effect.logInfo("Framing video with wallpaper", { inputPath });

  yield* runFfmpeg(ffmpegBinary, [
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
    yield* Effect.try({
      try: () => copyFileSync(validPaths[0], outputPath),
      catch: () => undefined,
    });
    return;
  }

  const ffmpegBinary = resolveFfmpegPath();
  if (!ffmpegBinary) {
    yield* Effect.logDebug("ffmpeg not available, using last video segment");
    yield* Effect.try({
      try: () => copyFileSync(validPaths[validPaths.length - 1], outputPath),
      catch: () => undefined,
    });
    return;
  }

  yield* Effect.logInfo("Concatenating video segments", { count: validPaths.length });

  const concatListPath = `${outputPath}.concat.txt`;
  const concatList = validPaths
    .map((filePath) => `file '${filePath.replaceAll("'", "'\\''")}'`)
    .join("\n");
  yield* Effect.try({
    try: () => writeFileSync(concatListPath, concatList),
    catch: () => undefined,
  });

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

  yield* Effect.try({
    try: () => unlinkSync(concatListPath),
    catch: () => undefined,
  });

  yield* Effect.logInfo("Videos concatenated", { outputPath });
});
