import { createRoot } from "react-dom/client";
// eslint-disable-next-line no-restricted-imports -- overlay runs in injected runtime, not the CLI React app; React Compiler doesn't apply
import { useState, useEffect } from "react";
// @ts-expect-error -- CSS imported as text via esbuild cssTextPlugin
import cssText from "../../../dist/overlay.css";

import {
  CURSOR_SIZE_PX,
  CURSOR_HEIGHT_PX,
  CURSOR_REST_MARGIN_PX,
  OVERLAY_BLUE,
  MAX_ACTION_LOG_ENTRIES,
  TOOLTIP_OFFSET_PX,
  TOOLTIP_MAX_WIDTH_PX,
  TOOLTIP_VIEWPORT_PADDING_PX,
  getViewport,
  clampToViewport,
} from "./lib/constants";
import type { OverlayState, HighlightRect, CursorShape } from "./lib/constants";
import {
  saveCursorState,
  loadCursorState,
  loadInitialState,
  clearSaveCursorTimeout,
} from "./lib/state";
import { usePolledPositions } from "./lib/use-polled-positions";
import { finder } from "@medv/finder";
import { CursorIcon, detectCursorShape } from "./components/cursors";
import { Glow } from "./components/glow";
import { TextMorph } from "torph/react";

const AgentOverlay = () => {
  const [state, setState] = useState<OverlayState>(loadInitialState);
  const [cursorShape, setCursorShape] = useState<CursorShape>("pointer");
  const [isDark, setIsDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
  );

  useEffect(() => {
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (event: MediaQueryListEvent) => setIsDark(event.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    setOverlayState = setState;
    return () => {
      setOverlayState = undefined;
    };
  }, []);

  useEffect(() => {
    const viewport = getViewport();
    if (
      state.cursorPositioned &&
      state.cursorX >= 0 &&
      state.cursorY >= 0 &&
      viewport.width > 0 &&
      viewport.height > 0
    ) {
      saveCursorState({
        relativeX: state.cursorX / viewport.width,
        relativeY: state.cursorY / viewport.height,
        label: state.label,
        positioned: true,
      });
    }
  }, [state.cursorX, state.cursorY, state.label, state.cursorPositioned]);

  useEffect(() => {
    if (!state.cursorPositioned) return;
    let scrollResetTimer: ReturnType<typeof setTimeout> | undefined;

    const reposition = () => {
      if (state.cursorSelector) {
        try {
          const element = document.querySelector(state.cursorSelector);
          if (element) {
            const box = element.getBoundingClientRect();
            setState((previous) => ({
              ...previous,
              cursorX: box.x + box.width / 2,
              cursorY: box.y + box.height / 2,
              isScrolling: true,
            }));
            clearTimeout(scrollResetTimer);
            scrollResetTimer = setTimeout(() => {
              setState((previous) => ({ ...previous, isScrolling: false }));
            }, 150);
            return;
          }
        } catch (error) {
          console.debug("[expect-overlay] reposition selector error:", error);
        }
      }
      const saved = loadCursorState();
      if (!saved?.positioned) return;
      const vp = getViewport();
      setState((previous) => ({
        ...previous,
        cursorX: saved.relativeX * vp.width,
        cursorY: saved.relativeY * vp.height,
        isScrolling: true,
      }));
      clearTimeout(scrollResetTimer);
      scrollResetTimer = setTimeout(() => {
        setState((previous) => ({ ...previous, isScrolling: false }));
      }, 150);
    };

    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
      clearTimeout(scrollResetTimer);
    };
  }, [state.cursorSelector, state.cursorPositioned]);

  const highlightRects = usePolledPositions<HighlightRect>(
    [state.highlightSelectors],
    () => {
      const rects: HighlightRect[] = [];
      for (const selector of state.highlightSelectors) {
        try {
          const element = document.querySelector(selector);
          if (!element) continue;
          const box = element.getBoundingClientRect();
          rects.push({ x: box.x, y: box.y, width: box.width, height: box.height });
        } catch (error) {
          console.debug("[expect-overlay] highlight selector error:", error);
        }
      }
      return rects;
    },
    state.highlightSelectors.length > 0,
  );

  const viewport = getViewport();
  const cursorX = state.cursorPositioned
    ? clampToViewport(state.cursorX, CURSOR_SIZE_PX, viewport.width, 0)
    : viewport.width - CURSOR_SIZE_PX - CURSOR_REST_MARGIN_PX;
  const cursorY = state.cursorPositioned
    ? clampToViewport(state.cursorY, CURSOR_HEIGHT_PX, viewport.height, 0)
    : viewport.height - CURSOR_HEIGHT_PX - CURSOR_REST_MARGIN_PX;

  useEffect(() => {
    if (!state.cursorPositioned) return;
    setCursorShape(detectCursorShape(state.cursorX, state.cursorY));
  }, [state.cursorX, state.cursorY, state.cursorPositioned]);

  const hasLabel = Boolean(state.label);

  const spaceRight = viewport.width - cursorX - TOOLTIP_OFFSET_PX - TOOLTIP_VIEWPORT_PADDING_PX;
  const spaceLeft = cursorX - TOOLTIP_VIEWPORT_PADDING_PX;
  const tooltipFlipX = spaceRight < TOOLTIP_MAX_WIDTH_PX && spaceLeft > spaceRight;
  const tooltipMaxWidth = tooltipFlipX
    ? Math.min(TOOLTIP_MAX_WIDTH_PX, spaceLeft)
    : Math.min(TOOLTIP_MAX_WIDTH_PX, spaceRight);
  const tooltipFlipY = cursorY > viewport.height - 80;

  return (
    <>
      {state.overlayVisible && <Glow />}

      {state.overlayVisible && (
        <div
          className="fixed pointer-events-none z-[2147483647]"
          style={{
            left: `${cursorX}px`,
            top: `${cursorY}px`,
            opacity: 1,
            transition: state.isScrolling
              ? "opacity 150ms ease"
              : `left 600ms cubic-bezier(0.25, 0.1, 0.25, 1), top 600ms cubic-bezier(0.65, 0, 0.35, 1), opacity 150ms ease`,
          }}
        >
          <div style={{ animation: "expect-cursor-in 0.3s cubic-bezier(0.22,1,0.36,1) both" }}>
            <CursorIcon shape={cursorShape} />
          </div>
          {hasLabel && (
            <div
              className="absolute pointer-events-none w-max"
              style={{
                left: tooltipFlipX ? undefined : "32px",
                right: tooltipFlipX ? "calc(100% - 2px)" : undefined,
                top: tooltipFlipY ? undefined : "32px",
                bottom: tooltipFlipY ? "calc(100% - 2px)" : undefined,
              }}
            >
              <div
                className="rounded-full py-1.5 px-3 text-white font-medium text-[13px] leading-5 font-[system-ui,-apple-system,sans-serif] animate-[expect-comment-in_0.25s_cubic-bezier(0.22,1,0.36,1)_both]"
                style={{
                  maxWidth: `${tooltipMaxWidth}px`,
                  background: "#000",
                  border: "2px solid color(display-p3 0.118 0.481 0.988)",
                  boxShadow: isDark
                    ? "0 0 4px rgba(0,0,0,0.22), 0 2px 8px rgba(0,0,0,0.3)"
                    : "0 0 4px rgba(0,0,0,0.22), 0 2px 8px rgba(0,0,0,0.12)",
                  overflow: "hidden",
                  whiteSpace: "nowrap",
                  textOverflow: "ellipsis",
                }}
              >
                <TextMorph style={{ display: "inline", whiteSpace: "nowrap" }}>
                  {state.label}
                </TextMorph>
              </div>
            </div>
          )}
        </div>
      )}

      {state.overlayVisible &&
        highlightRects.map((rect, index) => (
          <div
            key={`hl-${index}`}
            className="fixed pointer-events-none z-[2147483646] rounded-md border-2 animate-[expect-comment-in_0.2s_cubic-bezier(0.22,1,0.36,1)_both]"
            style={{
              left: `${rect.x}px`,
              top: `${rect.y}px`,
              width: `${rect.width}px`,
              height: `${rect.height}px`,
              borderColor: OVERLAY_BLUE,
              background: `${OVERLAY_BLUE}11`,
            }}
          />
        ))}
    </>
  );
};

let setOverlayState: ((updater: (previous: OverlayState) => OverlayState) => void) | undefined;
let overlayRoot: ReturnType<typeof createRoot> | undefined;
let lastCursorX = -1;
let lastCursorY = -1;
let nextActionId = 0;

export const initAgentOverlay = (containerId: string): void => {
  if (document.getElementById(containerId)) return;

  const host = document.createElement("div");
  host.id = containerId;
  host.setAttribute("data-expect-overlay", "true");

  const shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = typeof cssText === "string" ? cssText : "";
  shadow.appendChild(style);

  const container = document.createElement("div");
  shadow.appendChild(container);

  document.body.appendChild(host);

  overlayRoot = createRoot(container);
  overlayRoot.render(<AgentOverlay />);
};

export const updateCursor = (
  containerId: string,
  x: number,
  y: number,
  label: string,
  selector?: string,
): void => {
  if (!setOverlayState) {
    initAgentOverlay(containerId);
    if (!setOverlayState) return;
  }

  // HACK: scroll the target element into view when the cursor moves to it.
  // Only scrolls if the element is outside the viewport. Uses "nearest" to
  // minimize scroll distance. May interfere with pages that have custom scroll
  // behavior or scroll snapping. Revert this block if it causes issues.
  if (selector) {
    try {
      const element = document.querySelector(selector);
      if (element instanceof HTMLElement) {
        const rect = element.getBoundingClientRect();
        const offScreen =
          rect.bottom < 0 ||
          rect.top > window.innerHeight ||
          rect.right < 0 ||
          rect.left > window.innerWidth;
        if (offScreen) {
          element.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
        }
      }
    } catch (error) {
      console.debug("[expect-overlay] scrollIntoView error:", error);
    }
  }

  if (x >= 0 && y >= 0) {
    lastCursorX = x;
    lastCursorY = y;
  }

  setOverlayState((previous) => {
    const hasPosition = x >= 0 && y >= 0;
    return {
      ...previous,
      cursorX: hasPosition ? x : previous.cursorX,
      cursorY: hasPosition ? y : previous.cursorY,
      cursorSelector: selector ?? "",
      label,
      cursorPositioned: hasPosition ? true : previous.cursorPositioned,
    };
  });
};

export const hideAgentOverlay = (containerId: string): void => {
  const host = document.getElementById(containerId);
  if (!host) return;
  host.style.display = "none";
  // HACK: force layout reflow so display:none takes effect before screenshot capture
  void host.offsetHeight;
};

export const showAgentOverlay = (containerId: string): void => {
  const host = document.getElementById(containerId);
  if (host) host.style.display = "";
};

export const destroyAgentOverlay = (containerId: string): void => {
  clearSaveCursorTimeout();
  overlayRoot?.unmount();
  overlayRoot = undefined;
  document.getElementById(containerId)?.remove();
  setOverlayState = undefined;
};

export const highlightRefs = (containerId: string, selectors: string[]): void => {
  if (!setOverlayState) {
    initAgentOverlay(containerId);
    if (!setOverlayState) return;
  }

  setOverlayState((previous) => ({ ...previous, highlightSelectors: selectors }));
};

export const clearHighlights = (_containerId: string): void => {
  if (!setOverlayState) return;
  setOverlayState((previous) => ({ ...previous, highlightSelectors: [] }));
};

export const logAction = (containerId: string, description: string, code: string): void => {
  if (!setOverlayState) {
    initAgentOverlay(containerId);
    if (!setOverlayState) return;
  }

  let selector = "";
  try {
    if (lastCursorX >= 0 && lastCursorY >= 0) {
      const element = document.elementFromPoint(lastCursorX, lastCursorY);
      if (element && !element.closest(`[data-expect-overlay]`)) {
        selector = finder(element);
      }
    }
  } catch (error) {
    console.debug("[expect-overlay] logAction selector error:", error);
  }

  const actionId = nextActionId++;
  setOverlayState((previous) => ({
    ...previous,
    actionLog: [...previous.actionLog, { id: actionId, description, code, selector }].slice(
      -MAX_ACTION_LOG_ENTRIES,
    ),
  }));
};
