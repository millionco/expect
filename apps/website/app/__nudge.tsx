"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { Calligraph } from "calligraph";

export interface NudgeConfig {
  property: string;
  value: string;
  original: string;
  type: "numeric" | "color" | "options";
  step?: number;
  min?: number;
  max?: number;
  options?: (string | number)[];
  file?: string;
  line?: string;
}

// ---------------------------------------------------------------------------
// Color helpers — format-preserving lightness stepping
// ---------------------------------------------------------------------------

function rgbToHSL(r: number, g: number, b: number) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  let h = 0,
    s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

function pad(n: number) {
  const s = n.toString(16);
  return s.length < 2 ? "0" + s : s;
}

function hslToRGB(h: number, s: number, l: number) {
  h /= 360;
  s /= 100;
  l /= 100;
  function hue2rgb(p: number, q: number, t: number) {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  }
  if (s === 0) return { r: l, g: l, b: l };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: hue2rgb(p, q, h + 1 / 3),
    g: hue2rgb(p, q, h),
    b: hue2rgb(p, q, h - 1 / 3),
  };
}

/**
 * Detects the CSS color format of `css`, adjusts lightness by `direction * 2%`,
 * and returns the result in the **same format**. Handles hex, rgb(), hsl(),
 * color(display-p3 ...), and oklch(). Falls back to browser resolution for
 * named colors or unknown formats, outputting hex.
 */
function stepColor(css: string, direction: number): string | null {
  const STEP = direction * 2;

  // --- hex (#rgb, #rrggbb, #rrggbbaa) ---
  if (/^#[0-9a-f]{3,8}$/i.test(css)) {
    let hex = css;
    if (hex.length === 4)
      hex = "#" + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const hsl = rgbToHSL(r, g, b);
    hsl.l = clamp(hsl.l + STEP, 0, 100);
    const out = hslToRGB(hsl.h, hsl.s, hsl.l);
    return (
      "#" +
      pad(Math.round(out.r * 255)) +
      pad(Math.round(out.g * 255)) +
      pad(Math.round(out.b * 255))
    );
  }

  // --- color(display-p3 r g b) — values 0-1 ---
  const p3 = css.match(
    /color\(\s*display-p3\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)/
  );
  if (p3) {
    const hsl = rgbToHSL(+p3[1] * 255, +p3[2] * 255, +p3[3] * 255);
    hsl.l = clamp(hsl.l + STEP, 0, 100);
    const out = hslToRGB(hsl.h, hsl.s, hsl.l);
    return `color(display-p3 ${out.r.toFixed(4)} ${out.g.toFixed(4)} ${out.b.toFixed(4)})`;
  }

  // --- oklch(L C H) — L is 0-1 or 0%-100% ---
  const ok = css.match(
    /oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)\s*\)/
  );
  if (ok) {
    const pct = ok[1].endsWith("%");
    let l = parseFloat(ok[1]);
    if (pct) {
      l = clamp(l + STEP, 0, 100);
      return `oklch(${l.toFixed(2)}% ${ok[2]} ${ok[3]})`;
    }
    l = clamp(l + direction * 0.02, 0, 1);
    return `oklch(${l.toFixed(4)} ${ok[2]} ${ok[3]})`;
  }

  // --- rgb(r, g, b) / rgba(r, g, b, a) ---
  const rgb = css.match(
    /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/
  );
  if (rgb) {
    const hsl = rgbToHSL(+rgb[1], +rgb[2], +rgb[3]);
    hsl.l = clamp(hsl.l + STEP, 0, 100);
    const out = hslToRGB(hsl.h, hsl.s, hsl.l);
    return (
      "#" +
      pad(Math.round(out.r * 255)) +
      pad(Math.round(out.g * 255)) +
      pad(Math.round(out.b * 255))
    );
  }

  // --- hsl(h, s%, l%) ---
  const hsl = css.match(
    /hsla?\(\s*([\d.]+)[,\s]+([\d.]+)%?[,\s]+([\d.]+)%?/
  );
  if (hsl) {
    const l = clamp(+hsl[3] + STEP, 0, 100);
    return `hsl(${hsl[1]}, ${hsl[2]}%, ${l}%)`;
  }

  // --- Fallback: resolve through browser, output hex ---
  const el = document.createElement("div");
  el.style.color = css;
  document.body.appendChild(el);
  const computed = getComputedStyle(el).color;
  el.remove();
  const m = computed.match(
    /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/
  );
  if (!m) return null;
  const fhsl = rgbToHSL(+m[1], +m[2], +m[3]);
  fhsl.l = clamp(fhsl.l + STEP, 0, 100);
  const fout = hslToRGB(fhsl.h, fhsl.s, fhsl.l);
  return (
    "#" +
    pad(Math.round(fout.r * 255)) +
    pad(Math.round(fout.g * 255)) +
    pad(Math.round(fout.b * 255))
  );
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

// ---------------------------------------------------------------------------
// SVG presentation attributes
// ---------------------------------------------------------------------------

const SVG_ATTRS = new Set([
  "fill",
  "stroke",
  "stroke-width",
  "stroke-dasharray",
  "stroke-dashoffset",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-opacity",
  "fill-opacity",
  "opacity",
  "stop-color",
  "stop-opacity",
  "flood-color",
  "flood-opacity",
]);

function isSvgAttr(el: Element, prop: string) {
  return el instanceof SVGElement && SVG_ATTRS.has(prop);
}

// ---------------------------------------------------------------------------
// Clipboard
// ---------------------------------------------------------------------------

function copyToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text: string) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.cssText = "position:fixed;opacity:0;pointer-events:none;";
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand("copy");
  } catch {}
  ta.remove();
}

// ---------------------------------------------------------------------------
// Config hash for sessionStorage dismiss
// ---------------------------------------------------------------------------

function configHash(c: NudgeConfig) {
  return c.property + ":" + c.original + ":" + c.value;
}

function getProps(property: string) {
  return property.split(",").map((p) => p.trim());
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function Nudge({ config }: { config?: NudgeConfig | null }) {
  if (process.env.NODE_ENV === "production") return null;

  const [mounted, setMounted] = useState(false);
  const [targetEl, setTargetEl] = useState<Element | null>(null);
  const [currentValue, setCurrentValue] = useState("");
  const [dismissed, setDismissed] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [barVisible, setBarVisible] = useState(false);
  const [barMounted, setBarMounted] = useState(false);
  const exitTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const lastIsColorRef = useRef(false);

  if (config) lastIsColorRef.current = config.type === "color";
  const [activeKey, setActiveKey] = useState<"up" | "down" | null>(null);
  const [isNudging, setIsNudging] = useState(false);

  const savedValueRef = useRef("");
  const numericRef = useRef(0);
  const unitRef = useRef("");
  const optionIndexRef = useRef(0);
  const currentValueRef = useRef("");
  const nudgeTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const stepValueRef = useRef<(direction: number, shift: boolean) => void>();

  const triggerNudge = useCallback(
    (dir: "up" | "down") => {
      const direction = dir === "up" ? 1 : -1;
      stepValueRef.current?.(direction, false);
      setActiveKey(dir);
      setIsNudging(true);
      clearTimeout(nudgeTimeoutRef.current);
      nudgeTimeoutRef.current = setTimeout(() => setIsNudging(false), 600);
      setTimeout(() => setActiveKey(null), 100);
    },
    []
  );

  useEffect(() => {
    setMounted(true);
    if (!document.querySelector('link[href*="open-runde"]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://fonts.cdnfonts.com/css/open-runde";
      document.head.appendChild(link);
    }
  }, []);

  // Reset state when config changes
  useEffect(() => {
    if (!config) {
      setTargetEl(null);
      setDismissed(false);
      return;
    }

    const hash = configHash(config);
    if (sessionStorage.getItem("__ndg_dismissed") === hash) {
      setDismissed(true);
      return;
    }

    setDismissed(false);
    setCurrentValue(config.value);
    currentValueRef.current = config.value;

    const isColor = config.type === "color";
    const isOptions =
      config.type === "options" && config.options && config.options.length > 0;

    if (isOptions) {
      const idx = config.options!.findIndex(
        (o) => String(o) === String(config.value)
      );
      optionIndexRef.current = idx >= 0 ? idx : 0;
    } else if (!isColor) {
      const match = String(config.value).match(/([\d.]+)\s*(.*)/);
      unitRef.current = match ? match[2] : "";
      numericRef.current = parseFloat(config.value) || 0;
    }
  }, [config]);

  useEffect(() => {
    if (isNudging && targetEl) {
      targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [isNudging, targetEl]);

  const shouldShow = mounted && !!config && !!targetEl && !dismissed;
  useEffect(() => {
    clearTimeout(exitTimeoutRef.current);
    if (shouldShow) {
      setBarMounted(true);
      exitTimeoutRef.current = setTimeout(() => setBarVisible(true), 30);
    } else {
      setBarVisible(false);
      exitTimeoutRef.current = setTimeout(() => setBarMounted(false), 400);
    }
    return () => clearTimeout(exitTimeoutRef.current);
  }, [shouldShow]);

  // Find target element
  useEffect(() => {
    if (!config || dismissed) {
      setTargetEl(null);
      return;
    }

    const find = () =>
      document.querySelector("[data-nudge-target]") as Element | null;
    const firstProp = getProps(config.property)[0];
    const found = find();
    if (found) {
      const useSvg = isSvgAttr(found, firstProp);
      savedValueRef.current = useSvg
        ? found.getAttribute(firstProp) || ""
        : (found as HTMLElement).style.getPropertyValue(firstProp);
      setTargetEl(found);
      return;
    }

    const observer = new MutationObserver(() => {
      const el = find();
      if (el) {
        observer.disconnect();
        const useSvg = isSvgAttr(el, firstProp);
        savedValueRef.current = useSvg
          ? el.getAttribute(firstProp) || ""
          : (el as HTMLElement).style.getPropertyValue(firstProp);
        setTargetEl(el);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [config, dismissed]);

  const applyPreview = useCallback(
    (el: Element, val: string) => {
      if (!config) return;
      for (const prop of getProps(config.property)) {
        if (isSvgAttr(el, prop)) {
          el.setAttribute(prop, val);
        } else {
          (el as HTMLElement).style.setProperty(prop, val);
        }
      }
    },
    [config]
  );

  const dismiss = useCallback(() => {
    if (config) {
      sessionStorage.setItem("__ndg_dismissed", configHash(config));
    }
    if (targetEl) {
      targetEl.removeAttribute("data-nudge-target");
    }
    setDismissed(true);
    setTargetEl(null);
  }, [config, targetEl]);

  // Keyboard handler
  useEffect(() => {
    if (!config || !targetEl || dismissed) return;

    const isColor = config.type === "color";
    const isOptions =
      config.type === "options" && config.options && config.options.length > 0;
    const step = config.step ?? 1;
    const min = config.min ?? -9999;
    const max = config.max ?? 9999;

    function stepValue(direction: number, shift: boolean) {
      let next: string;

      if (isOptions) {
        optionIndexRef.current = clamp(
          optionIndexRef.current + direction,
          0,
          config!.options!.length - 1
        );
        next = String(config!.options![optionIndexRef.current]);
      } else if (isColor) {
        const stepped = stepColor(currentValueRef.current, direction);
        if (!stepped) return;
        next = stepped;
      } else {
        const s = step >= 1 ? 1 : step;
        const mult = shift ? 10 : 1;
        numericRef.current =
          Math.round((numericRef.current + direction * s * mult) * 1000) / 1000;
        numericRef.current = clamp(numericRef.current, min, max);
        next = unitRef.current
          ? numericRef.current + unitRef.current
          : String(numericRef.current);
      }

      applyPreview(targetEl!, next);
      currentValueRef.current = next;
      setCurrentValue(next);
    }

    stepValueRef.current = stepValue;

    function buildPrompt() {
      const parts = [
        "Set `" + config!.property + "` to `" + currentValueRef.current + "`",
      ];
      if (config!.file) {
        parts.push("in `" + config!.file + "`");
        if (config!.line) parts.push("at line " + config!.line);
      }
      parts.push(
        "— also apply this change to any related or sibling elements/components nearby that share the same style, where it makes logical sense to keep them consistent"
      );
      return parts.join(" ");
    }

    function handleSubmit() {
      copyToClipboard(buildPrompt());
      setConfirmed(true);
      setIsNudging(true);
      clearTimeout(nudgeTimeoutRef.current);
      nudgeTimeoutRef.current = setTimeout(() => {
        setConfirmed(false);
        dismiss();
      }, 800);
    }

    function handleCancel() {
      for (const prop of getProps(config!.property)) {
        const useSvg = isSvgAttr(targetEl!, prop);
        if (useSvg) {
          if (savedValueRef.current) {
            targetEl!.setAttribute(prop, savedValueRef.current);
          } else {
            targetEl!.removeAttribute(prop);
          }
        } else {
          if (savedValueRef.current) {
            (targetEl! as HTMLElement).style.setProperty(
              prop,
              savedValueRef.current
            );
          } else {
            (targetEl! as HTMLElement).style.removeProperty(prop);
          }
        }
      }
      dismiss();
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        const orig = config!.original;
        applyPreview(targetEl!, orig);
        currentValueRef.current = orig;
        setCurrentValue(orig);
        const match = String(orig).match(/([\d.]+)\s*(.*)/);
        if (match) {
          numericRef.current = parseFloat(orig) || 0;
          unitRef.current = match[2];
        }
        setIsNudging(true);
        clearTimeout(nudgeTimeoutRef.current);
        nudgeTimeoutRef.current = setTimeout(() => setIsNudging(false), 600);
      } else if (e.key === "Escape") {
        e.preventDefault();
        handleCancel();
      } else if (e.key === "Enter") {
        e.preventDefault();
        handleSubmit();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        stepValue(1, e.shiftKey);
        setActiveKey("up");
        setIsNudging(true);
        clearTimeout(nudgeTimeoutRef.current);
        nudgeTimeoutRef.current = setTimeout(() => setIsNudging(false), 600);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        stepValue(-1, e.shiftKey);
        setActiveKey("down");
        setIsNudging(true);
        clearTimeout(nudgeTimeoutRef.current);
        nudgeTimeoutRef.current = setTimeout(() => setIsNudging(false), 600);
      }
    }

    function onKeyUp(e: KeyboardEvent) {
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        setActiveKey(null);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
      clearTimeout(nudgeTimeoutRef.current);
    };
  }, [config, targetEl, dismissed, applyPreview, dismiss]);

  if (!barMounted && !(mounted && toastMsg)) return null;

  return createPortal(
    <>
      {barMounted && (
        <Bar
          value={currentValue}
          activeKey={activeKey}
          isColor={lastIsColorRef.current}
          expanded={isNudging}
          onNudge={triggerNudge}
          confirmed={confirmed}
          visible={barVisible}
        />
      )}
      {toastMsg && <Toast message={toastMsg} />}
    </>,
    document.body
  );
}

// ---------------------------------------------------------------------------
// Guidelines — property-aware visualization
// ---------------------------------------------------------------------------

const GUIDE_COLOR = "#3B82F6";
const GUIDE_FILL = "rgba(59, 130, 246, 0.13)";

function activeSides(property: string) {
  const p = property;
  if (
    !p.includes("-") ||
    p === "border-radius" ||
    p === "font-size" ||
    p === "line-height"
  )
    return { top: true, right: true, bottom: true, left: true };
  if (p.endsWith("-top") || p.endsWith("-block-start"))
    return { top: true, right: false, bottom: false, left: false };
  if (p.endsWith("-right") || p.endsWith("-inline-end"))
    return { top: false, right: true, bottom: false, left: false };
  if (p.endsWith("-bottom") || p.endsWith("-block-end"))
    return { top: false, right: false, bottom: true, left: false };
  if (p.endsWith("-left") || p.endsWith("-inline-start"))
    return { top: false, right: false, bottom: false, left: true };
  if (p.includes("-block"))
    return { top: true, right: false, bottom: true, left: false };
  if (p.includes("-inline"))
    return { top: false, right: true, bottom: false, left: true };
  return { top: true, right: true, bottom: true, left: true };
}

function Guidelines({
  target,
  expanded,
  property,
}: {
  target: Element;
  expanded: boolean;
  property: string;
}) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [cs, setCs] = useState<CSSStyleDeclaration | null>(null);

  useEffect(() => {
    if (!target) return;
    const update = () => {
      setRect(target.getBoundingClientRect());
      setCs(getComputedStyle(target));
    };
    update();
    if (!expanded) return;
    const id = setInterval(update, 60);
    return () => clearInterval(id);
  }, [target, expanded]);

  if (!rect || !cs) return null;

  const base: React.CSSProperties = {
    position: "fixed",
    pointerEvents: "none",
    zIndex: 2147483646,
    opacity: expanded ? 1 : 0,
    transition: expanded ? "opacity 0.25s ease 0.05s" : "opacity 0.2s ease",
  };

  const outline = null;

  const fill = (
    l: number,
    t: number,
    w: number,
    h: number,
    key: string
  ) =>
    w > 0 && h > 0 ? (
      <div key={key} style={{ ...base, left: l, top: t, width: w, height: h, background: GUIDE_FILL }} />
    ) : null;

  const isPadding = property.startsWith("padding");
  const isMargin = property.startsWith("margin");
  const isWidth =
    property === "width" ||
    property === "max-width" ||
    property === "min-width";
  const isHeight =
    property === "height" ||
    property === "max-height" ||
    property === "min-height";
  const isGap =
    property === "gap" ||
    property === "row-gap" ||
    property === "column-gap";

  if (isPadding) {
    const pt = parseFloat(cs.paddingTop) || 0;
    const pr = parseFloat(cs.paddingRight) || 0;
    const pb = parseFloat(cs.paddingBottom) || 0;
    const pl = parseFloat(cs.paddingLeft) || 0;
    const s = activeSides(property);
    return (
      <>
        {outline}
        {s.top && fill(rect.left, rect.top, rect.width, pt, "pt")}
        {s.bottom && fill(rect.left, rect.bottom - pb, rect.width, pb, "pb")}
        {s.left &&
          fill(
            rect.left,
            rect.top + (s.top ? pt : 0),
            pl,
            rect.height - (s.top ? pt : 0) - (s.bottom ? pb : 0),
            "pl"
          )}
        {s.right &&
          fill(
            rect.right - pr,
            rect.top + (s.top ? pt : 0),
            pr,
            rect.height - (s.top ? pt : 0) - (s.bottom ? pb : 0),
            "pr"
          )}
      </>
    );
  }

  if (isMargin) {
    const mt = parseFloat(cs.marginTop) || 0;
    const mr = parseFloat(cs.marginRight) || 0;
    const mb = parseFloat(cs.marginBottom) || 0;
    const ml = parseFloat(cs.marginLeft) || 0;
    const s = activeSides(property);
    return (
      <>
        {outline}
        {s.top && fill(rect.left, rect.top - mt, rect.width, mt, "mt")}
        {s.bottom && fill(rect.left, rect.bottom, rect.width, mb, "mb")}
        {s.left && fill(rect.left - ml, rect.top, ml, rect.height, "ml")}
        {s.right && fill(rect.right, rect.top, mr, rect.height, "mr")}
      </>
    );
  }

  if (isWidth) {
    const cy = rect.top + rect.height / 2;
    return (
      <>
        {outline}
        <div
          style={{ ...base, left: rect.left, top: cy, width: rect.width, height: 1, background: GUIDE_COLOR, opacity: expanded ? 0.7 : 0 }}
        />
        <div
          style={{ ...base, left: rect.left, top: cy - 4, width: 1, height: 9, background: GUIDE_COLOR, opacity: expanded ? 0.7 : 0 }}
        />
        <div
          style={{ ...base, left: rect.right - 1, top: cy - 4, width: 1, height: 9, background: GUIDE_COLOR, opacity: expanded ? 0.7 : 0 }}
        />
      </>
    );
  }

  if (isHeight) {
    const cx = rect.left + rect.width / 2;
    return (
      <>
        {outline}
        <div
          style={{ ...base, left: cx, top: rect.top, width: 1, height: rect.height, background: GUIDE_COLOR, opacity: expanded ? 0.7 : 0 }}
        />
        <div
          style={{ ...base, left: cx - 4, top: rect.top, width: 9, height: 1, background: GUIDE_COLOR, opacity: expanded ? 0.7 : 0 }}
        />
        <div
          style={{ ...base, left: cx - 4, top: rect.bottom - 1, width: 9, height: 1, background: GUIDE_COLOR, opacity: expanded ? 0.7 : 0 }}
        />
      </>
    );
  }

  if (isGap) {
    const children = Array.from(target.children);
    if (children.length < 2) return outline;
    const rects = children.map((c) => c.getBoundingClientRect());
    const dir = cs.flexDirection || "row";
    const isRow = dir === "row" || dir === "row-reverse";
    const gaps: React.ReactNode[] = [];
    for (let i = 0; i < rects.length - 1; i++) {
      const a = rects[i];
      const b = rects[i + 1];
      if (isRow) {
        const gl = Math.min(a.right, b.right);
        const gr = Math.max(a.left, b.left);
        if (gr > gl) gaps.push(fill(gl, rect.top, gr - gl, rect.height, `g${i}`));
      } else {
        const gt = Math.min(a.bottom, b.bottom);
        const gb = Math.max(a.top, b.top);
        if (gb > gt) gaps.push(fill(rect.left, gt, rect.width, gb - gt, `g${i}`));
      }
    }
    return (
      <>
        {outline}
        {gaps}
      </>
    );
  }

  return outline;
}

// ---------------------------------------------------------------------------
// Bar UI
// ---------------------------------------------------------------------------

const FONT = "'Open Runde', system-ui, sans-serif";

const ARROW_D =
  "M13.415 2.5C12.634 1.719 11.367 1.719 10.586 2.5L3.427 9.659C2.01 11.076 3.014 13.5 5.018 13.5H7V20C7 21.104 7.895 22 9 22H15C16.105 22 17 21.104 17 20V13.5H18.983C20.987 13.5 21.991 11.076 20.574 9.659L13.415 2.5Z";

function Arrow({
  active,
  down,
  onClick,
}: {
  active: boolean;
  down?: boolean;
  onClick?: () => void;
}) {
  return (
    <svg
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      onClick={onClick}
      style={{
        width: 19,
        height: "auto",
        flexShrink: 0,
        cursor: "pointer",
        transform: `rotate(${down ? 180 : 0}deg) translateY(${active ? -1.5 : 0}px) scale(${active ? 1.05 : 1})`,
        transition: active
          ? "transform 0.1s cubic-bezier(0.2, 0, 0, 1.6)"
          : "transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)",
      }}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d={ARROW_D}
        fill={active ? "#FFFFFF" : "#A7A7A7"}
        style={{
          transition: active ? "fill 0.05s ease" : "fill 0.3s ease",
        }}
      />
    </svg>
  );
}

function Bar({
  value,
  activeKey,
  isColor,
  expanded,
  onNudge,
  confirmed,
  visible,
}: {
  value: string;
  activeKey: "up" | "down" | null;
  isColor: boolean;
  expanded: boolean;
  onNudge: (direction: "up" | "down") => void;
  confirmed: boolean;
  visible: boolean;
}) {
  const expandTransition =
    "max-width 0.5s cubic-bezier(0.32, 0.72, 0, 1), " +
    "margin-right 0.5s cubic-bezier(0.32, 0.72, 0, 1), " +
    "opacity 0.35s ease 0.1s";

  const collapseTransition =
    "max-width 0.45s cubic-bezier(0.32, 0.72, 0, 1), " +
    "margin-right 0.45s cubic-bezier(0.32, 0.72, 0, 1), " +
    "opacity 0.15s ease";

  return (
    <div
      style={{
        position: "fixed",
        bottom: expanded ? 20 : 12,
        left: "50%",
        transform: `translateX(-50%) translateY(${activeKey === "down" ? 1 : activeKey === "up" ? -1 : 0}px) scale(${!visible ? 0.5 : expanded ? 1 : 0.85})`,
        opacity: visible ? 1 : 0,
        zIndex: 2147483647,
        display: "flex",
        height: 37,
        alignItems: "center",
        borderRadius: 9999,
        padding: "0 16px",
        background: "#161616",
        boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
        fontSynthesis: "none",
        WebkitFontSmoothing: "antialiased",
        pointerEvents: "auto",
        userSelect: "none",
        transition: activeKey
          ? "transform 0.1s cubic-bezier(0.2, 0, 0, 1.4), bottom 0.5s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.3s ease"
          : "transform 0.35s cubic-bezier(0.32, 0.72, 0, 1), bottom 0.5s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.3s ease",
      }}
    >
      <div
        style={{
          maxWidth: expanded ? 100 : 0,
          marginRight: expanded ? 1 : 0,
          opacity: expanded ? 1 : 0,
          transition: expanded ? expandTransition : collapseTransition,
          display: "flex",
          alignItems: "center",
        }}
      >
        {isColor ? (
          confirmed ? (
            <span
              style={{
                color: "#fff",
                fontFamily: FONT,
                fontWeight: 500,
                fontSize: 14.5,
                lineHeight: "22px",
                whiteSpace: "nowrap",
              }}
            >
              {value}
            </span>
          ) : null
        ) : (
          <Calligraph
            variant="slots"
            animation="snappy"
            style={{
              color: "#fff",
              fontFamily: FONT,
              fontWeight: 500,
              fontSize: 14.5,
              lineHeight: "22px",
              whiteSpace: "nowrap",
              fontVariantNumeric: "tabular-nums",
              minWidth: 48,
              textAlign: "left",
              transition: "color 0.15s ease",
            }}
          >
            {value}
          </Calligraph>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <Arrow down active={activeKey === "down"} onClick={() => onNudge("down")} />
        <Arrow active={activeKey === "up"} onClick={() => onNudge("up")} />
      </div>
    </div>
  );
}

function Toast({ message }: { message: string }) {
  return (
    <div
      style={{
        position: "fixed",
        bottom: 68,
        left: "50%",
        transform: "translateX(-50%)",
        background: "#161616",
        color: "#fff",
        padding: "6px 14px",
        borderRadius: 9999,
        fontSize: 13,
        fontFamily: FONT,
        fontWeight: 500,
        zIndex: 2147483647,
        pointerEvents: "none",
        WebkitFontSmoothing: "antialiased",
      }}
    >
      {message}
    </div>
  );
}
