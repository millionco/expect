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
export const OVERLAY_CONTAINER_ID = "__browser_tester_annotation_overlay__";
export const EVENT_COLLECT_INTERVAL_MS = 500;
