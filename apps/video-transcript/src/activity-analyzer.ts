import { execFile } from "node:child_process";
import { readFileSync, mkdtempSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  FRAME_DIFF_IDLE_THRESHOLD,
  FRAMES_PER_SECOND,
  IDLE_CUT_THRESHOLD_SECONDS,
  MIN_ACTIVE_SEGMENT_SECONDS,
  SCENE_CHANGE_THRESHOLD,
} from "./constants";
import type { ActivitySegment, ActivityTimeline } from "./types";

const execFileAsync = (
  command: string,
  args: readonly string[],
): Promise<{ stdout: string; stderr: string }> =>
  new Promise((resolve, reject) => {
    execFile(command, args, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) reject(error);
      else resolve({ stdout, stderr });
    });
  });

export const checkFfmpegAvailable = async (): Promise<boolean> => {
  try {
    await execFileAsync("ffmpeg", ["-version"]);
    return true;
  } catch {
    return false;
  }
};

const extractFrames = async (videoPath: string, outputDir: string): Promise<number> => {
  await execFileAsync("ffmpeg", [
    "-i",
    videoPath,
    "-vf",
    `fps=${FRAMES_PER_SECOND}`,
    "-vsync",
    "vfr",
    "-f",
    "rawvideo",
    "-pix_fmt",
    "gray",
    "-s",
    "320x180",
    path.join(outputDir, "frame_%05d.raw"),
  ]);

  const files = readdirSync(outputDir).filter((file) => file.startsWith("frame_"));
  return files.length;
};

const computeFrameDiff = (frameA: Buffer, frameB: Buffer): number => {
  const length = Math.min(frameA.length, frameB.length);
  if (length === 0) return 0;

  let totalDiff = 0;
  for (let index = 0; index < length; index++) {
    totalDiff += Math.abs(frameA[index]! - frameB[index]!) / 255;
  }

  return totalDiff / length;
};

const classifySegments = (diffs: readonly number[]): ActivityTimeline => {
  const rawClassification: Array<"active" | "idle" | "scene_change"> = [];

  for (const diff of diffs) {
    if (diff >= SCENE_CHANGE_THRESHOLD) {
      rawClassification.push("scene_change");
    } else if (diff > FRAME_DIFF_IDLE_THRESHOLD) {
      rawClassification.push("active");
    } else {
      rawClassification.push("idle");
    }
  }

  const segments: ActivitySegment[] = [];
  let currentType = rawClassification[0];
  let segmentStart = 0;

  if (!currentType) return [];

  for (let index = 1; index <= rawClassification.length; index++) {
    const nextType = rawClassification[index];
    if (nextType !== currentType || index === rawClassification.length) {
      segments.push({
        type: currentType,
        startSeconds: segmentStart,
        endSeconds: index,
      });
      if (nextType) {
        currentType = nextType;
        segmentStart = index;
      }
    }
  }

  return mergeShortSegments(segments);
};

const mergeShortSegments = (segments: readonly ActivitySegment[]): ActivityTimeline => {
  const merged: ActivitySegment[] = [];

  for (const segment of segments) {
    const duration = segment.endSeconds - segment.startSeconds;

    if (segment.type === "active" && duration < MIN_ACTIVE_SEGMENT_SECONDS) {
      const previous = merged[merged.length - 1];
      if (previous && previous.type === "idle") {
        merged[merged.length - 1] = { ...previous, endSeconds: segment.endSeconds };
      } else {
        merged.push(segment);
      }
      continue;
    }

    if (segment.type === "idle" && duration <= IDLE_CUT_THRESHOLD_SECONDS) {
      const previous = merged[merged.length - 1];
      if (previous && previous.type === "active") {
        merged[merged.length - 1] = { ...previous, endSeconds: segment.endSeconds };
        continue;
      }
    }

    merged.push(segment);
  }

  return merged;
};

export const analyzeActivity = async (videoPath: string): Promise<ActivityTimeline> => {
  const framesDir = mkdtempSync(path.join(tmpdir(), "expect-frames-"));

  try {
    const frameCount = await extractFrames(videoPath, framesDir);
    if (frameCount < 2) return [{ type: "active", startSeconds: 0, endSeconds: frameCount }];

    const frameSize = 320 * 180;
    const diffs: number[] = [];

    for (let index = 1; index < frameCount; index++) {
      const prevPath = path.join(framesDir, `frame_${String(index).padStart(5, "0")}.raw`);
      const currPath = path.join(framesDir, `frame_${String(index + 1).padStart(5, "0")}.raw`);

      const prevFrame = readFileSync(prevPath);
      const currFrame = readFileSync(currPath);
      diffs.push(computeFrameDiff(prevFrame, currFrame));
    }

    return classifySegments(diffs);
  } finally {
    rmSync(framesDir, { recursive: true, force: true });
  }
};

export const buildTrimmedVideo = async (
  videoPath: string,
  timeline: ActivityTimeline,
): Promise<string> => {
  const activeSegments = timeline.filter(
    (segment) => segment.type === "active" || segment.type === "scene_change",
  );

  if (activeSegments.length === 0) return videoPath;

  const outputDir = mkdtempSync(path.join(tmpdir(), "expect-trimmed-"));
  const outputPath = path.join(outputDir, "trimmed.mp4");

  const filterParts = activeSegments.map(
    (segment) => `between(t,${segment.startSeconds},${segment.endSeconds})`,
  );
  const selectFilter = filterParts.join("+");

  await execFileAsync("ffmpeg", [
    "-i",
    videoPath,
    "-vf",
    `select='${selectFilter}',setpts=N/FRAME_RATE/TB`,
    "-af",
    `aselect='${selectFilter}',asetpts=N/SR/TB`,
    "-y",
    outputPath,
  ]);

  return outputPath;
};

export const formatTimeline = (timeline: ActivityTimeline): string => {
  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  const lines = timeline.map((segment) => {
    const label =
      segment.type === "scene_change"
        ? "scene change (likely navigation)"
        : segment.type === "idle"
          ? "idle"
          : "active";
    return `- [${formatTime(segment.startSeconds)}–${formatTime(segment.endSeconds)}] ${label}`;
  });

  return lines.join("\n");
};
