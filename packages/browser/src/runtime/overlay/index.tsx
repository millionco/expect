import { createRoot } from "react-dom/client";
// eslint-disable-next-line no-restricted-imports -- overlay runs in injected runtime, not the CLI React app; React Compiler doesn't apply
import { useState, useEffect } from "react";
// @ts-expect-error -- CSS imported as text via esbuild cssTextPlugin
import cssText from "../../../dist/overlay.css";

import {
  CURSOR_SIZE_PX,
  CURSOR_HEIGHT_PX,
  CURSOR_TRANSITION_MS,
  SRGB_BLUE,
  getViewport,
  clampToViewport,
} from "./constants";
import type { OverlayState, HighlightRect, CursorShape } from "./constants";
import {
  saveCursorState,
  loadCursorState,
  loadInitialState,
  clearSaveCursorTimeout,
} from "./state";
import { finder } from "@medv/finder";
import { CursorIcon, detectCursorShape } from "./cursors";
import { SpiralSpinner } from "./spiral-spinner";
import { Glow } from "./glow";

const TOOLTIP_MAX_WIDTH_PX = 320;

const AgentOverlay = () => {
  const [state, setState] = useState<OverlayState>(loadInitialState);

  useEffect(() => {
    setOverlayState = setState;
    return () => {
      setOverlayState = undefined;
    };
  }, []);

  useEffect(() => {
    const viewport = getViewport();
    if (state.cursorPositioned && state.cursorX >= 0 && state.cursorY >= 0) {
      saveCursorState({
        relativeX: state.cursorX / viewport.width,
        relativeY: state.cursorY / viewport.height,
        label: state.label,
        positioned: true,
      });
    }
  }, [state.cursorX, state.cursorY, state.label, state.cursorPositioned]);

  useEffect(() => {
    const onResize = () => {
      const saved = loadCursorState();
      if (!saved?.positioned) return;
      const viewport = getViewport();
      setState((previous) => ({
        ...previous,
        cursorX: saved.relativeX * viewport.width,
        cursorY: saved.relativeY * viewport.height,
      }));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    let clickTimeout: ReturnType<typeof setTimeout> | undefined;

    const onMouseDown = () => {
      setState((previous) => ({
        ...previous,
        cursorAction: "click",
        clickCount: previous.clickCount + 1,
      }));
      clearTimeout(clickTimeout);
      clickTimeout = setTimeout(() => {
        setState((previous) =>
          previous.cursorAction === "click" ? { ...previous, cursorAction: "idle" } : previous,
        );
      }, 300);
    };

    const onKeyDown = () => {
      setState((previous) =>
        previous.cursorAction !== "type" ? { ...previous, cursorAction: "type" } : previous,
      );
    };

    const onKeyUp = () => {
      setState((previous) =>
        previous.cursorAction === "type" ? { ...previous, cursorAction: "idle" } : previous,
      );
    };

    document.addEventListener("mousedown", onMouseDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("keyup", onKeyUp, true);

    return () => {
      document.removeEventListener("mousedown", onMouseDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("keyup", onKeyUp, true);
      clearTimeout(clickTimeout);
    };
  }, []);

  const [highlightRects, setHighlightRects] = useState<HighlightRect[]>([]);

  useEffect(() => {
    if (state.highlightSelectors.length === 0) {
      setHighlightRects([]);
      return;
    }

    let rafId: number;
    let running = true;
    const computeRects = () => {
      if (!running) return;
      const rects: HighlightRect[] = [];
      for (const selector of state.highlightSelectors) {
        try {
          const element = document.querySelector(selector);
          if (!element) continue;
          const box = element.getBoundingClientRect();
          rects.push({ x: box.x, y: box.y, width: box.width, height: box.height });
        } catch {}
      }
      setHighlightRects(rects);
      rafId = requestAnimationFrame(computeRects);
    };
    rafId = requestAnimationFrame(computeRects);
    return () => {
      running = false;
      cancelAnimationFrame(rafId);
    };
  }, [state.highlightSelectors]);

  interface MarkerPosition {
    x: number;
    y: number;
    visible: boolean;
  }

  const [markerPositions, setMarkerPositions] = useState<MarkerPosition[]>([]);

  useEffect(() => {
    if (state.actionLog.length === 0) {
      setMarkerPositions([]);
      return;
    }

    let rafId: number;
    let running = true;
    const computeMarkers = () => {
      if (!running) return;
      const positions: MarkerPosition[] = state.actionLog.map((entry) => {
        if (!entry.selector) return { x: 0, y: 0, visible: false };
        try {
          const element = document.querySelector(entry.selector);
          if (!element) return { x: 0, y: 0, visible: false };
          const box = element.getBoundingClientRect();
          return { x: box.x + box.width / 2, y: box.y + box.height / 2, visible: true };
        } catch {
          return { x: 0, y: 0, visible: false };
        }
      });
      setMarkerPositions(positions);
      rafId = requestAnimationFrame(computeMarkers);
    };
    rafId = requestAnimationFrame(computeMarkers);
    return () => {
      running = false;
      cancelAnimationFrame(rafId);
    };
  }, [state.actionLog]);

  const viewport = getViewport();
  const cursorX = state.cursorPositioned
    ? clampToViewport(state.cursorX - CURSOR_SIZE_PX / 2, CURSOR_SIZE_PX, viewport.width, 0)
    : viewport.width + CURSOR_SIZE_PX;
  const cursorY = state.cursorPositioned
    ? clampToViewport(state.cursorY - CURSOR_HEIGHT_PX / 2, CURSOR_HEIGHT_PX, viewport.height, 0)
    : viewport.height + CURSOR_HEIGHT_PX;

  const [cursorShape, setCursorShape] = useState<CursorShape>("pointer");

  useEffect(() => {
    if (!state.cursorPositioned) return;
    setCursorShape(detectCursorShape(state.cursorX, state.cursorY));
  }, [state.cursorX, state.cursorY, state.cursorPositioned]);

  const [hoveredAction, setHoveredAction] = useState<number | undefined>(undefined);

  const activeMarkerIndex = (() => {
    if (hoveredAction !== undefined) return hoveredAction;
    if (!state.cursorPositioned || state.actionLog.length === 0) return undefined;
    const elementUnderCursor = document.elementFromPoint(state.cursorX, state.cursorY);
    if (!elementUnderCursor) return undefined;
    for (let index = state.actionLog.length - 1; index >= 0; index--) {
      const entry = state.actionLog[index];
      if (!entry.selector) continue;
      try {
        if (
          elementUnderCursor.matches(entry.selector) ||
          elementUnderCursor.closest(entry.selector)
        )
          return index;
      } catch {}
    }
    return undefined;
  })();

  const hasLabel = Boolean(state.label);
  const showCursor = hasLabel || state.cursorPositioned;

  return (
    <>
      <Glow />

      <div
        key={state.clickCount}
        className="fixed pointer-events-none z-[2147483647] will-change-[left,top] drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)]"
        style={{
          width: `${CURSOR_SIZE_PX}px`,
          height: `${CURSOR_HEIGHT_PX}px`,
          left: `${cursorX}px`,
          top: `${cursorY}px`,
          opacity: showCursor ? 1 : 0,
          transition: `left ${CURSOR_TRANSITION_MS}ms cubic-bezier(0.25, 1, 0.5, 1), top ${CURSOR_TRANSITION_MS}ms cubic-bezier(0.25, 1, 0.5, 1), opacity 150ms ease`,
          animation:
            state.cursorAction === "click" ? "expect-cursor-click 0.2s ease-out 1" : "none",
        }}
      >
        <CursorIcon shape={state.cursorAction === "type" ? "text" : cursorShape} />
      </div>

      <div
        className="fixed pointer-events-none z-[2147483647]"
        style={{
          bottom: "1.25rem",
          right: "1.25rem",
          opacity: state.label ? 1 : 0,
          transform: state.label ? "translateY(0) scale(1)" : "translateY(8px) scale(0.96)",
          transition: "opacity 0.3s ease, transform 0.4s cubic-bezier(0.19, 1, 0.22, 1)",
        }}
      >
        <div
          className="flex items-center gap-2.5"
          style={{
            height: "44px",
            padding: "0 16px",
            borderRadius: "22px",
            background: "#1a1a1a",
            color: "#fff",
            fontSize: "14px",
            fontFamily:
              "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            fontWeight: 500,
            boxShadow: "0 2px 8px rgba(0,0,0,0.2), 0 4px 16px rgba(0,0,0,0.1)",
            maxWidth: `${TOOLTIP_MAX_WIDTH_PX}px`,
          }}
        >
          <SpiralSpinner visible={Boolean(state.label)} />
          <span
            className="animate-[expect-text-shimmer_3s_linear_infinite]"
            style={{
              background:
                "linear-gradient(90deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,1) 50%, rgba(255,255,255,0.5) 100%)",
              backgroundSize: "200% 100%",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              maxWidth: "240px",
            }}
          >
            {state.label}
          </span>
        </div>
      </div>

      {state.actionLog.map((action, index) => {
        const position = markerPositions[index];
        if (!position?.visible) return undefined;
        return (
          <div
            key={`action-${index}`}
            className="fixed z-[2147483646]"
            style={{
              left: `${position.x}px`,
              top: `${position.y}px`,
              width: "22px",
              height: "22px",
              borderRadius: "50%",
              background: `rgb(${SRGB_BLUE})`,
              color: "#fff",
              fontSize: "11px",
              fontWeight: 600,
              fontFamily:
                "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 2px 6px rgba(0,0,0,0.2), inset 0 0 0 1px rgba(0,0,0,0.04)",
              pointerEvents: "auto",
              cursor: "pointer",
              userSelect: "none",
              transform: `translate(-50%, -50%)${activeMarkerIndex === index ? " scale(1.1)" : ""}`,
              transition: `left ${CURSOR_TRANSITION_MS}ms cubic-bezier(0.25, 1, 0.5, 1), top ${CURSOR_TRANSITION_MS}ms cubic-bezier(0.25, 1, 0.5, 1), background-color 0.15s ease, transform 0.1s ease`,
              animation: "expect-marker-in 0.25s cubic-bezier(0.22, 1, 0.36, 1) both",
            }}
            onMouseEnter={() => setHoveredAction(index)}
            onMouseLeave={() => setHoveredAction(undefined)}
          >
            {index + 1}
            {activeMarkerIndex === index && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 10px)",
                  left: "50%",
                  transform: "translateX(-50%) scale(0.909)",
                  background: "#1a1a1a",
                  color: "#fff",
                  padding: "8px 12px",
                  borderRadius: "12px",
                  fontFamily:
                    "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                  fontWeight: 400,
                  fontSize: "13px",
                  boxShadow: "0 4px 20px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.08)",
                  minWidth: "120px",
                  maxWidth: "280px",
                  pointerEvents: "none",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  lineHeight: 1.4,
                  animation: "expect-tooltip-in 0.1s ease-out forwards",
                }}
              >
                <span
                  style={{
                    display: "block",
                    fontSize: "12px",
                    fontStyle: "italic",
                    color: "rgba(255,255,255,0.6)",
                    marginBottom: "4px",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {action.description}
                </span>
                <span
                  style={{
                    display: "block",
                    fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace",
                    fontSize: "11px",
                    color: "rgba(255,255,255,0.8)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {action.code.split("\n")[0]}
                </span>
              </div>
            )}
          </div>
        );
      })}

      {highlightRects.map((rect, index) => (
        <div
          key={`hl-${index}`}
          className="fixed pointer-events-none z-[2147483646] rounded-[3px] will-change-[left,top,width,height]"
          style={{
            left: `${rect.x}px`,
            top: `${rect.y}px`,
            width: `${rect.width}px`,
            height: `${rect.height}px`,
            border: `2px solid rgb(${SRGB_BLUE})`,
            boxShadow: `0 0 0 1px rgba(${SRGB_BLUE}, 0.3)`,
            transition: `left ${CURSOR_TRANSITION_MS}ms cubic-bezier(0.25, 1, 0.5, 1), top ${CURSOR_TRANSITION_MS}ms cubic-bezier(0.25, 1, 0.5, 1), width ${CURSOR_TRANSITION_MS}ms cubic-bezier(0.25, 1, 0.5, 1), height ${CURSOR_TRANSITION_MS}ms cubic-bezier(0.25, 1, 0.5, 1)`,
          }}
        />
      ))}
    </>
  );
};

let setOverlayState: ((updater: (previous: OverlayState) => OverlayState) => void) | undefined;
let overlayRoot: ReturnType<typeof createRoot> | undefined;

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

export const updateCursor = (containerId: string, x: number, y: number, label: string): void => {
  if (!setOverlayState) {
    initAgentOverlay(containerId);
    if (!setOverlayState) return;
  }

  setOverlayState((previous) => {
    const hasPosition = x >= 0 && y >= 0;
    return {
      ...previous,
      cursorX: hasPosition ? x : previous.cursorX,
      cursorY: hasPosition ? y : previous.cursorY,
      label,
      cursorPositioned: hasPosition ? true : previous.cursorPositioned,
    };
  });
};

export const hideAgentOverlay = (containerId: string): void => {
  const host = document.getElementById(containerId);
  if (!host) return;
  host.style.display = "none";
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

  setOverlayState((previous) => {
    let selector = "";
    try {
      const element = document.elementFromPoint(previous.cursorX, previous.cursorY);
      if (element && !element.closest(`[data-expect-overlay]`)) {
        selector = finder(element);
      }
    } catch {}

    return {
      ...previous,
      actionLog: [...previous.actionLog, { description, code, selector }],
    };
  });
};
