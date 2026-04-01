declare const __VERSION__: string | undefined;
export const VERSION: string = typeof __VERSION__ !== "undefined" ? __VERSION__ : "dev";

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
export const ALT_SCREEN_ON = "\u001b[?1049h\u001b[2J\u001b[H";
export const ALT_SCREEN_OFF = "\u001b[?1049l";
export const FALLBACK_TERMINAL_COLUMNS = 80;
export const FALLBACK_TERMINAL_ROWS = 24;
export const CONTEXT_PICKER_VISIBLE_COUNT = 8;

export const TEST_FILE_CONTENT_SIZE_LIMIT_BYTES = 256 * 1024;
export const TEST_FILE_SCAN_LIMIT = 50;

export const AUDIT_LINT_KEYWORDS = ["lint", "check", "format", "typecheck", "type-check"];
export const AUDIT_SCRIPT_TIMEOUT_MS = 120_000;

export const GIT_REMOTE_TIMEOUT_MS = 5_000;
export const GIT_STATE_TIMEOUT_MS = 10_000;
export const TEST_COVERAGE_TIMEOUT_MS = 15_000;

export const GH_CLI_DETECT_TIMEOUT_MS = 5_000;
export const GH_SECRET_SET_TIMEOUT_MS = 30_000;
export const CLAUDE_SETUP_TOKEN_TIMEOUT_MS = 120_000;

export const PORT_PICKER_VISIBLE_COUNT = 10;
export const MIN_USER_PORT = 1024;
export const MAX_PORT = 65535;
export const EPHEMERAL_PORT_START = 32768;
export const LISTENING_PORTS_REFETCH_INTERVAL_MS = 5000;

export const WATCH_IDLE_TICK_INTERVAL_MS = 1000;
export const WATCH_IDLE_SPINNER_DURATION_S = 5;
export const WATCH_IDLE_HINT_DURATION_S = 3;
export const WATCH_IDLE_CYCLE_DURATION_S =
  WATCH_IDLE_SPINNER_DURATION_S + WATCH_IDLE_HINT_DURATION_S;
export const TLS_PROBE_TIMEOUT_MS = 300;
export const PROJECT_SCAN_MAX_DEPTH = 3;

export const CI_EXECUTION_TIMEOUT_MS = 30 * 60 * 1000;
export const CI_HEARTBEAT_INTERVAL_MS = 60_000;

export const NPM_PACKAGE_NAME = "expect-cli";
export const VERSION_API_URL = "https://expect.dev/api/version";
export const UPDATE_CHECK_STALE_MS = 3_600_000;
export const UPDATE_CHECK_TIMEOUT_MS = 5_000;
export const PLAYWRIGHT_INSTALL_TIMEOUT_MS = 300_000;

export type PackageManager = "npm" | "pnpm" | "yarn" | "bun" | "deno" | "vp";

export const LOCK_FILE_TO_AGENT: Record<string, PackageManager> = {
  "pnpm-lock.yaml": "pnpm",
  "pnpm-workspace.yaml": "pnpm",
  "yarn.lock": "yarn",
  "package-lock.json": "npm",
  "npm-shrinkwrap.json": "npm",
  "bun.lock": "bun",
  "bun.lockb": "bun",
  "deno.lock": "deno",
};
