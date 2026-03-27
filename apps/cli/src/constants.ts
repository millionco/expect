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
export const CLICK_SUPPORT_ENABLED =
  process.env.SUPPORT_CLICK === "true" || process.env.SUPPORT_CLICK === "1";

export const CONTEXT_PICKER_VISIBLE_COUNT = 8;

export const TEST_FILE_CONTENT_SIZE_LIMIT_BYTES = 256 * 1024;
export const TEST_FILE_SCAN_LIMIT = 50;

export const AUDIT_LINT_KEYWORDS = ["lint", "check", "format", "typecheck", "type-check"];
export const AUDIT_SCRIPT_TIMEOUT_MS = 120_000;

export const GIT_STATE_TIMEOUT_MS = 10_000;
export const TEST_COVERAGE_TIMEOUT_MS = 15_000;

export const PORT_PICKER_VISIBLE_COUNT = 10;
export const MIN_USER_PORT = 1024;
export const MAX_PORT = 65535;
export const EPHEMERAL_PORT_START = 32768;
export const LISTENING_PORTS_REFETCH_INTERVAL_MS = 5000;

export const CI_EXECUTION_TIMEOUT_MS = 30 * 60 * 1000;
export const CI_HEARTBEAT_INTERVAL_MS = 60_000;
export const WATCH_POLL_INTERVAL_MS = 1_500;
export const WATCH_SETTLE_DELAY_MS = 2_000;
export const WATCH_IDLE_STATUS_INTERVAL_MS = 30_000;

export const NPM_PACKAGE_NAME = "expect-cli";
export const UPDATE_CHECK_STALE_MS = 3_600_000;
export const UPDATE_CHECK_TIMEOUT_MS = 5_000;

export const LOCK_FILE_TO_AGENT: Record<string, string> = {
  "pnpm-lock.yaml": "pnpm",
  "pnpm-workspace.yaml": "pnpm",
  "yarn.lock": "yarn",
  "package-lock.json": "npm",
  "npm-shrinkwrap.json": "npm",
  "bun.lock": "bun",
  "bun.lockb": "bun",
  "deno.lock": "deno",
};
