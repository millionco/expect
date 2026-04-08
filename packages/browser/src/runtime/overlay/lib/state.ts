import { STATE_KEY, getViewport } from "./constants";
import type { CursorPersisted, OverlayState } from "./constants";

let saveCursorTimeout: ReturnType<typeof setTimeout> | undefined;

export const saveCursorState = (state: CursorPersisted): void => {
  clearTimeout(saveCursorTimeout);
  saveCursorTimeout = setTimeout(() => {
    try {
      sessionStorage.setItem(STATE_KEY, JSON.stringify(state));
    } catch (error) {
      console.debug("[expect-overlay] failed to save cursor state:", error);
    }
  }, 500);
};

export const loadCursorState = (): CursorPersisted | undefined => {
  try {
    const raw = sessionStorage.getItem(STATE_KEY);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
};

export const loadInitialState = (): OverlayState => {
  const saved = loadCursorState();
  const viewport = getViewport();

  return {
    cursorX: saved?.positioned ? saved.relativeX * viewport.width : -1,
    cursorY: saved?.positioned ? saved.relativeY * viewport.height : -1,
    cursorSelector: "",
    label: saved?.label ?? "",
    cursorPositioned: saved?.positioned ?? false,
    cursorAction: "idle",
    clickCount: 0,
    highlightSelectors: [],
    actionLog: [],
    overlayVisible: true,
    toolbarExpanded: false,
    isScrolling: false,
  };
};

export const clearSaveCursorTimeout = (): void => {
  clearTimeout(saveCursorTimeout);
};
