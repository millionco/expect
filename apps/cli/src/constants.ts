export const VERSION = "0.0.1";

export const GH_TIMEOUT_MS = 15000;
export const COMMIT_LIMIT = 50;
export const PR_LIMIT = 100;
export const VISIBLE_COMMIT_COUNT = 15;
export const TESTING_VISIBLE_LOG_COUNT = 18;
export const TESTING_TOOL_TEXT_CHAR_LIMIT = 100;
export const TESTING_TOOL_INPUT_CHAR_LIMIT = 60;
export const TESTING_TIMER_UPDATE_INTERVAL_MS = 1000;
export const MS_PER_SECOND = 1000;
export const SECONDS_PER_MINUTE = 60;
export const MS_PER_MINUTE = MS_PER_SECOND * SECONDS_PER_MINUTE;
export const MINUTES_PER_HOUR = 60;
export const MS_PER_HOUR = MS_PER_MINUTE * MINUTES_PER_HOUR;
export const HOURS_PER_DAY = 24;
export const MS_PER_DAY = MS_PER_HOUR * HOURS_PER_DAY;
export const DAYS_PER_WEEK = 7;
export const DAYS_PER_MONTH = 30;
export const MONTHS_PER_YEAR = 12;
export const FLOW_DIRECTORY_NAME = "flows";
export const FLOW_DIRECTORY_INDEX_FILE_NAME = "directory.md";
export const FLOW_DESCRIPTION_CHAR_LIMIT = 120;
export const FLOW_INPUT_HISTORY_LIMIT = 20;
export const SAVED_FLOW_FORMAT_VERSION = 2;
export const THEME_PICKER_VISIBLE_COUNT = 20;
export const SAVED_FLOW_PICKER_VISIBLE_COUNT = 12;
export const TESTING_SELECT_TRUNCATION_LIMIT = 24;
export const COMMIT_SELECTOR_WIDTH = 2;
export const COMMIT_HASH_COLUMN_WIDTH = 10;
export const COMMIT_AUTHOR_COLUMN_WIDTH = 16;
export const COMMIT_DATE_COLUMN_WIDTH = 14;
export const BRANCH_NAME_COLUMN_WIDTH = 32;
export const BRANCH_AUTHOR_COLUMN_WIDTH = 16;
export const BRANCH_VISIBLE_COUNT = 15;
export const TABLE_COLUMN_GAP = 2;
export const SECTION_INDENT = 4;
export const LAYOUT_ORIGIN_OFFSET = 1;
export const ALT_SCREEN_ON = "\u001b[?1049h\u001b[2J\u001b[H";
export const ALT_SCREEN_OFF = "\u001b[?1049l";
export const BROWSER_TOOL_PREFIX = "mcp__browser__";
export { detectMouseSupport } from "./utils/detect-mouse-support.js";
export const CLICK_SUPPORT_ENABLED =
  process.env.SUPPORT_CLICK === "true" || process.env.SUPPORT_CLICK === "1";

export const FLOW_PRESETS: readonly string[] = [
  "Verify my recent changes work as expected",
  "Check for regressions in related features",
  "Test the main user flow end to end",
  "Smoke test the homepage and key pages",
  "Check authentication and protected routes",
];
