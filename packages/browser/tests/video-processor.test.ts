import { mkdtempSync, rmSync, existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { Effect } from "effect";
import { afterEach, describe, expect, it } from "vite-plus/test";
import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  stripIdleFrames,
  frameWithWallpaper,
  runFfmpeg,
  VideoProcessError,
  resolveWallpaperPath,
} from "../src/video-processor";

const FIXTURE_PATH = join(__dirname, "fixtures", "mixed-content.webm");

const ffmpegPath: string = (() => {
  try {
    return require("@ffmpeg-installer/ffmpeg").path;
  } catch {
    return "ffmpeg";
  }
})();

const ffmpegAvailable = (() => {
  try {
    execFileSync(ffmpegPath, ["-version"], { timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
})();

const fixtureAvailable = existsSync(FIXTURE_PATH);

describe("video-processor", () => {
  let tempDir: string | undefined;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  describe("stripIdleFrames", () => {
    it("fails with VideoProcessError when input file does not exist", async () => {
      const error = await Effect.runPromise(
        stripIdleFrames("/nonexistent/video.webm", "/tmp/out.webm").pipe(Effect.flip),
      );
      expect(error._tag).toBe("VideoProcessError");
      expect(error.message).toContain("Input file not found");
    });

    it.skipIf(!ffmpegAvailable || !fixtureAvailable)(
      "processes the mixed-content fixture and produces a smaller output",
      async () => {
        tempDir = mkdtempSync(join(tmpdir(), "video-processor-test-"));
        const outputPath = join(tempDir, "output.webm");
        const inputSize = statSync(FIXTURE_PATH).size;

        await Effect.runPromise(stripIdleFrames(FIXTURE_PATH, outputPath));

        expect(existsSync(outputPath)).toBe(true);
        const outputSize = statSync(outputPath).size;
        expect(outputSize).toBeGreaterThan(0);
        expect(outputSize).toBeLessThan(inputSize);
      },
      30_000,
    );

    it.skipIf(!ffmpegAvailable || !fixtureAvailable)(
      "output file is a valid webm",
      async () => {
        tempDir = mkdtempSync(join(tmpdir(), "video-processor-test-"));
        const outputPath = join(tempDir, "output.webm");

        await Effect.runPromise(stripIdleFrames(FIXTURE_PATH, outputPath));

        const probeResult = execFileSync(ffmpegPath, ["-i", outputPath, "-f", "null", "-"], {
          timeout: 10_000,
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "pipe"],
        });
        expect(probeResult).toBeDefined();
      },
      30_000,
    );

    it.skipIf(!ffmpegAvailable)(
      "overwrites existing output file",
      async () => {
        tempDir = mkdtempSync(join(tmpdir(), "video-processor-test-"));
        const inputPath = join(tempDir, "input.webm");
        const outputPath = join(tempDir, "output.webm");

        execFileSync(
          ffmpegPath,
          ["-f", "lavfi", "-i", "color=c=red:s=64x64:d=1:r=5", "-c:v", "libvpx", "-y", inputPath],
          { timeout: 10_000 },
        );
        execFileSync(
          ffmpegPath,
          ["-f", "lavfi", "-i", "color=c=red:s=64x64:d=1:r=5", "-c:v", "libvpx", "-y", outputPath],
          { timeout: 10_000 },
        );

        expect(existsSync(outputPath)).toBe(true);
        await Effect.runPromise(stripIdleFrames(inputPath, outputPath));
        expect(existsSync(outputPath)).toBe(true);
      },
      30_000,
    );
  });

  describe("frameWithWallpaper", () => {
    const wallpaperPath = Effect.runSync(
      resolveWallpaperPath().pipe(Effect.provide(NodeServices.layer)),
    );
    const wallpaperAvailable = wallpaperPath !== undefined && existsSync(wallpaperPath);

    it("fails with VideoProcessError when input file does not exist", async () => {
      const error = await Effect.runPromise(
        frameWithWallpaper("/nonexistent/video.webm", "/tmp/out.webm", wallpaperPath).pipe(
          Effect.flip,
        ),
      );
      expect(error._tag).toBe("VideoProcessError");
      expect(error.message).toContain("Input file not found");
    });

    it.skipIf(!ffmpegAvailable || !fixtureAvailable || !wallpaperAvailable)(
      "frames the fixture video with the wallpaper",
      async () => {
        tempDir = mkdtempSync(join(tmpdir(), "video-processor-test-"));
        const outputPath = join(tempDir, "framed.webm");

        await Effect.runPromise(frameWithWallpaper(FIXTURE_PATH, outputPath, wallpaperPath));

        expect(existsSync(outputPath)).toBe(true);
        const outputSize = statSync(outputPath).size;
        expect(outputSize).toBeGreaterThan(0);
      },
      30_000,
    );

    it.skipIf(!ffmpegAvailable || !fixtureAvailable)(
      "copies video when wallpaper does not exist",
      async () => {
        tempDir = mkdtempSync(join(tmpdir(), "video-processor-test-"));
        const outputPath = join(tempDir, "output.webm");

        await Effect.runPromise(
          frameWithWallpaper(FIXTURE_PATH, outputPath, "/nonexistent/wallpaper.webp"),
        );

        expect(existsSync(outputPath)).toBe(true);
        expect(statSync(outputPath).size).toBe(statSync(FIXTURE_PATH).size);
      },
      30_000,
    );
  });

  describe("runFfmpeg", () => {
    it.skipIf(!ffmpegAvailable)("succeeds with valid args", async () => {
      await Effect.runPromise(runFfmpeg(ffmpegPath, ["-version"]));
    });

    it("fails with VideoProcessError for invalid binary", async () => {
      const error = await Effect.runPromise(
        runFfmpeg("/nonexistent/ffmpeg", ["-version"]).pipe(Effect.flip),
      );
      expect(error._tag).toBe("VideoProcessError");
    });

    it.skipIf(!ffmpegAvailable)("fails with VideoProcessError for invalid input file", async () => {
      const error = await Effect.runPromise(
        runFfmpeg(ffmpegPath, ["-i", "/nonexistent/file.webm", "-f", "null", "-"]).pipe(
          Effect.flip,
        ),
      );
      expect(error._tag).toBe("VideoProcessError");
    });
  });

  describe("VideoProcessError", () => {
    it("has correct tag and message", () => {
      const error = new VideoProcessError({ cause: "test failure" });
      expect(error._tag).toBe("VideoProcessError");
      expect(error.message).toContain("test failure");
      expect(error.message).toContain("Video processing failed");
    });
  });
});
