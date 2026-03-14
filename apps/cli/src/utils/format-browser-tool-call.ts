import type { BrowserRunEvent } from "@browser-tester/orchestrator";
import { TESTING_SELECT_TRUNCATION_LIMIT } from "../constants.js";
import { truncateText } from "./truncate-text.js";

const BROWSER_TOOL_PREFIX = "mcp__browser__";

const parseToolInput = (input: string): Record<string, unknown> | null => {
  try {
    const parsedValue = JSON.parse(input);
    if (!parsedValue || typeof parsedValue !== "object" || Array.isArray(parsedValue)) return null;
    return parsedValue;
  } catch {
    return null;
  }
};

const readString = (input: Record<string, unknown> | null, key: string): string | null => {
  const value = input?.[key];
  return typeof value === "string" && value.length > 0 ? value : null;
};

const readNumber = (input: Record<string, unknown> | null, key: string): number | null => {
  const value = input?.[key];
  return typeof value === "number" ? value : null;
};

const readPathOrUrl = (input: Record<string, unknown> | null, key: string): string | null => {
  const value = readString(input, key);
  if (!value) return null;

  try {
    const parsedUrl = new URL(value);
    return `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}` || parsedUrl.origin;
  } catch {
    return value;
  }
};

export const formatBrowserToolCall = (toolName: string, input: string): string | null => {
  if (!toolName.startsWith(BROWSER_TOOL_PREFIX)) return null;

  const action = toolName.slice(BROWSER_TOOL_PREFIX.length);
  const parsedInput = parseToolInput(input);

  switch (action) {
    case "open":
      return `Open ${readPathOrUrl(parsedInput, "url") ?? "page"}`;
    case "list_pages":
      return "List open tabs";
    case "select_page":
      return `Select tab ${readNumber(parsedInput, "pageId") ?? ""}`.trim();
    case "new_page":
      return `Open ${readPathOrUrl(parsedInput, "url") ?? "new tab"}`;
    case "navigate_page":
      return `Navigate ${readPathOrUrl(parsedInput, "url") ?? readString(parsedInput, "type") ?? "page"}`;
    case "snapshot":
    case "take_snapshot":
      return "Capture page snapshot";
    case "click":
      return `Click ${readString(parsedInput, "ref") ?? "element"}`;
    case "fill":
      return `Fill ${readString(parsedInput, "ref") ?? "input"}`;
    case "type":
      return `Type into ${readString(parsedInput, "ref") ?? "input"}`;
    case "type_text":
      return "Type text";
    case "select":
      return `Select ${truncateText(readString(parsedInput, "value") ?? "option", TESTING_SELECT_TRUNCATION_LIMIT)}`;
    case "hover":
      return `Hover ${readString(parsedInput, "ref") ?? "element"}`;
    case "wait": {
      const selector = readString(parsedInput, "selector");
      const url = readPathOrUrl(parsedInput, "url");
      const timeout = readNumber(parsedInput, "timeout");
      const loadState = readString(parsedInput, "loadState");
      if (selector) return `Wait for ${selector}`;
      if (url) return `Wait for ${url}`;
      if (loadState) return `Wait for ${loadState}`;
      if (timeout !== null) return `Wait ${timeout}ms`;
      return "Wait";
    }
    case "read_console_messages":
    case "list_console_messages":
      return "Inspect console";
    case "read_network_requests":
    case "list_network_requests":
      return "Inspect network";
    case "get_page_text":
      return "Read page text";
    case "javascript":
    case "evaluate_script":
      return "Run browser script";
    case "navigate":
      return `Navigate ${readString(parsedInput, "action") ?? ""}`.trim();
    case "scroll":
      return `Scroll ${readString(parsedInput, "direction") ?? "page"}`;
    case "press_key":
      return `Press ${readString(parsedInput, "key") ?? "key"}`;
    case "screenshot":
    case "take_screenshot":
      return "Take screenshot";
    case "annotated_screenshot":
      return "Take annotated screenshot";
    case "save_video":
      return "Save browser video";
    case "close":
      return "Close browser";
    case "close_page":
      return `Close tab ${readNumber(parsedInput, "pageId") ?? ""}`.trim();
    default:
      return truncateText(action.replaceAll("_", " "), TESTING_SELECT_TRUNCATION_LIMIT);
  }
};

export const shouldShowToolResult = (
  event: Extract<BrowserRunEvent, { type: "tool-result" }>,
): boolean =>
  event.isError ||
  event.toolName === `${BROWSER_TOOL_PREFIX}save_video` ||
  event.toolName === `${BROWSER_TOOL_PREFIX}close`;
