"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";

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
  const [activeKey, setActiveKey] = useState<"up" | "down" | null>(null);

  const savedValueRef = useRef("");
  const numericRef = useRef(0);
  const unitRef = useRef("");
  const optionIndexRef = useRef(0);
  const currentValueRef = useRef("");

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

  // Find target element
  useEffect(() => {
    if (!config || dismissed) {
      setTargetEl(null);
      return;
    }

    const find = () =>
      document.querySelector("[data-nudge-target]") as Element | null;
    const found = find();
    if (found) {
      const useSvg = isSvgAttr(found, config.property);
      savedValueRef.current = useSvg
        ? found.getAttribute(config.property) || ""
        : (found as HTMLElement).style.getPropertyValue(config.property);
      setTargetEl(found);
      return;
    }

    const observer = new MutationObserver(() => {
      const el = find();
      if (el) {
        observer.disconnect();
        const useSvg = isSvgAttr(el, config.property);
        savedValueRef.current = useSvg
          ? el.getAttribute(config.property) || ""
          : (el as HTMLElement).style.getPropertyValue(config.property);
        setTargetEl(el);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [config, dismissed]);

  const applyPreview = useCallback(
    (el: Element, val: string) => {
      if (!config) return;
      if (isSvgAttr(el, config.property)) {
        el.setAttribute(config.property, val);
      } else {
        (el as HTMLElement).style.setProperty(config.property, val);
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
      setToastMsg("Copied to clipboard");
      setTimeout(() => setToastMsg(null), 1800);
      dismiss();
    }

    function handleCancel() {
      const useSvg = isSvgAttr(targetEl!, config!.property);
      if (useSvg) {
        if (savedValueRef.current) {
          targetEl!.setAttribute(config!.property, savedValueRef.current);
        } else {
          targetEl!.removeAttribute(config!.property);
        }
      } else {
        if (savedValueRef.current) {
          (targetEl! as HTMLElement).style.setProperty(
            config!.property,
            savedValueRef.current
          );
        } else {
          (targetEl! as HTMLElement).style.removeProperty(config!.property);
        }
      }
      dismiss();
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        handleCancel();
      } else if (e.key === "Enter") {
        e.preventDefault();
        handleSubmit();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        stepValue(1, e.shiftKey);
        setActiveKey("up");
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        stepValue(-1, e.shiftKey);
        setActiveKey("down");
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
    };
  }, [config, targetEl, dismissed, applyPreview, dismiss]);

  if (!mounted || !config || !targetEl || dismissed) {
    if (mounted && toastMsg) {
      return createPortal(<Toast message={toastMsg} />, document.body);
    }
    return null;
  }

  return createPortal(
    <>
      <Bar
        property={config.property}
        value={currentValue}
        activeKey={activeKey}
        isColor={config.type === "color"}
      />
      {toastMsg && <Toast message={toastMsg} />}
    </>,
    document.body
  );
}

// ---------------------------------------------------------------------------
// Bar UI
// ---------------------------------------------------------------------------

const FONT = "'Open Runde', system-ui, sans-serif";

const ARROW_D =
  "M13.415 2.5C12.634 1.719 11.367 1.719 10.586 2.5L3.427 9.659C2.01 11.076 3.014 13.5 5.018 13.5H7V20C7 21.104 7.895 22 9 22H15C16.105 22 17 21.104 17 20V13.5H18.983C20.987 13.5 21.991 11.076 20.574 9.659L13.415 2.5Z";

function Arrow({ active, down }: { active: boolean; down?: boolean }) {
  return (
    <svg
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{
        width: 19,
        height: "auto",
        flexShrink: 0,
        ...(down ? { transform: "rotate(180deg)" } : {}),
      }}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d={ARROW_D}
        fill={active ? "#FFFFFF" : "#A7A7A7"}
      />
    </svg>
  );
}

function Bar({
  property,
  value,
  activeKey,
  isColor,
}: {
  property: string;
  value: string;
  activeKey: "up" | "down" | null;
  isColor: boolean;
}) {
  const label = property.charAt(0).toUpperCase() + property.slice(1);

  return (
    <div
      style={{
        position: "fixed",
        bottom: 20,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 2147483647,
        display: "flex",
        height: 37,
        alignItems: "center",
        justifyContent: "space-between",
        borderRadius: 9999,
        padding: "0 16px",
        background: "#161616",
        fontSynthesis: "none",
        WebkitFontSmoothing: "antialiased",
        gap: 16,
        pointerEvents: "auto",
        userSelect: "none",
      }}
    >
      {isColor ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              color: "#fff",
              fontFamily: FONT,
              fontWeight: 500,
              fontSize: 15.5,
              lineHeight: "23px",
              whiteSpace: "nowrap",
            }}
          >
            {label}
          </span>
          <div
            style={{
              width: 15,
              height: 15,
              borderRadius: "50%",
              background: value,
              border: "2px solid #161616",
              outline: `2px solid ${value}`,
              flexShrink: 0,
            }}
          />
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 7 }}>
          <span
            style={{
              color: "#fff",
              fontFamily: FONT,
              fontWeight: 500,
              fontSize: 15.5,
              lineHeight: "23px",
              whiteSpace: "nowrap",
            }}
          >
            {label}
          </span>
          <span
            style={{
              color: "color(display-p3 0.566 0.566 0.566)",
              fontFamily: FONT,
              fontWeight: 500,
              fontSize: 15.5,
              lineHeight: "23px",
              whiteSpace: "nowrap",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {value}
          </span>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <Arrow down active={activeKey === "down"} />
        <Arrow active={activeKey === "up"} />
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
