// eslint-disable-next-line no-restricted-imports -- overlay runs in injected runtime
import { useState } from "react";
import {
  SRGB_BLUE,
  RAF_THROTTLE_INTERVAL_MS,
  TOOLTIP_FLIP_THRESHOLD_PX,
  getViewport,
} from "../lib/constants";
import type { ActionLogEntry, HighlightRect } from "../lib/constants";

interface MarkerPosition {
  x: number;
  y: number;
  visible: boolean;
}

interface ActionMarkerProps {
  action: ActionLogEntry;
  index: number;
  position: MarkerPosition;
  onHoverRect: (rect: HighlightRect | undefined) => void;
}

const ActionMarkerTooltip = ({
  description,
  positionY,
}: {
  description: string;
  positionY: number;
}) => {
  const showAbove = positionY > getViewport().height - TOOLTIP_FLIP_THRESHOLD_PX;
  return (
    <div
      className="absolute left-1/2 px-3 py-2 bg-[#1a1a1a] text-white text-[13px] font-normal rounded-xl whitespace-nowrap overflow-hidden text-ellipsis leading-[1.4] pointer-events-none shadow-[0_4px_20px_rgba(0,0,0,0.3),0_0_0_1px_rgba(255,255,255,0.08)] min-w-[120px] max-w-[280px] text-center animate-[expect-tooltip-in_0.1s_ease-out_forwards]"
      style={{
        transform: "translateX(-50%)",
        ...(showAbove ? { bottom: "calc(100% + 10px)" } : { top: "calc(100% + 10px)" }),
      }}
    >
      {description}
    </div>
  );
};

export const ActionMarker = ({ action, index, position, onHoverRect }: ActionMarkerProps) => {
  const [hovered, setHovered] = useState(false);

  const handleMouseEnter = () => {
    setHovered(true);
    if (!action.selector) return;
    try {
      const element = document.querySelector(action.selector);
      if (element) {
        const box = element.getBoundingClientRect();
        onHoverRect({ x: box.x, y: box.y, width: box.width, height: box.height });
      }
    } catch (error) {
      console.debug("[expect-overlay] hovered element lookup error:", error);
    }
  };

  const handleMouseLeave = () => {
    setHovered(false);
    onHoverRect(undefined);
  };

  return (
    <div
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
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 2px 6px rgba(0,0,0,0.2), inset 0 0 0 1px rgba(0,0,0,0.04)",
        pointerEvents: "auto",
        cursor: "pointer",
        userSelect: "none",
        transform: `translate(-50%, -50%)${hovered ? " scale(1.1)" : ""}`,
        transition: `left ${RAF_THROTTLE_INTERVAL_MS}ms linear, top ${RAF_THROTTLE_INTERVAL_MS}ms linear, background-color 0.15s ease, transform 0.1s ease`,
        animation: "expect-marker-in 0.25s cubic-bezier(0.22, 1, 0.36, 1) both",
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {index + 1}
      {hovered && <ActionMarkerTooltip description={action.description} positionY={position.y} />}
    </div>
  );
};
