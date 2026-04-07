export const SNAPSHOT_TIMEOUT_MS = 30_000;
export const REF_PREFIX = "e";
export const EXCLUDED_ARIA_ROLE = "text";
export const HEADLESS_CHROMIUM_ARGS = [
  "--enable-webgl",
  "--use-gl=angle",
  "--use-angle=swiftshader",
  "--ignore-gpu-blocklist",
];

export const INTERACTIVE_ROLES = new Set([
  "button",
  "link",
  "textbox",
  "checkbox",
  "radio",
  "combobox",
  "listbox",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "option",
  "searchbox",
  "slider",
  "spinbutton",
  "switch",
  "tab",
  "treeitem",
]);

export const CONTENT_ROLES = new Set([
  "heading",
  "cell",
  "gridcell",
  "columnheader",
  "rowheader",
  "listitem",
  "article",
  "region",
  "main",
  "navigation",
]);

export const NAVIGATION_DETECT_DELAY_MS = 1_000;
export const POST_NAVIGATION_SETTLE_MS = 500;

export const ESTIMATED_CHARS_PER_TOKEN = 4;
export const MAX_ELEMENT_TEXT_LENGTH = 100;
export const MAX_CURSOR_INTERACTIVE_ELEMENTS = 100;
export const OVERLAY_CONTAINER_ID = "__expect_annotation_overlay__";
export const AGENT_OVERLAY_CONTAINER_ID = "__expect_agent_overlay__";

export const VIDEO_WIDTH_PX = 1920;
export const VIDEO_HEIGHT_PX = 1080;

export const CDP_DISCOVERY_TIMEOUT_MS = 2_000;
export const CDP_PORT_PROBE_TIMEOUT_MS = 500;
export const CDP_COMMON_PORTS = [9222, 9229] as const;
export const CDP_LAUNCH_TIMEOUT_MS = 30_000;
export const CDP_POLL_INTERVAL_MS = 50;

export const HEADLESS_CHROME_WINDOW_WIDTH_PX = 1280;
export const HEADLESS_CHROME_WINDOW_HEIGHT_PX = 720;

export const OVERLAY_REINJECT_TIMEOUT_MS = 5_000;

export const BROWSER_CLOSE_TIMEOUT_MS = 10_000;
export const VIDEO_PATH_TIMEOUT_MS = 15_000;
export const CDP_CONNECT_TIMEOUT_MS = 30_000;
