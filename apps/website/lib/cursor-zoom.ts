export interface CursorZoomOptions {
  scale?: number;
  idleMs?: number;
  zoomInMs?: number;
  followMs?: number;
  zoomOutMs?: number;
  zoomInEasing?: string;
  followEasing?: string;
  zoomOutEasing?: string;
  mapCursor?: (x: number, y: number) => { x: number; y: number };
}

const CURSOR_SIZE_DEFAULT_PX = 72;
const CURSOR_SIZE_ZOOMED_PX = 96;

const DEFAULTS: Required<Omit<CursorZoomOptions, "mapCursor">> = {
  scale: 2,
  idleMs: 500,
  zoomInMs: 500,
  followMs: 250,
  zoomOutMs: 600,
  zoomInEasing: "cubic-bezier(0.34, 1.56, 0.64, 1)",
  followEasing: "cubic-bezier(0.0, 0, 0.2, 1)",
  zoomOutEasing: "cubic-bezier(0.4, 0, 0.2, 1)",
};

const identity = (x: number, y: number) => ({ x, y });

export const createCursorZoom = (
  container: HTMLElement,
  target: HTMLElement,
  cursorEl: HTMLElement,
  options: CursorZoomOptions = {},
) => {
  const config = { ...DEFAULTS, ...options };
  const mapCursor = options.mapCursor ?? identity;
  let idleTimer: ReturnType<typeof setTimeout>;
  let isZoomed = false;
  let lastLeft = "";
  let lastTop = "";

  target.style.transformOrigin = "0 0";
  target.style.willChange = "transform";

  const applyTransform = (
    scale: number,
    translateX: number,
    translateY: number,
    durationMs: number,
    easing: string,
  ) => {
    target.style.transition = `transform ${durationMs}ms ${easing}`;
    target.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
  };

  const updateCursorSize = (zoomed: boolean) => {
    const size = `${zoomed ? CURSOR_SIZE_ZOOMED_PX : CURSOR_SIZE_DEFAULT_PX}px`;
    cursorEl.style.width = size;
    cursorEl.style.height = size;
  };

  const panTo = (scale: number, mouseX: number, mouseY: number) => {
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    const targetWidth = target.offsetWidth;
    const targetHeight = target.offsetHeight;

    const translateX = Math.min(
      0,
      Math.max(containerWidth - targetWidth * scale, containerWidth / 2 - mouseX * scale),
    );
    const translateY = Math.min(
      0,
      Math.max(containerHeight - targetHeight * scale, containerHeight / 2 - mouseY * scale),
    );

    applyTransform(
      scale,
      translateX,
      translateY,
      isZoomed ? config.followMs : config.zoomInMs,
      isZoomed ? config.followEasing : config.zoomInEasing,
    );
    isZoomed = true;
    updateCursorSize(true);
  };

  const reset = () => {
    isZoomed = false;
    updateCursorSize(false);
    applyTransform(1, 0, 0, config.zoomOutMs, config.zoomOutEasing);
  };

  reset();

  const cursorObserver = new MutationObserver(() => {
    const currentLeft = cursorEl.style.left;
    const currentTop = cursorEl.style.top;
    if (currentLeft === lastLeft && currentTop === lastTop) return;
    lastLeft = currentLeft;
    lastTop = currentTop;

    const rawX = parseFloat(currentLeft) || 0;
    const rawY = parseFloat(currentTop) || 0;
    const { x, y } = mapCursor(rawX, rawY);

    panTo(config.scale, x, y);

    clearTimeout(idleTimer);
    idleTimer = setTimeout(reset, config.idleMs);
  });

  cursorObserver.observe(cursorEl, {
    attributes: true,
    attributeFilter: ["style"],
  });

  const iframe = target.querySelector("iframe");
  let inputObserver: MutationObserver | undefined;

  if (iframe?.contentDocument) {
    inputObserver = new MutationObserver(() => {
      if (isZoomed) {
        clearTimeout(idleTimer);
        reset();
      }
    });
    inputObserver.observe(iframe.contentDocument, {
      characterData: true,
      subtree: true,
      childList: true,
    });
  }

  return () => {
    cursorObserver.disconnect();
    inputObserver?.disconnect();
    clearTimeout(idleTimer);
    target.style.willChange = "";
  };
};
