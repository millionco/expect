import { createRoot } from "react-dom/client";
// eslint-disable-next-line no-restricted-imports -- overlay runs in injected runtime, not the CLI React app; React Compiler doesn't apply
import { useState, useEffect, useRef } from "react";
// @ts-expect-error -- CSS imported as text via esbuild cssTextPlugin
import cssText from "../../../dist/overlay.css";

const CURSOR_SIZE_PX = 48;
const CURSOR_HEIGHT_PX = 53;
const TOOLTIP_MAX_WIDTH_PX = 200;
const TOOLTIP_GAP_PX = 4;
const VIEWPORT_PADDING_PX = 8;
const CURSOR_TRANSITION_MS = 300;

const SRGB_BLUE = "30, 123, 252";

const USER_CONTROL_KEY = "__expect_user_control__";
const USER_IN_CONTROL_KEY = "__expect_user_in_control__";
const STATE_KEY = "__expect_cursor_state__";

const SPIRAL_R = 3;
const SPIRAL_r = 1;
const SPIRAL_d = 3;
const SPIRAL_SCALE = 6.5;
const SPIRAL_BREATH = 1.2;
const SPIRAL_DURATION_MS = 1200;
const SPIRAL_PULSE_MS = 1100;
const SPIRAL_ROTATION_MS = 7000;
const SPIRAL_PARTICLE_COUNT = 50;
const SPIRAL_TRAIL_SPAN = 0.34;

type CursorAction = "idle" | "click" | "type";

interface HighlightRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface OverlayState {
  cursorX: number;
  cursorY: number;
  label: string;
  cursorPositioned: boolean;
  userInControl: boolean;
  userTookControl: boolean;
  showPrompt: boolean;
  cursorAction: CursorAction;
  clickCount: number;
  highlightRects: HighlightRect[];
}

interface CursorPersisted {
  relativeX: number;
  relativeY: number;
  label: string;
  positioned: boolean;
}

const getViewport = () => {
  const vv = window.visualViewport;
  return {
    width: vv?.width ?? window.innerWidth,
    height: vv?.height ?? window.innerHeight,
  };
};

const clampToViewport = (
  value: number,
  elementSize: number,
  viewportSize: number,
  padding: number,
): number => Math.max(padding, Math.min(value, viewportSize - elementSize - padding));

let saveCursorTimeout: ReturnType<typeof setTimeout> | undefined;
const saveCursorState = (state: CursorPersisted): void => {
  clearTimeout(saveCursorTimeout);
  saveCursorTimeout = setTimeout(() => {
    try {
      sessionStorage.setItem(STATE_KEY, JSON.stringify(state));
    } catch {}
  }, 500);
};

const loadCursorState = (): CursorPersisted | undefined => {
  try {
    const raw = sessionStorage.getItem(STATE_KEY);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
};

const loadInitialState = (): OverlayState => {
  let userTookControl = false;
  let userInControl = false;
  try {
    userTookControl = sessionStorage.getItem(USER_CONTROL_KEY) === "true";
    userInControl = sessionStorage.getItem(USER_IN_CONTROL_KEY) === "true";
  } catch {}

  const saved = loadCursorState();
  const viewport = getViewport();

  return {
    cursorX: saved?.positioned ? saved.relativeX * viewport.width : -1,
    cursorY: saved?.positioned ? saved.relativeY * viewport.height : -1,
    label: saved?.label ?? "",
    cursorPositioned: saved?.positioned ?? false,
    userInControl,
    userTookControl,
    showPrompt: false,
    cursorAction: "idle",
    clickCount: 0,
    highlightRects: [],
  };
};

const spiralPoint = (progress: number, detailScale: number) => {
  const t = progress * Math.PI * 2;
  const d = SPIRAL_d + detailScale * 0.25;
  const diff = SPIRAL_R - SPIRAL_r;
  const ratio = diff / SPIRAL_r;
  const scale = SPIRAL_SCALE + detailScale * SPIRAL_BREATH;
  return {
    x: 50 + (diff * Math.cos(t) + d * Math.cos(ratio * t)) * scale,
    y: 50 + (diff * Math.sin(t) - d * Math.sin(ratio * t)) * scale,
  };
};

const SpiralSpinner = ({ visible }: { visible: boolean }) => {
  const groupRef = useRef<SVGGElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  useEffect(() => {
    const group = groupRef.current;
    const pathEl = pathRef.current;
    if (!group || !pathEl) return;

    const SVG_NS = "http://www.w3.org/2000/svg";
    const particles: SVGCircleElement[] = [];
    for (let index = 0; index < SPIRAL_PARTICLE_COUNT; index++) {
      const circle = document.createElementNS(SVG_NS, "circle");
      circle.setAttribute("fill", "white");
      group.appendChild(circle);
      particles.push(circle);
    }
    const startedAt = performance.now();
    let frameId: number;

    const render = (now: number) => {
      frameId = requestAnimationFrame(render);
      if (!visibleRef.current) return;
      const time = now - startedAt;
      const progress = (time % SPIRAL_DURATION_MS) / SPIRAL_DURATION_MS;
      const pulseProgress = (time % SPIRAL_PULSE_MS) / SPIRAL_PULSE_MS;
      const detailScale = 0.52 + ((Math.sin(pulseProgress * Math.PI * 2 + 0.55) + 1) / 2) * 0.48;
      const rotation = -((time % SPIRAL_ROTATION_MS) / SPIRAL_ROTATION_MS) * 360;

      group.setAttribute("transform", `rotate(${rotation} 50 50)`);

      let pathD = "";
      for (let index = 0; index <= 480; index++) {
        const pt = spiralPoint(index / 480, detailScale);
        pathD += `${index === 0 ? "M" : "L"} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)} `;
      }
      pathEl.setAttribute("d", pathD);

      for (let index = 0; index < SPIRAL_PARTICLE_COUNT; index++) {
        const tailOffset = index / (SPIRAL_PARTICLE_COUNT - 1);
        const normalizedP = (((progress - tailOffset * SPIRAL_TRAIL_SPAN) % 1) + 1) % 1;
        const pt = spiralPoint(normalizedP, detailScale);
        const fade = Math.pow(1 - tailOffset, 0.56);
        particles[index].setAttribute("cx", pt.x.toFixed(1));
        particles[index].setAttribute("cy", pt.y.toFixed(1));
        particles[index].setAttribute("r", (1.2 + fade * 3.5).toFixed(1));
        particles[index].setAttribute("opacity", (0.04 + fade * 0.96).toFixed(2));
      }
    };

    frameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frameId);
  }, []);

  return (
    <div className="w-[16px] h-[16px] shrink-0">
      <svg className="w-full h-full overflow-hidden" viewBox="0 0 100 100" fill="none">
        <g ref={groupRef}>
          <path
            ref={pathRef}
            stroke="white"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            opacity="0.15"
          />
        </g>
      </svg>
    </div>
  );
};

const CursorSvg = () => (
  <svg
    width={CURSOR_SIZE_PX}
    height={CURSOR_HEIGHT_PX}
    viewBox="0 0 32 35"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <defs>
      <filter
        id="expect-cs"
        x="-4"
        y="-4"
        width="40"
        height="40"
        filterUnits="userSpaceOnUse"
        colorInterpolationFilters="sRGB"
      >
        <feFlood floodOpacity="0" result="bg" />
        <feColorMatrix
          in="SourceAlpha"
          type="matrix"
          values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
          result="ha"
        />
        <feOffset />
        <feGaussianBlur stdDeviation="2" />
        <feComposite in2="ha" operator="out" />
        <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.25 0" />
        <feBlend mode="normal" in2="bg" result="ds" />
        <feBlend mode="normal" in="SourceGraphic" in2="ds" result="shape" />
      </filter>
    </defs>
    <g filter="url(#expect-cs)">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M16.501 13.86L24.884 22.261C25.937 23.317 25.19 25.119 23.699 25.119L22.475 25.119L23.691 28.007C23.904 28.513 23.907 29.073 23.7 29.582C23.492 30.092 23.098 30.49 22.59 30.703C22.334 30.81 22.066 30.864 21.792 30.864C20.961 30.864 20.216 30.369 19.894 29.603L18.616 26.565L17.784 27.303C16.703 28.259 15 27.492 15 26.048V14.481C15 13.697 15.947 13.305 16.501 13.86Z"
        fill="#FFFFFF"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M15.999 15.129C15.999 14.998 16.159 14.932 16.25 15.025L24.159 22.95C24.59 23.382 24.284 24.119 23.674 24.119L20.97 24.118L22.769 28.394C22.996 28.934 22.742 29.555 22.203 29.781C21.662 30.008 21.042 29.755 20.816 29.216L18.998 24.892L17.139 26.539C16.723 26.907 16.081 26.651 16.007 26.127L15.999 26.026V15.129Z"
        fill={`rgb(${SRGB_BLUE})`}
      />
    </g>
  </svg>
);

const Glow = () => (
  <div className="fixed inset-0 pointer-events-none will-change-[box-shadow] contain-strict transform-gpu animate-[expect-glow-pulse_2s_ease-in-out_infinite]" />
);

interface GuardPromptProps {
  onCancel: () => void;
  onConfirm: () => void;
}

const GuardPrompt = ({ onCancel, onConfirm }: GuardPromptProps) => (
  <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-black/[0.92] text-white font-sans text-sm p-5 px-7 rounded-2xl z-[2147483647] pointer-events-auto flex-col items-center gap-3.5 shadow-[0_8px_32px_rgba(0,0,0,0.5)] text-center leading-normal flex">
    <div className="font-semibold text-[15px]">Agent is working</div>
    <div className="text-white/70 text-[13px]">
      Taking control may interrupt the current test run.
    </div>
    <div className="flex gap-2.5 mt-1">
      <button
        onClick={onCancel}
        className="px-5 py-2 rounded-[10px] border-none text-[13px] font-medium cursor-pointer font-sans bg-white/[0.12] text-white transition-opacity duration-150 hover:opacity-85"
      >
        Cancel
      </button>
      <button
        onClick={onConfirm}
        className="px-5 py-2 rounded-[10px] border-none text-[13px] font-medium cursor-pointer font-sans bg-expect-blue text-white transition-opacity duration-150 hover:opacity-85"
      >
        Take control
      </button>
    </div>
  </div>
);

interface TooltipPosition {
  left?: string;
  top?: string;
  right?: string;
  bottom?: string;
}

const computeTooltipPosition = (
  cursorX: number,
  cursorY: number,
  cursorPositioned: boolean,
  tooltipRef: React.RefObject<HTMLDivElement | null>,
): TooltipPosition => {
  if (!cursorPositioned) {
    return { right: `${VIEWPORT_PADDING_PX * 2}px`, bottom: `${VIEWPORT_PADDING_PX * 2}px` };
  }

  const viewport = getViewport();
  const cX = clampToViewport(cursorX - CURSOR_SIZE_PX / 2, CURSOR_SIZE_PX, viewport.width, 0);
  const cY = clampToViewport(cursorY - CURSOR_HEIGHT_PX / 2, CURSOR_HEIGHT_PX, viewport.height, 0);

  const tooltipRect = tooltipRef.current?.getBoundingClientRect();
  const tooltipWidth = tooltipRect?.width || TOOLTIP_MAX_WIDTH_PX;
  const tooltipHeight = tooltipRect?.height || 30;

  const rightOfCursor = cX + CURSOR_SIZE_PX + TOOLTIP_GAP_PX;
  const leftOfCursor = cX - tooltipWidth - TOOLTIP_GAP_PX;
  const fitsRight = rightOfCursor + tooltipWidth <= viewport.width - VIEWPORT_PADDING_PX;
  const rawTooltipX = fitsRight ? rightOfCursor : Math.max(VIEWPORT_PADDING_PX, leftOfCursor);

  const alignedWithCursor = cY;
  const belowCursor = cY + CURSOR_HEIGHT_PX + TOOLTIP_GAP_PX;
  const fitsAligned = alignedWithCursor + tooltipHeight <= viewport.height - VIEWPORT_PADDING_PX;
  const rawTooltipY = fitsAligned ? alignedWithCursor : belowCursor;

  return {
    left: `${clampToViewport(rawTooltipX, tooltipWidth, viewport.width, VIEWPORT_PADDING_PX)}px`,
    top: `${clampToViewport(rawTooltipY, tooltipHeight, viewport.height, VIEWPORT_PADDING_PX)}px`,
  };
};

const AgentOverlay = () => {
  const [state, setState] = useState<OverlayState>(loadInitialState);
  const tooltipRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    try {
      if (state.userTookControl) {
        sessionStorage.setItem(USER_CONTROL_KEY, "true");
      }
      if (state.userInControl) {
        sessionStorage.setItem(USER_IN_CONTROL_KEY, "true");
      } else {
        sessionStorage.removeItem(USER_IN_CONTROL_KEY);
      }
    } catch {}
  }, [state.userInControl, state.userTookControl]);

  const handleGuardClick = () => {
    setState((previous) => ({ ...previous, showPrompt: !previous.showPrompt }));
  };

  const handleCancelPrompt = () => {
    setState((previous) => ({ ...previous, showPrompt: false }));
  };

  const handleTakeControl = () => {
    setState((previous) => ({
      ...previous,
      showPrompt: false,
      userInControl: true,
      userTookControl: true,
      label: "You're in control",
    }));
  };

  const handleReturnControl = () => {
    setState((previous) => ({
      ...previous,
      userInControl: false,
      label: "Returned to agent",
      cursorPositioned: false,
    }));
  };

  const viewport = getViewport();
  const cursorX = state.cursorPositioned
    ? clampToViewport(state.cursorX - CURSOR_SIZE_PX / 2, CURSOR_SIZE_PX, viewport.width, 0)
    : -100;
  const cursorY = state.cursorPositioned
    ? clampToViewport(state.cursorY - CURSOR_HEIGHT_PX / 2, CURSOR_HEIGHT_PX, viewport.height, 0)
    : -100;

  const tooltipPos = computeTooltipPosition(
    state.cursorX,
    state.cursorY,
    state.cursorPositioned,
    tooltipRef,
  );

  const showCursor = state.cursorPositioned && !state.userInControl;
  const displayLabel = state.userInControl ? "You're in control" : state.label;

  return (
    <>
      <div
        className={`fixed inset-0 z-[2147483646] bg-transparent ${state.userInControl ? "pointer-events-none" : "pointer-events-auto cursor-not-allowed"}`}
        onClick={handleGuardClick}
      />

      {state.userInControl && (
        <button
          onClick={handleReturnControl}
          className="fixed bottom-4 right-4 pointer-events-auto bg-expect-blue text-white text-[13px] font-sans font-medium py-2 px-4 rounded-[10px] border-none cursor-pointer z-[2147483647] shadow-[0_4px_12px_rgba(0,0,0,0.25)] transition-opacity duration-150 hover:opacity-85"
        >
          Return to agent
        </button>
      )}

      {state.showPrompt && (
        <GuardPrompt onCancel={handleCancelPrompt} onConfirm={handleTakeControl} />
      )}

      <Glow />

      <div
        key={state.clickCount}
        className="fixed pointer-events-none z-[2147483647] will-change-[left,top] drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)]"
        style={{
          width: `${CURSOR_SIZE_PX}px`,
          height: `${CURSOR_HEIGHT_PX}px`,
          left: `${cursorX}px`,
          top: `${cursorY}px`,
          display: showCursor ? "" : "none",
          transition: `left ${CURSOR_TRANSITION_MS}ms cubic-bezier(0.25, 1, 0.5, 1), top ${CURSOR_TRANSITION_MS}ms cubic-bezier(0.25, 1, 0.5, 1)`,
          animation:
            state.cursorAction === "click" ? "expect-cursor-click 0.2s ease-out 1" : "none",
        }}
      >
        {state.cursorAction === "type" && (
          <div
            className="absolute text-[20px] leading-none font-bold"
            style={{
              left: `${CURSOR_SIZE_PX + 2}px`,
              top: "4px",
              color: `rgb(${SRGB_BLUE})`,
              animation: "expect-text-blink 1s step-end infinite",
            }}
          >
            |
          </div>
        )}
        <CursorSvg />
      </div>

      <div
        ref={tooltipRef}
        className="fixed pointer-events-none bg-expect-blue text-white text-[13px] font-sans font-[450] py-2 px-3.5 rounded-xl leading-[1.4] whitespace-pre-wrap break-all z-[2147483647] will-change-[left,top,opacity] shadow-[0_4px_12px_rgba(0,0,0,0.25)] flex items-start gap-2.5"
        style={{
          maxWidth: `${TOOLTIP_MAX_WIDTH_PX}px`,
          opacity: displayLabel ? 1 : 0,
          left: tooltipPos.left,
          top: tooltipPos.top,
          right: tooltipPos.right,
          bottom: tooltipPos.bottom,
          transition: `left ${CURSOR_TRANSITION_MS}ms cubic-bezier(0.25, 1, 0.5, 1), top ${CURSOR_TRANSITION_MS}ms cubic-bezier(0.25, 1, 0.5, 1), opacity 150ms ease`,
        }}
      >
        <SpiralSpinner visible={Boolean(displayLabel)} />
        <span className="bg-[linear-gradient(90deg,rgba(255,255,255,0.85)_0%,rgba(255,255,255,1)_50%,rgba(255,255,255,0.85)_100%)] bg-[length:200px_100%] bg-clip-text text-transparent animate-[expect-shimmer_3s_linear_infinite]">
          {displayLabel}
        </span>
      </div>

      {state.highlightRects.map((rect) => (
        <div
          key={`${rect.x}-${rect.y}-${rect.width}-${rect.height}`}
          className="fixed pointer-events-none z-[2147483646] rounded-[3px]"
          style={{
            left: `${rect.x}px`,
            top: `${rect.y}px`,
            width: `${rect.width}px`,
            height: `${rect.height}px`,
            border: `2px solid rgb(${SRGB_BLUE})`,
            boxShadow: `0 0 0 1px rgba(${SRGB_BLUE}, 0.3)`,
          }}
        />
      ))}
    </>
  );
};

let setOverlayState: ((updater: (previous: OverlayState) => OverlayState) => void) | undefined;

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

  createRoot(container).render(<AgentOverlay />);
};

export const updateCursor = (containerId: string, x: number, y: number, label: string): void => {
  if (!setOverlayState) {
    initAgentOverlay(containerId);
    if (!setOverlayState) return;
  }

  setOverlayState((previous) => {
    if (previous.userInControl) return previous;

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
  document.getElementById(containerId)?.remove();
  setOverlayState = undefined;
};

export const didUserTakeControl = (): boolean => {
  try {
    return sessionStorage.getItem(USER_CONTROL_KEY) === "true";
  } catch {
    return false;
  }
};

export const clearUserControl = (): void => {
  try {
    sessionStorage.removeItem(USER_CONTROL_KEY);
  } catch {}
};

export const highlightRefs = (containerId: string, rects: HighlightRect[]): void => {
  if (!setOverlayState) {
    initAgentOverlay(containerId);
    if (!setOverlayState) return;
  }

  setOverlayState((previous) => ({ ...previous, highlightRects: rects }));
};

export const clearHighlights = (_containerId: string): void => {
  if (!setOverlayState) return;
  setOverlayState((previous) => ({ ...previous, highlightRects: [] }));
};
