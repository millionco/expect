export const CURSOR_SIZE_PX = 48;
export const CURSOR_HEIGHT_PX = 53;
export const VIEWPORT_PADDING_PX = 8;
export const CURSOR_TRANSITION_MS = 300;
export const SRGB_BLUE = "30, 123, 252";
export const STATE_KEY = "__expect_cursor_state__";

export type CursorAction = "idle" | "click" | "type";
export type CursorShape = "pointer" | "text" | "hand" | "grab";

export interface HighlightRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ActionLogEntry {
  description: string;
  code: string;
  selector: string;
}

export interface OverlayState {
  cursorX: number;
  cursorY: number;
  label: string;
  cursorPositioned: boolean;
  cursorAction: CursorAction;
  clickCount: number;
  highlightSelectors: string[];
  actionLog: ActionLogEntry[];
}

export interface CursorPersisted {
  relativeX: number;
  relativeY: number;
  label: string;
  positioned: boolean;
}

export const getViewport = () => {
  const vv = window.visualViewport;
  return {
    width: vv?.width ?? window.innerWidth,
    height: vv?.height ?? window.innerHeight,
  };
};

export const clampToViewport = (
  value: number,
  elementSize: number,
  viewportSize: number,
  padding: number,
): number => Math.max(padding, Math.min(value, viewportSize - elementSize - padding));
