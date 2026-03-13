export const VERSION = "0.0.1";

export const AUTOMATED_ENVIRONMENT_VARIABLES = [
  "CI",
  "CLAUDECODE",
  "CURSOR_AGENT",
  "CODEX_CI",
  "OPENCODE",
  "AMP_HOME",
  "AMI",
];

export const SELECTED_INDICATOR = "►";

export const SEARCH_PLACEHOLDER = "Search ...";

export const GIT_TIMEOUT_MS = 5000;
export const GH_TIMEOUT_MS = 15000;
export const SWITCH_BRANCH_TIMEOUT_MS = 10000;
export const COMMIT_LIMIT = 50;
export const PR_LIMIT = 100;
export const COLUMN_PADDING = 2;
export const VISIBLE_COMMIT_COUNT = 15;
export const SPINNER_INTERVAL_MS = 80;
export const TESTING_VISIBLE_LOG_COUNT = 18;
export const TESTING_TOOL_TEXT_CHAR_LIMIT = 100;
export const FLOW_DIRECTORY_NAME = "flows";
export const FLOW_DIRECTORY_INDEX_FILE_NAME = "directory.md";
export const FLOW_DESCRIPTION_CHAR_LIMIT = 120;

export const COLORS = {
  TEXT: "white",
  DIM: "#888888",
  GREEN: "greenBright",
  SELECTION: "cyanBright",
  RED: "redBright",
  BORDER: "gray",
  DIVIDER: "gray",
  YELLOW: "yellowBright",
  PURPLE: "blueBright",
  CYAN: "cyanBright",
  AMBER: "yellowBright",
} as const;
