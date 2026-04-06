import { createRoot } from "react-dom/client";
// eslint-disable-next-line no-restricted-imports -- overlay runs in injected runtime, not the CLI React app; React Compiler doesn't apply
import { useState, useEffect, useRef } from "react";
import { Toaster, toast } from "sonner";
// @ts-expect-error -- CSS imported as text via esbuild cssTextPlugin
import cssText from "../../../dist/overlay.css";
// @ts-expect-error -- CSS imported as text via esbuild cssTextPlugin
import sonnerCssText from "sonner/dist/styles.css";

const CURSOR_SIZE_PX = 48;
const CURSOR_HEIGHT_PX = 53;
const VIEWPORT_PADDING_PX = 8;
const CURSOR_TRANSITION_MS = 300;

const SRGB_BLUE = "30, 123, 252";

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
type CursorShape = "pointer" | "text" | "hand" | "grab";

const CLICKABLE_SELECTOR =
  'a,button,[role="button"],[role="link"],[role="tab"],[role="menuitem"],select,summary,label[for]';

const detectCursorShape = (x: number, y: number): CursorShape => {
  const element = document.elementFromPoint(x, y);
  if (!element) return "pointer";

  const computedCursor = window.getComputedStyle(element).cursor;
  if (computedCursor === "text") return "text";
  if (computedCursor === "grab" || computedCursor === "grabbing") return "grab";
  if (computedCursor === "pointer") return "hand";

  if (element.closest(CLICKABLE_SELECTOR)) return "hand";

  const tag = element.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || (element as HTMLElement).isContentEditable)
    return "text";

  return "pointer";
};

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
  cursorAction: CursorAction;
  clickCount: number;
  highlightSelectors: string[];
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
  const saved = loadCursorState();
  const viewport = getViewport();

  return {
    cursorX: saved?.positioned ? saved.relativeX * viewport.width : -1,
    cursorY: saved?.positioned ? saved.relativeY * viewport.height : -1,
    label: saved?.label ?? "",
    cursorPositioned: saved?.positioned ?? false,
    cursorAction: "idle",
    clickCount: 0,
    highlightSelectors: [],
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
  const particlesRef = useRef<SVGCircleElement[]>([]);
  const startedAtRef = useRef(performance.now());
  const frameIdRef = useRef<number>(0);

  useEffect(() => {
    const group = groupRef.current;
    if (!group || particlesRef.current.length > 0) return;

    const SVG_NS = "http://www.w3.org/2000/svg";
    for (let index = 0; index < SPIRAL_PARTICLE_COUNT; index++) {
      const circle = document.createElementNS(SVG_NS, "circle");
      circle.setAttribute("fill", "white");
      group.appendChild(circle);
      particlesRef.current.push(circle);
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    const group = groupRef.current;
    const pathEl = pathRef.current;
    const particles = particlesRef.current;
    if (!group || !pathEl || particles.length === 0) return;

    const startedAt = startedAtRef.current;

    const render = (now: number) => {
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

      frameIdRef.current = requestAnimationFrame(render);
    };

    frameIdRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frameIdRef.current);
  }, [visible]);

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

const CursorShadowFilter = () => (
  <defs>
    <filter
      id="expect-cs"
      x="-2"
      y="-2"
      width="36"
      height="36"
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
      <feGaussianBlur stdDeviation="1" />
      <feComposite in2="ha" operator="out" />
      <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.22 0" />
      <feBlend mode="normal" in2="bg" result="ds" />
      <feBlend mode="normal" in="SourceGraphic" in2="ds" result="shape" />
    </filter>
  </defs>
);

const PointerCursor = () => (
  <svg
    width="37"
    height="41"
    viewBox="0 0 32 33"
    fill="none"
    style={{ position: "absolute", top: 0, left: 0 }}
  >
    <CursorShadowFilter />
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
        fill="#000000"
      />
    </g>
  </svg>
);

const TextCursor = () => (
  <svg
    width="39"
    height="39"
    viewBox="0 0 32 32"
    fill="none"
    style={{ position: "absolute", top: "1px", left: 0 }}
  >
    <CursorShadowFilter />
    <g filter="url(#expect-cs)">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M20.315 7.505C20.315 8.249 19.759 8.889 19.023 8.994C18.431 9.079 17.984 9.596 17.984 10.196V20.426C17.984 21.027 18.43 21.544 19.021 21.629C19.756 21.733 20.312 22.374 20.312 23.118C20.309 23.561 20.118 23.974 19.787 24.257C19.458 24.54 19.021 24.668 18.59 24.604C17.807 24.492 17.078 24.161 16.481 23.659C15.883 24.161 15.154 24.492 14.367 24.605C13.94 24.668 13.504 24.541 13.173 24.257C12.842 23.97 12.653 23.558 12.65 23.125C12.65 22.374 13.206 21.733 13.942 21.628C14.536 21.543 14.984 21.026 14.984 20.426V10.196C14.984 9.596 14.537 9.079 13.944 8.994C13.209 8.889 12.654 8.249 12.654 7.505C12.655 7.065 12.846 6.651 13.177 6.366C13.447 6.133 13.796 6.002 14.158 6.002H14.239L14.39 6.021C15.164 6.132 15.889 6.462 16.484 6.964C17.083 6.462 17.812 6.13 18.598 6.018C19.013 5.951 19.455 6.077 19.792 6.366C20.123 6.653 20.312 7.065 20.315 7.498V7.502V7.505Z"
        fill="#FFFFFF"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M14.087 8.003C15.169 8.158 15.985 9.101 15.985 10.195V20.425C15.985 21.519 15.167 22.462 14.083 22.617C13.836 22.652 13.65 22.867 13.65 23.117C13.651 23.263 13.714 23.401 13.824 23.497C13.935 23.591 14.08 23.635 14.226 23.614C15.148 23.482 15.978 22.943 16.481 22.16C16.985 22.943 17.814 23.482 18.737 23.614C18.879 23.635 19.027 23.591 19.137 23.496C19.248 23.401 19.311 23.263 19.312 23.117C19.312 22.867 19.126 22.652 18.879 22.617C17.799 22.462 16.985 21.52 16.985 20.425V10.195C16.985 9.101 17.801 8.158 18.883 8.003C19.13 7.968 19.316 7.753 19.316 7.503C19.315 7.358 19.251 7.219 19.141 7.123C19.03 7.029 18.885 6.983 18.74 7.006C17.818 7.139 16.988 7.677 16.484 8.46C15.98 7.677 15.151 7.139 14.229 7.006C14.206 7.003 14.182 7.001 14.158 7.001C14.038 7.001 13.921 7.044 13.829 7.123C13.718 7.219 13.655 7.357 13.654 7.504C13.654 7.753 13.84 7.968 14.087 8.003Z"
        fill="#000000"
      />
    </g>
  </svg>
);

const HandCursor = () => (
  <svg
    width="23"
    height="28"
    viewBox="0 0 19 23"
    fill="none"
    style={{ position: "absolute", top: "4px", left: "2px" }}
  >
    <CursorShadowFilter />
    <g filter="url(#expect-cs)">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M10.301 19.704C11.359 19.704 12.279 19.484 13.059 19.043C13.841 18.602 14.445 17.957 14.87 17.105C15.296 16.253 15.509 15.211 15.509 13.976V12.326C15.509 11.559 15.389 10.97 15.149 10.556C14.909 10.143 14.563 9.936 14.114 9.936V11.03C14.114 11.182 14.063 11.304 13.963 11.395C13.862 11.486 13.749 11.531 13.621 11.531C13.487 11.531 13.37 11.486 13.27 11.395C13.169 11.304 13.119 11.182 13.119 11.03V9.671C13.119 9.398 13.049 9.186 12.91 9.037C12.769 8.888 12.572 8.814 12.316 8.814C12.116 8.814 11.918 8.857 11.724 8.942V10.675C11.724 10.833 11.673 10.957 11.573 11.049C11.472 11.14 11.359 11.185 11.231 11.185C11.097 11.185 10.98 11.14 10.88 11.049C10.779 10.957 10.729 10.833 10.729 10.675V8.668C10.729 8.401 10.658 8.189 10.515 8.034C10.372 7.879 10.179 7.801 9.936 7.801C9.729 7.801 9.528 7.847 9.334 7.938V10.328C9.334 10.468 9.287 10.587 9.192 10.684C9.098 10.781 8.978 10.83 8.832 10.83C8.692 10.83 8.575 10.781 8.481 10.684C8.387 10.587 8.339 10.468 8.339 10.328V3.743C8.339 3.518 8.277 3.337 8.152 3.2C8.028 3.063 7.859 2.995 7.646 2.995C7.433 2.995 7.262 3.063 7.131 3.2C7 3.337 6.935 3.518 6.935 3.743V13.019C6.935 13.214 6.877 13.373 6.762 13.498C6.646 13.622 6.5 13.684 6.324 13.684C6.165 13.684 6.024 13.645 5.9 13.566C5.775 13.487 5.67 13.341 5.585 13.128L4.363 10.337C4.211 9.972 3.982 9.79 3.679 9.79C3.484 9.79 3.326 9.852 3.204 9.977C3.082 10.101 3.022 10.252 3.022 10.428C3.022 10.574 3.049 10.72 3.104 10.866L4.737 15.463C5.271 16.953 6.014 18.031 6.962 18.701C7.911 19.37 9.024 19.704 10.301 19.704Z"
        fill="#FFFFFF"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M10.265 20.762C8.707 20.762 7.383 20.345 6.292 19.513C5.2 18.68 4.366 17.442 3.788 15.8L2.155 11.194C2.106 11.049 2.069 10.897 2.041 10.738C2.014 10.58 2 10.437 2 10.31C2 9.835 2.158 9.468 2.475 9.206C2.79 8.945 3.162 8.814 3.587 8.814C3.898 8.814 4.177 8.904 4.427 9.083C4.676 9.262 4.876 9.532 5.029 9.89L5.749 11.669C5.767 11.711 5.795 11.732 5.831 11.732C5.88 11.732 5.904 11.705 5.904 11.651V3.806C5.904 3.253 6.068 2.814 6.397 2.488C6.725 2.163 7.141 2 7.646 2C8.145 2 8.557 2.163 8.882 2.488C9.207 2.814 9.37 3.253 9.37 3.806V6.917C9.607 6.85 9.838 6.816 10.064 6.816C10.453 6.816 10.784 6.918 11.058 7.122C11.331 7.326 11.523 7.604 11.633 7.957C11.912 7.86 12.186 7.811 12.454 7.811C12.83 7.811 13.148 7.906 13.406 8.098C13.665 8.289 13.843 8.549 13.94 8.878C14.766 8.884 15.407 9.176 15.86 9.753C16.313 10.331 16.54 11.143 16.54 12.188V14.095C16.54 15.505 16.275 16.708 15.746 17.702C15.217 18.697 14.481 19.454 13.539 19.978C12.596 20.501 11.505 20.762 10.265 20.762Z"
        fill="#000000"
      />
    </g>
  </svg>
);

const GrabCursor = () => (
  <svg
    width="25"
    height="26"
    viewBox="0 0 21 22"
    fill="none"
    style={{ position: "absolute", top: "4px", left: "4px" }}
  >
    <CursorShadowFilter />
    <g filter="url(#expect-cs)">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M10.5 18.5C12.5 18.5 14 17.8 15.1 16.5C16.2 15.2 16.75 13.5 16.75 11.5V9.75C16.75 9.1 16.6 8.6 16.3 8.25C16 7.9 15.6 7.75 15.15 7.75V8.75C15.15 8.9 15.1 9.02 15 9.1C14.9 9.18 14.8 9.22 14.68 9.22C14.55 9.22 14.44 9.18 14.35 9.1C14.26 9.02 14.21 8.9 14.21 8.75V7.5C14.21 7.25 14.14 7.05 14 6.92C13.86 6.79 13.67 6.72 13.43 6.72C13.23 6.72 13.04 6.76 12.86 6.84V8.4C12.86 8.55 12.81 8.67 12.72 8.75C12.62 8.83 12.51 8.87 12.39 8.87C12.26 8.87 12.15 8.83 12.05 8.75C11.96 8.67 11.91 8.55 11.91 8.4V6.5C11.91 6.25 11.84 6.05 11.7 5.92C11.56 5.78 11.38 5.72 11.15 5.72C10.95 5.72 10.76 5.76 10.58 5.84V8.05C10.58 8.18 10.53 8.29 10.44 8.38C10.35 8.47 10.24 8.52 10.1 8.52C9.96 8.52 9.85 8.47 9.76 8.38C9.67 8.29 9.62 8.18 9.62 8.05V5.72C9.62 5.47 9.55 5.27 9.42 5.14C9.28 5 9.1 4.93 8.88 4.93C8.66 4.93 8.49 5 8.37 5.14C8.24 5.27 8.18 5.47 8.18 5.72V13C8.18 13.2 8.12 13.35 8 13.47C7.89 13.59 7.75 13.65 7.58 13.65C7.42 13.65 7.28 13.61 7.16 13.54C7.04 13.46 6.94 13.32 6.86 13.12L5.7 10.4C5.55 10.05 5.33 9.87 5.04 9.87C4.85 9.87 4.7 9.93 4.58 10.05C4.46 10.17 4.4 10.32 4.4 10.49C4.4 10.63 4.43 10.77 4.48 10.91L6 15.2C6.5 16.6 7.2 17.6 8.1 18.2C9 18.8 10 18.5 10.5 18.5Z"
        fill="#FFFFFF"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M10.5 18.5C12.5 18.5 14 17.8 15.1 16.5C16.2 15.2 16.75 13.5 16.75 11.5V9.75C16.75 9.1 16.6 8.6 16.3 8.25C16 7.9 15.6 7.75 15.15 7.75V8.75C15.15 8.9 15.1 9.02 15 9.1C14.9 9.18 14.8 9.22 14.68 9.22C14.55 9.22 14.44 9.18 14.35 9.1C14.26 9.02 14.21 8.9 14.21 8.75V7.5C14.21 7.25 14.14 7.05 14 6.92C13.86 6.79 13.67 6.72 13.43 6.72C13.23 6.72 13.04 6.76 12.86 6.84V8.4C12.86 8.55 12.81 8.67 12.72 8.75C12.62 8.83 12.51 8.87 12.39 8.87C12.26 8.87 12.15 8.83 12.05 8.75C11.96 8.67 11.91 8.55 11.91 8.4V6.5C11.91 6.25 11.84 6.05 11.7 5.92C11.56 5.78 11.38 5.72 11.15 5.72C10.95 5.72 10.76 5.76 10.58 5.84V8.05C10.58 8.18 10.53 8.29 10.44 8.38C10.35 8.47 10.24 8.52 10.1 8.52C9.96 8.52 9.85 8.47 9.76 8.38C9.67 8.29 9.62 8.18 9.62 8.05V5.72C9.62 5.47 9.55 5.27 9.42 5.14C9.28 5 9.1 4.93 8.88 4.93C8.66 4.93 8.49 5 8.37 5.14C8.24 5.27 8.18 5.47 8.18 5.72V13C8.18 13.2 8.12 13.35 8 13.47C7.89 13.59 7.75 13.65 7.58 13.65C7.42 13.65 7.28 13.61 7.16 13.54C7.04 13.46 6.94 13.32 6.86 13.12L5.7 10.4C5.55 10.05 5.33 9.87 5.04 9.87C4.85 9.87 4.7 9.93 4.58 10.05C4.46 10.17 4.4 10.32 4.4 10.49C4.4 10.63 4.43 10.77 4.48 10.91L6 15.2C6.5 16.6 7.2 17.6 8.1 18.2C9 18.8 10 18.5 10.5 18.5Z"
        fill="#000000"
      />
    </g>
  </svg>
);

const CursorIcon = ({ shape }: { shape: CursorShape }) => {
  if (shape === "text") return <TextCursor />;
  if (shape === "hand") return <HandCursor />;
  if (shape === "grab") return <GrabCursor />;
  return <PointerCursor />;
};

const Glow = () => (
  <div className="fixed inset-0 pointer-events-none will-change-[box-shadow] contain-strict transform-gpu animate-[expect-glow-pulse_2s_ease-in-out_infinite]" />
);

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
    toast(state.label, {
      duration: Infinity,
      icon: <SpiralSpinner visible />,
    });
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

      <Toaster
        position="bottom-right"
        visibleToasts={3}
        expand={false}
        toastOptions={{
          style: {
            background: "#1c1c1c",
            color: "white",
            border: "none",
            fontSize: "14px",
            fontFamily: '"SFProDisplay-Medium", "SF Pro Display", system-ui, sans-serif',
            fontWeight: 500,
            boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)",
            borderRadius: "12px",
            maxWidth: "320px",
          },
        }}
      />

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
  clearTimeout(saveCursorTimeout);
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
