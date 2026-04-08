import { createRoot } from "react-dom/client";
// eslint-disable-next-line no-restricted-imports -- overlay runs in injected runtime, not the CLI React app; React Compiler doesn't apply
import { useState, useEffect, useRef } from "react";
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
  TOOLTIP_FLIP_THRESHOLD_PX,
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

const StarDots = () => {
  const dotSize = 6;
  const spread = 10;
  const cellSize = dotSize + spread * 2;
  const center = cellSize / 2 - dotSize / 2;

  const dots = [
    { x: center, y: 0, delay: 0, duration: 1400 },
    { x: center * 2, y: center, delay: 300, duration: 1700 },
    { x: center, y: center * 2, delay: 700, duration: 1500 },
    { x: 0, y: center, delay: 1000, duration: 1600 },
    { x: center, y: center, delay: 500, duration: 2200 },
  ];

  return (
    <span
      style={{
        display: "inline-block",
        position: "relative",
        width: `${cellSize}px`,
        height: `${cellSize}px`,
        flexShrink: 0,
      }}
    >
      {dots.map((dot, index) => {
        const isCenter = index === 4;
        return (
          <span
            key={index}
            style={{
              position: "absolute",
              left: `${dot.x}px`,
              top: `${dot.y}px`,
              width: `${dotSize}px`,
              height: `${dotSize}px`,
              borderRadius: "50%",
              backgroundColor: OVERLAY_BLUE,
              animation: isCenter
                ? `expect-dot-center ${dot.duration}ms ease-in-out infinite`
                : `expect-dot-orbit ${dot.duration}ms ease-in-out infinite`,
              animationDelay: `${dot.delay}ms`,
            }}
          />
        );
      })}
    </span>
  );
};

const CAROUSEL_DURATION_MS = 350;

const TextCarousel = ({ text }: { text: string }) => {
  const [items, setItems] = useState([{ text, id: 0 }]);
  const nextIdRef = useRef(1);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const current = items[items.length - 1];
    if (text === current.text) return;

    let commonPrefix = 0;
    const minLength = Math.min(text.length, current.text.length);
    while (commonPrefix < minLength && text[commonPrefix] === current.text[commonPrefix])
      commonPrefix++;
    let commonSuffix = 0;
    while (
      commonSuffix < minLength - commonPrefix &&
      text[text.length - 1 - commonSuffix] === current.text[current.text.length - 1 - commonSuffix]
    )
      commonSuffix++;
    const shared = commonPrefix + commonSuffix;
    const isTyping = shared >= Math.max(text.length, current.text.length) * 0.5;

    if (isTyping) {
      setItems([{ text, id: current.id }]);
      return;
    }

    const id = nextIdRef.current++;
    setItems((previous) => [...previous.slice(-1), { text, id }]);

    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setItems((previous) => previous.slice(-1));
    }, CAROUSEL_DURATION_MS);

    return () => clearTimeout(timeoutRef.current);
  }, [text, items]);

  return (
    <span
      style={{
        display: "inline-block",
        position: "relative",
        verticalAlign: "top",
        minWidth: 0,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        transform: "translateY(1.5px)",
      }}
    >
      {items.map((item, index) => {
        const isOutgoing = items.length > 1 && index === 0;
        const isIncoming = items.length > 1 && index === 1;
        return (
          <span
            key={item.id}
            style={{
              display: "inline-block",
              whiteSpace: "nowrap",
              maxWidth: "100%",
              overflow: "hidden",
              textOverflow: "ellipsis",
              position: isOutgoing ? "absolute" : undefined,
              left: isOutgoing ? 0 : undefined,
              top: isOutgoing ? 0 : undefined,
              background:
                "linear-gradient(90deg, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0.85) 35%, #fff 50%, rgba(255,255,255,0.85) 65%, rgba(255,255,255,0.85) 100%)",
              backgroundSize: "250% 100%",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              WebkitTextFillColor: "transparent",
              animation: [
                "expect-text-shimmer 4s ease-in-out infinite",
                isOutgoing
                  ? `expect-carousel-out ${CAROUSEL_DURATION_MS}ms cubic-bezier(0.22,1,0.36,1) forwards`
                  : isIncoming
                    ? `expect-carousel-in ${CAROUSEL_DURATION_MS}ms cubic-bezier(0.22,1,0.36,1) forwards`
                    : "",
              ]
                .filter(Boolean)
                .join(", "),
            }}
          >
            {item.text}
          </span>
        );
      })}
    </span>
  );
};

const AgentOverlay = () => {
  const [state, setState] = useState<OverlayState>(loadInitialState);
  const [cursorShape, setCursorShape] = useState<CursorShape>("pointer");
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

  useEffect(() => {
    if (!state.overlayVisible) return;
    const handleMouseMove = (event: MouseEvent) => {
      setState((previous) => ({
        ...previous,
        cursorX: event.clientX,
        cursorY: event.clientY,
        cursorPositioned: true,
      }));
    };
    window.addEventListener("mousemove", handleMouseMove, true);
    return () => window.removeEventListener("mousemove", handleMouseMove, true);
  }, [state.overlayVisible]);

  const hasLabel = Boolean(state.label);

  const spaceRight = viewport.width - cursorX - TOOLTIP_OFFSET_PX - TOOLTIP_VIEWPORT_PADDING_PX;
  const spaceLeft = cursorX - TOOLTIP_VIEWPORT_PADDING_PX;
  const tooltipFlipX = spaceRight < TOOLTIP_MAX_WIDTH_PX && spaceLeft > spaceRight;
  const tooltipMaxWidth = tooltipFlipX
    ? Math.min(TOOLTIP_MAX_WIDTH_PX, spaceLeft)
    : Math.min(TOOLTIP_MAX_WIDTH_PX, spaceRight);
  const tooltipFlipY = cursorY > viewport.height - TOOLTIP_FLIP_THRESHOLD_PX;

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
              className="absolute pointer-events-none"
              style={{
                left: tooltipFlipX ? undefined : "50px",
                right: tooltipFlipX ? "calc(100% - 4px)" : undefined,
                top: tooltipFlipY ? undefined : "50px",
                bottom: tooltipFlipY ? "calc(100% - 4px)" : undefined,
                maxWidth: `${tooltipMaxWidth}px`,
              }}
            >
              <div
                className="rounded-full py-4 px-6 text-white font-semibold text-[28px] leading-none antialiased animate-[expect-comment-in_0.25s_cubic-bezier(0.22,1,0.36,1)_both]"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "14px",
                  background: "#000",
                  border: `4px solid ${OVERLAY_BLUE}`,
                  boxShadow: "0 0 4px rgba(0,0,0,0.22)",
                  fontFamily: "'OpenRunde-Medium','Open_Runde',system-ui,sans-serif",
                  fontSynthesis: "none",
                  overflow: "hidden",
                }}
              >
                <StarDots />
                <TextCarousel text={state.label} />
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
