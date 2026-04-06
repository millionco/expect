import { createRoot } from "react-dom/client";
// eslint-disable-next-line no-restricted-imports -- overlay runs in injected runtime, not the CLI React app; React Compiler doesn't apply
import { useState, useEffect } from "react";
import { Toaster, toast } from "sonner";
// @ts-expect-error -- CSS imported as text via esbuild cssTextPlugin
import cssText from "../../../dist/overlay.css";
// @ts-expect-error -- CSS imported as text via esbuild cssTextPlugin
import sonnerCssText from "sonner/dist/styles.css";

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
import { CursorIcon, detectCursorShape } from "./cursors";
import { SpiralSpinner } from "./spiral-spinner";
import { Glow } from "./glow";

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

  const viewport = getViewport();
  const cursorX = state.cursorPositioned
    ? clampToViewport(state.cursorX - CURSOR_SIZE_PX / 2, CURSOR_SIZE_PX, viewport.width, 0)
    : viewport.width + CURSOR_SIZE_PX;
  const cursorY = state.cursorPositioned
    ? clampToViewport(state.cursorY - CURSOR_HEIGHT_PX / 2, CURSOR_HEIGHT_PX, viewport.height, 0)
    : viewport.height + CURSOR_HEIGHT_PX;

  useEffect(() => {
    if (!state.label) return;
    toast(
      () => (
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <SpiralSpinner visible />
          <span>{state.label}</span>
        </div>
      ),
      {
        duration: Infinity,
        unstyled: true,
        style: {
          background: "#1c1c1c",
          color: "white",
          fontSize: "14px",
          fontFamily: '"SFProDisplay-Medium", "SF Pro Display", system-ui, sans-serif',
          fontWeight: 500,
          boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)",
          borderRadius: "12px",
          padding: "12px 16px",
          maxWidth: "320px",
          width: "fit-content",
        },
      },
    );
  }, [state.label]);

  const [cursorShape, setCursorShape] = useState<CursorShape>("pointer");

  useEffect(() => {
    if (!state.cursorPositioned) return;
    setCursorShape(detectCursorShape(state.cursorX, state.cursorY));
  }, [state.cursorX, state.cursorY, state.cursorPositioned]);

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

      <div className="fixed bottom-0 right-0 z-[2147483647]" style={{ pointerEvents: "auto" }}>
        <Toaster position="bottom-right" visibleToasts={3} expand={false} />
      </div>

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
  const overlayStyles = typeof cssText === "string" ? cssText : "";
  const sonnerStyles = typeof sonnerCssText === "string" ? sonnerCssText : "";
  style.textContent = `${overlayStyles}\n${sonnerStyles}`;
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
