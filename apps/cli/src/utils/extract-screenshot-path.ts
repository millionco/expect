import type { UpdateContent } from "@browser-tester/supervisor";

const BROWSER_TOOL_PREFIX = "mcp__browser__";

const SCREENSHOT_TOOL_NAMES = new Set([
  `${BROWSER_TOOL_PREFIX}screenshot`,
  `${BROWSER_TOOL_PREFIX}take_screenshot`,
  `${BROWSER_TOOL_PREFIX}annotated_screenshot`,
]);

const SAVED_TO_PATTERN = /saved to (.+)$/;

export const extractScreenshotPath = (
  event: Extract<UpdateContent, { _tag: "ToolResult" }>,
): string | null => {
  if (event.isError) return null;
  if (!SCREENSHOT_TOOL_NAMES.has(event.toolName)) return null;

  const match = SAVED_TO_PATTERN.exec(event.result);
  return match?.[1] ?? null;
};
