import { readFileSync } from "node:fs";
import path from "node:path";
import { google } from "@ai-sdk/google";
import { generateText } from "ai";
import { SUPPORTED_MIME_TYPES } from "./constants";
import { buildTranscriptPrompt } from "./transcript-prompt";
import type { ActivityTimeline } from "./types";

const getMimeType = (videoPath: string): string => {
  const extension = path.extname(videoPath).toLowerCase();
  return SUPPORTED_MIME_TYPES[extension] ?? "video/mp4";
};

export const extractTranscript = async (
  videoPath: string,
  timeline: ActivityTimeline | undefined,
): Promise<string> => {
  const mimeType = getMimeType(videoPath);
  const videoData = readFileSync(videoPath);
  const prompt = buildTranscriptPrompt(timeline);

  const { text } = await generateText({
    model: google("gemini-2.5-flash"),
    messages: [
      {
        role: "user",
        content: [
          { type: "file", data: videoData, mediaType: mimeType },
          { type: "text", text: prompt },
        ],
      },
    ],
  });

  return text;
};
