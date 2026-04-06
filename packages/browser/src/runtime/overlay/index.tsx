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
import { ToolbarControls } from "./toolbar-controls";

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
    if (!state.cursorSelector) return;
    let rafId: number;
    let running = true;
    const trackCursor = () => {
      if (!running) return;
      try {
        const element = document.querySelector(state.cursorSelector);
        if (element) {
          const box = element.getBoundingClientRect();
          const centerX = box.x + box.width / 2;
          const centerY = box.y + box.height / 2;
          setState((previous) => {
            if (
              Math.abs(previous.cursorX - centerX) < 1 &&
              Math.abs(previous.cursorY - centerY) < 1
            )
              return previous;
            return { ...previous, cursorX: centerX, cursorY: centerY };
          });
        }
      } catch {}
      rafId = requestAnimationFrame(trackCursor);
    };
    rafId = requestAnimationFrame(trackCursor);
    return () => {
      running = false;
      cancelAnimationFrame(rafId);
    };
  }, [state.cursorSelector]);

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
    let previousJson = "";
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
      const json = JSON.stringify(rects);
      if (json !== previousJson) {
        previousJson = json;
        setHighlightRects(rects);
      }
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
    let previousJson = "";
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
      const json = JSON.stringify(positions);
      if (json !== previousJson) {
        previousJson = json;
        setMarkerPositions(positions);
      }
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

  const hoveredElementRect = (() => {
    if (hoveredAction === undefined) return undefined;
    const entry = state.actionLog[hoveredAction];
    if (!entry?.selector) return undefined;
    try {
      const element = document.querySelector(entry.selector);
      if (!element) return undefined;
      const box = element.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    } catch {
      return undefined;
    }
  })();

  const hasLabel = Boolean(state.label);
  const showCursor = hasLabel || state.cursorPositioned;
  const isExpanded = state.toolbarExpanded;

  const toggleOverlay = () => {
    setState((previous) => ({ ...previous, overlayVisible: !previous.overlayVisible }));
  };

  const toggleToolbar = () => {
    setState((previous) => ({ ...previous, toolbarExpanded: !previous.toolbarExpanded }));
  };

  return (
    <>
      {state.overlayVisible && <Glow />}

      {state.overlayVisible && (
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
      )}

      <div className="fixed bottom-5 right-5 z-[2147483647] pointer-events-auto font-[system-ui,-apple-system,BlinkMacSystemFont,'Segoe_UI',Roboto,sans-serif]">
        <div
          className={`relative flex items-center justify-center h-[44px] rounded-[22px] bg-[#1a1a1a] text-white shadow-[0_2px_8px_rgba(0,0,0,0.2),0_4px_16px_rgba(0,0,0,0.1)] transition-[width] duration-400 ease-[cubic-bezier(0.19,1,0.22,1)] ${isExpanded ? "w-auto px-1.5" : `w-[44px] ${hasLabel || state.actionLog.length > 0 ? "cursor-pointer hover:bg-[#2a2a2a] active:scale-95" : ""}`}`}
          onClick={
            isExpanded
              ? undefined
              : hasLabel || state.actionLog.length > 0
                ? toggleToolbar
                : undefined
          }
        >
          {state.actionLog.length > 0 && !isExpanded && (
            <div
              className="absolute -top-3 -right-3 flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-white text-[10px] font-semibold select-none shadow-[0_1px_3px_rgba(0,0,0,0.15),inset_0_0_0_1px_rgba(255,255,255,0.04)]"
              style={{ background: `rgb(${SRGB_BLUE})` }}
            >
              {state.actionLog.length}
            </div>
          )}

          {!isExpanded && <SpiralSpinner visible />}

          {isExpanded && (
            <div className="flex items-center text-sm font-medium h-full">
              <div className="flex items-center gap-2 pl-3 pr-1">
                <SpiralSpinner visible={hasLabel} />
                <span
                  className="overflow-hidden text-ellipsis whitespace-nowrap max-w-60 bg-clip-text text-transparent animate-[expect-text-shimmer_3s_linear_infinite]"
                  style={{
                    background:
                      "linear-gradient(90deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,1) 50%, rgba(255,255,255,0.5) 100%)",
                    backgroundSize: "200% 100%",
                    WebkitBackgroundClip: "text",
                    backgroundClip: "text",
                    opacity: hasLabel ? 1 : 0,
                  }}
                >
                  {state.label || "Idle"}
                </span>
              </div>
              <ToolbarControls
                overlayVisible={state.overlayVisible}
                onToggleOverlay={toggleOverlay}
              />
              <button
                type="button"
                className="flex items-center justify-center size-8 rounded-full border-none bg-transparent p-0 cursor-pointer outline-none text-white/60 hover:text-white hover:bg-white/10 transition-colors duration-150 active:scale-[0.92]"
                onClick={toggleToolbar}
              >
                <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>

      {state.overlayVisible &&
        state.actionLog.map((action, index) => {
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
                transform: `translate(-50%, -50%)${hoveredAction === index ? " scale(1.1)" : ""}`,
                transition: "background-color 0.15s ease, transform 0.1s ease",
                animation: "expect-marker-in 0.25s cubic-bezier(0.22, 1, 0.36, 1) both",
              }}
              onMouseEnter={() => setHoveredAction(index)}
              onMouseLeave={() => setHoveredAction(undefined)}
            >
              {index + 1}
              {hoveredAction === index && (
                <div
                  className="absolute top-[calc(100%+10px)] left-1/2 px-3 py-2 bg-[#1a1a1a] text-white text-[13px] font-normal rounded-xl whitespace-nowrap overflow-hidden text-ellipsis leading-[1.4] pointer-events-none shadow-[0_4px_20px_rgba(0,0,0,0.3),0_0_0_1px_rgba(255,255,255,0.08)] min-w-[120px] max-w-[280px] text-center animate-[expect-tooltip-in_0.1s_ease-out_forwards]"
                  style={{ transform: "translateX(-50%)" }}
                >
                  {action.description}
                </div>
              )}
            </div>
          );
        })}

      {hoveredElementRect && (
        <div
          className="fixed pointer-events-none z-[2147483646] rounded-[3px]"
          style={{
            left: `${hoveredElementRect.x}px`,
            top: `${hoveredElementRect.y}px`,
            width: `${hoveredElementRect.width}px`,
            height: `${hoveredElementRect.height}px`,
            border: `2px solid rgb(${SRGB_BLUE})`,
            background: `rgba(${SRGB_BLUE}, 0.08)`,
          }}
        />
      )}

      {state.overlayVisible &&
        highlightRects.map((rect, index) => (
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

  setOverlayState((previous) => {
    const hasPosition = x >= 0 && y >= 0;
    return {
      ...previous,
      cursorX: hasPosition ? x : previous.cursorX,
      cursorY: hasPosition ? y : previous.cursorY,
      cursorSelector: selector ?? previous.cursorSelector,
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
      actionLog: [...previous.actionLog, { description, code, selector }].slice(-50),
    };
  });
};
