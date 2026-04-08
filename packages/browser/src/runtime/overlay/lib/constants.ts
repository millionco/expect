export const CURSOR_SIZE_PX = 72;
export const CURSOR_HEIGHT_PX = 80;
export const OVERLAY_BLUE = "color(display-p3 0.118 0.481 0.988)";
export const SRGB_BLUE = "30, 123, 252";
export const STATE_KEY = "__expect_cursor_state__";
export const CLICK_ANIMATION_RESET_MS = 300;
export const MAX_ACTION_LOG_ENTRIES = 50;
export const TOOLTIP_FLIP_THRESHOLD_PX = 80;
export const TOOLTIP_OFFSET_PX = 32;
export const TOOLTIP_MAX_WIDTH_PX = 400;
export const TOOLTIP_VIEWPORT_PADDING_PX = 8;
export const RAF_THROTTLE_INTERVAL_MS = 100;
export const CURSOR_REST_MARGIN_PX = 16;

export type CursorAction = "idle" | "click" | "type";
export type CursorShape = "pointer" | "text" | "hand" | "grab";

export interface HighlightRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ActionLogEntry {
  id: number;
  description: string;
  code: string;
  selector: string;
}

export interface OverlayState {
  cursorX: number;
  cursorY: number;
  cursorSelector: string;
  label: string;
  cursorPositioned: boolean;
  cursorAction: CursorAction;
  clickCount: number;
  highlightSelectors: string[];
  actionLog: ActionLogEntry[];
  overlayVisible: boolean;
  toolbarExpanded: boolean;
  isScrolling: boolean;
}

export interface CursorPersisted {
  relativeX: number;
  relativeY: number;
  label: string;
  positioned: boolean;
}

export const getViewport = () => {
  const visualViewport = window.visualViewport;
  return {
    width: visualViewport?.width ?? window.innerWidth,
    height: visualViewport?.height ?? window.innerHeight,
  };
};

export const clampToViewport = (
  value: number,
  elementSize: number,
  viewportSize: number,
  padding: number,
): number => Math.max(padding, Math.min(value, viewportSize - elementSize - padding));
