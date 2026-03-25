declare const __VERSION__: string;
export const VERSION: string = __VERSION__;

export const TESTING_TOOL_TEXT_CHAR_LIMIT = 100;
export const TESTING_TIMER_UPDATE_INTERVAL_MS = 1000;
export const SHIMMER_TICK_MS = 50;
export const SHIMMER_GRADIENT_WIDTH = 16;
export const FLOW_INPUT_HISTORY_LIMIT = 20;
export const COMMIT_SELECTOR_WIDTH = 2;
export const BRANCH_NAME_COLUMN_WIDTH = 32;
export const BRANCH_AUTHOR_COLUMN_WIDTH = 16;
export const BRANCH_VISIBLE_COUNT = 15;
export const TABLE_COLUMN_GAP = 2;
export const LAYOUT_ORIGIN_OFFSET = 1;
export const ALT_SCREEN_ON = "\u001b[?1049h\u001b[2J\u001b[H";
export const ALT_SCREEN_OFF = "\u001b[?1049l";
export const FALLBACK_TERMINAL_COLUMNS = 80;
export const FALLBACK_TERMINAL_ROWS = 24;
export const LIVE_VIEW_READY_POLL_INTERVAL_MS = 1000;
export const CLICK_SUPPORT_ENABLED =
  process.env.SUPPORT_CLICK === "true" || process.env.SUPPORT_CLICK === "1";

export const CONTEXT_PICKER_VISIBLE_COUNT = 8;
