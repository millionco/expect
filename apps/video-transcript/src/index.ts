#!/usr/bin/env node
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Command } from "commander";
import pc from "picocolors";
import { SUPPORTED_VIDEO_EXTENSIONS } from "./constants";
import {
  analyzeActivity,
  buildTrimmedVideo,
  checkFfmpegAvailable,
  formatTimeline,
} from "./activity-analyzer";
import { extractTranscript } from "./extract-transcript";

const program = new Command()
  .name("video-transcript")
  .description("Extract structured interaction transcripts from screen recordings")
  .version("0.0.1")
  .argument("<video>", "path to the screen recording file")
  .option("-o, --output <path>", "write transcript to a file instead of stdout")
  .option("--no-preprocess", "skip ffmpeg idle-time cutting (upload raw video)")
  .option("--timeline-only", "only output the activity timeline, skip transcript extraction")
  .option("--verbose", "show detailed progress information");

program.action(
  async (
    videoArg: string,
    options: {
      output?: string;
      preprocess: boolean;
      timelineOnly: boolean;
      verbose: boolean;
    },
  ) => {
    const videoPath = path.resolve(videoArg);

    if (!existsSync(videoPath)) {
      console.error(pc.red(`Error: Video file not found: ${videoPath}`));
      process.exit(1);
    }

    const extension = path.extname(videoPath).toLowerCase();
    if (
      !SUPPORTED_VIDEO_EXTENSIONS.includes(extension as (typeof SUPPORTED_VIDEO_EXTENSIONS)[number])
    ) {
      console.error(
        pc.red(
          `Error: Unsupported video format "${extension}". Supported: ${SUPPORTED_VIDEO_EXTENSIONS.join(", ")}`,
        ),
      );
      process.exit(1);
    }

    if (!options.timelineOnly && !process.env["AI_GATEWAY_API_KEY"]) {
      console.error(
        pc.red(
          "Error: AI_GATEWAY_API_KEY environment variable is required for transcript extraction.",
        ),
      );
      process.exit(1);
    }

    let processedVideoPath = videoPath;
    let timeline: Awaited<ReturnType<typeof analyzeActivity>> | undefined;

    if (options.preprocess) {
      const hasFfmpeg = await checkFfmpegAvailable();

      if (hasFfmpeg) {
        if (options.verbose) console.error(pc.dim("Analyzing video for idle segments..."));

        timeline = await analyzeActivity(videoPath);

        if (options.verbose) {
          console.error(pc.dim("Activity timeline:"));
          console.error(pc.dim(formatTimeline(timeline)));
        }

        const activeCount = timeline.filter(
          (segment) => segment.type === "active" || segment.type === "scene_change",
        ).length;
        const idleCount = timeline.filter((segment) => segment.type === "idle").length;

        console.error(
          pc.cyan(
            `Found ${activeCount} active segment${activeCount !== 1 ? "s" : ""}, ${idleCount} idle segment${idleCount !== 1 ? "s" : ""}`,
          ),
        );

        if (options.timelineOnly) {
          const output = formatTimeline(timeline);
          if (options.output) {
            writeFileSync(options.output, output);
            console.error(pc.green(`Timeline written to ${options.output}`));
          } else {
            console.log(output);
          }
          return;
        }

        if (idleCount > 0) {
          if (options.verbose) console.error(pc.dim("Building trimmed video..."));
          processedVideoPath = await buildTrimmedVideo(videoPath, timeline);
          console.error(pc.cyan("Trimmed idle segments from video"));
        }
      } else {
        console.error(
          pc.yellow(
            "Warning: ffmpeg not found. Uploading raw video without idle-time cutting. Install ffmpeg for optimized processing.",
          ),
        );
      }
    }

    console.error(pc.cyan("Extracting transcript via Vercel AI Gateway (Gemini 2.5 Flash)..."));

    const transcript = await extractTranscript(processedVideoPath, timeline);

    if (options.output) {
      writeFileSync(options.output, transcript);
      console.error(pc.green(`Transcript written to ${options.output}`));
    } else {
      console.log(transcript);
    }
  },
);

program.parse();
