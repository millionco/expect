import { Schema } from "effect";
import { BROWSER_TOOL_PREFIX, TOOL_INPUT_CHAR_LIMIT, SELECT_TRUNCATION_LIMIT } from "../constants";

interface BrowserToolCallFormatOptions {
  includeRelevantInputs?: boolean;
}

const JsonRecordSchema = Schema.Record(Schema.String, Schema.Unknown);

const parseToolInput = (input: string): Record<string, unknown> | null => {
  try {
    return Schema.decodeUnknownSync(JsonRecordSchema)(JSON.parse(input));
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

const readBoolean = (input: Record<string, unknown> | null, key: string): boolean | null => {
  const value = input?.[key];
  return typeof value === "boolean" ? value : null;
};

const readFirstString = (input: Record<string, unknown> | null, keys: string[]): string | null => {
  for (const key of keys) {
    const value = readString(input, key);
    if (value) return value;
  }

  return null;
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

const readFirstPathOrUrl = (
  input: Record<string, unknown> | null,
  keys: string[],
): string | null => {
  for (const key of keys) {
    const value = readPathOrUrl(input, key);
    if (value) return value;
  }

  return null;
};

const readElementTarget = (input: Record<string, unknown> | null): string | null =>
  readFirstString(input, ["ref", "selector", "element", "target"]);

const truncateToolText = (value: string, limit: number): string => {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (cleaned.length <= limit) return cleaned;
  return cleaned.slice(0, limit - 1) + "…";
};

const formatInlineText = (value: string | null): string | null => {
  if (!value) return null;
  return truncateToolText(value, TOOL_INPUT_CHAR_LIMIT);
};

const formatCompactBrowserToolCall = (
  action: string,
  parsedInput: Record<string, unknown> | null,
): string => {
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
      return `Click ${readElementTarget(parsedInput) ?? "element"}`;
    case "fill":
      return `Fill ${readElementTarget(parsedInput) ?? "input"}`;
    case "type":
      return `Type into ${readElementTarget(parsedInput) ?? "input"}`;
    case "type_text":
      return "Type text";
    case "select":
      return `Select ${truncateToolText(readString(parsedInput, "value") ?? "option", SELECT_TRUNCATION_LIMIT)}`;
    case "hover":
      return `Hover ${readElementTarget(parsedInput) ?? "element"}`;
    case "wait": {
      const selector = readElementTarget(parsedInput);
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
      return truncateToolText(action.replaceAll("_", " "), SELECT_TRUNCATION_LIMIT);
  }
};

const formatDetailedBrowserToolCall = (
  action: string,
  parsedInput: Record<string, unknown> | null,
): string => {
  switch (action) {
    case "fill": {
      const target = readElementTarget(parsedInput) ?? "input";
      const value = formatInlineText(readFirstString(parsedInput, ["text", "value"]));
      return value ? `Fill ${target} with "${value}"` : `Fill ${target}`;
    }
    case "type": {
      const target = readElementTarget(parsedInput) ?? "input";
      const value = formatInlineText(readFirstString(parsedInput, ["text", "value"]));
      return value ? `Type into ${target}: "${value}"` : `Type into ${target}`;
    }
    case "type_text": {
      const value = formatInlineText(readFirstString(parsedInput, ["text", "value"]));
      return value ? `Type text "${value}"` : "Type text";
    }
    case "select": {
      const target = readElementTarget(parsedInput);
      const value = formatInlineText(readString(parsedInput, "value"));
      if (target && value) return `Select ${target} -> ${value}`;
      if (value) return `Select ${value}`;
      return `Select ${target ?? "option"}`;
    }
    case "wait": {
      const target = readElementTarget(parsedInput);
      const url = readPathOrUrl(parsedInput, "url");
      const loadState = readString(parsedInput, "loadState");
      const timeout = readNumber(parsedInput, "timeout");
      if (target && timeout !== null) return `Wait for ${target} (${timeout}ms)`;
      if (url && timeout !== null) return `Wait for ${url} (${timeout}ms)`;
      if (loadState && timeout !== null) return `Wait for ${loadState} (${timeout}ms)`;
      return formatCompactBrowserToolCall(action, parsedInput);
    }
    case "read_console_messages":
    case "list_console_messages": {
      const level = formatInlineText(readFirstString(parsedInput, ["level", "type", "pattern"]));
      return level ? `Inspect console: ${level}` : "Inspect console";
    }
    case "read_network_requests":
    case "list_network_requests": {
      const target =
        readFirstPathOrUrl(parsedInput, ["url", "path"]) ??
        formatInlineText(readFirstString(parsedInput, ["resourceType", "method"]));
      return target ? `Inspect network: ${target}` : "Inspect network";
    }
    case "get_page_text": {
      const target = readElementTarget(parsedInput);
      return target ? `Read page text from ${target}` : "Read page text";
    }
    case "javascript":
    case "evaluate_script": {
      const script = formatInlineText(
        readFirstString(parsedInput, ["script", "expression", "code", "javascript", "function"]),
      );
      return script ? `Run browser script: ${script}` : "Run browser script";
    }
    case "navigate": {
      const navigationAction = readString(parsedInput, "action");
      const target = readFirstPathOrUrl(parsedInput, ["url", "path"]);
      if (navigationAction && target) return `Navigate ${navigationAction} ${target}`;
      return formatCompactBrowserToolCall(action, parsedInput);
    }
    case "scroll": {
      const direction = readString(parsedInput, "direction");
      const target = readElementTarget(parsedInput);
      if (direction && target) return `Scroll ${direction} to ${target}`;
      if (target) return `Scroll to ${target}`;
      return `Scroll ${direction ?? "page"}`;
    }
    case "press_key": {
      const key = readString(parsedInput, "key") ?? "key";
      const target = readElementTarget(parsedInput);
      return target ? `Press ${key} on ${target}` : `Press ${key}`;
    }
    case "screenshot":
    case "take_screenshot": {
      const path = readFirstPathOrUrl(parsedInput, ["path", "filename"]);
      const fullPage = readBoolean(parsedInput, "fullPage");
      if (path && fullPage === true) return `Take screenshot (${path}, full page)`;
      if (path) return `Take screenshot (${path})`;
      if (fullPage === true) return "Take screenshot (full page)";
      return "Take screenshot";
    }
    case "annotated_screenshot": {
      const path = readFirstPathOrUrl(parsedInput, ["path", "filename"]);
      const target = readElementTarget(parsedInput);
      if (target && path) return `Take annotated screenshot of ${target} (${path})`;
      if (target) return `Take annotated screenshot of ${target}`;
      if (path) return `Take annotated screenshot (${path})`;
      return "Take annotated screenshot";
    }
    case "save_video": {
      const path = readFirstPathOrUrl(parsedInput, ["path", "filename"]);
      return path ? `Save browser video to ${path}` : "Save browser video";
    }
    default:
      return formatCompactBrowserToolCall(action, parsedInput);
  }
};

export const formatBrowserToolCall = (
  toolName: string,
  input: string,
  options: BrowserToolCallFormatOptions = {},
): string | null => {
  if (!toolName.startsWith(BROWSER_TOOL_PREFIX)) return null;

  const action = toolName.slice(BROWSER_TOOL_PREFIX.length);
  const parsedInput = parseToolInput(input);

  if (options.includeRelevantInputs === true) {
    return formatDetailedBrowserToolCall(action, parsedInput);
  }

  return formatCompactBrowserToolCall(action, parsedInput);
};
