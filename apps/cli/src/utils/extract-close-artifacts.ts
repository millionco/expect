import type { ExecutionEvent } from "@expect/shared/models";
import { pathToFileURL } from "node:url";

const REPLAY_SESSION_PREFIX = "rrweb replay:";
const REPLAY_REPORT_PREFIX = "rrweb report:";
const PLAYWRIGHT_VIDEO_PREFIX = "Playwright video:";
const SCREENSHOT_PREFIX = "Screenshot:";

export interface CloseArtifacts {
  readonly localReplayUrl: string | undefined;
  readonly videoUrl: string | undefined;
  readonly replayPath: string | undefined;
  readonly videoPath: string | undefined;
  readonly replaySessionPath: string | undefined;
  readonly screenshotPaths: readonly string[];
}

export const extractCloseArtifacts = (events: readonly ExecutionEvent[]): CloseArtifacts => {
  const closeResult = events
    .slice()
    .reverse()
    .find(
      (event) =>
        event._tag === "ToolResult" &&
        event.toolName === "close" &&
        !event.isError &&
        event.result.length > 0,
    );
  if (!closeResult || closeResult._tag !== "ToolResult") {
    return {
      localReplayUrl: undefined,
      videoUrl: undefined,
      replayPath: undefined,
      videoPath: undefined,
      replaySessionPath: undefined,
      screenshotPaths: [],
    };
  }

  const lines = closeResult.result
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const extractValue = (prefix: string) => {
    const raw = lines
      .find((line) => line.startsWith(prefix))
      ?.replace(prefix, "")
      .trim();
    return raw && raw.length > 0 ? raw : undefined;
  };

  const replaySessionPath = extractValue(REPLAY_SESSION_PREFIX);
  const replayPath = extractValue(REPLAY_REPORT_PREFIX);
  const videoPath = extractValue(PLAYWRIGHT_VIDEO_PREFIX);
  const screenshotPaths = lines
    .filter((line) => line.startsWith(SCREENSHOT_PREFIX))
    .map((line) => line.replace(SCREENSHOT_PREFIX, "").trim())
    .filter((value) => value.length > 0);

  return {
    localReplayUrl: replayPath ? pathToFileURL(replayPath).href : undefined,
    videoUrl: videoPath ? pathToFileURL(videoPath).href : undefined,
    replayPath,
    videoPath,
    replaySessionPath,
    screenshotPaths,
  };
};
