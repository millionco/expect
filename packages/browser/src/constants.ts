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
export const EVENT_COLLECT_INTERVAL_MS = 250;
export const RRWEB_CHECKOUT_INTERVAL_MS = 10_000;

export const REPLAY_PLAYER_WIDTH_PX = 960;
export const REPLAY_PLAYER_HEIGHT_PX = 540;

export const CDP_DISCOVERY_TIMEOUT_MS = 2_000;
export const CDP_PORT_PROBE_TIMEOUT_MS = 500;
export const CDP_COMMON_PORTS = [9222, 9229] as const;
export const CDP_LAUNCH_TIMEOUT_MS = 30_000;
export const CDP_POLL_INTERVAL_MS = 50;

export const HEADLESS_CHROME_WINDOW_WIDTH_PX = 1280;
export const HEADLESS_CHROME_WINDOW_HEIGHT_PX = 720;
