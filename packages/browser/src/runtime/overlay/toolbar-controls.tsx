// eslint-disable-next-line no-restricted-imports
import { useState } from "react";
import { CursorArrowRaysIcon, EyeIcon, EyeSlashIcon } from "@heroicons/react/20/solid";
import { SRGB_BLUE } from "./constants";

interface ToolbarControlsProps {
  selectActive: boolean;
  overlayVisible: boolean;
  onToggleSelect: () => void;
  onToggleOverlay: () => void;
}

const BUTTON_STYLE: React.CSSProperties = {
  position: "relative",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "32px",
  height: "32px",
  borderRadius: "50%",
  border: "none",
  background: "transparent",
  color: "rgba(255, 255, 255, 0.85)",
  padding: 0,
  transition: "background-color 0.15s ease, color 0.15s ease, transform 0.1s ease",
};

const TOOLTIP_STYLE: React.CSSProperties = {
  position: "absolute",
  bottom: "calc(100% + 14px)",
  left: "50%",
  transform: "translateX(-50%) scale(1)",
  padding: "6px 10px",
  background: "#1a1a1a",
  color: "rgba(255, 255, 255, 0.9)",
  fontSize: "12px",
  fontWeight: 500,
  fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  borderRadius: "8px",
  whiteSpace: "nowrap",
  pointerEvents: "none",
  boxShadow: "0 4px 20px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.08)",
  zIndex: 100001,
};

const ARROW_STYLE: React.CSSProperties = {
  content: '""',
  position: "absolute",
  top: "calc(100% - 4px)",
  left: "50%",
  transform: "translateX(-50%) rotate(45deg)",
  width: "8px",
  height: "8px",
  background: "#1a1a1a",
  borderRadius: "0 0 2px 0",
};

interface ControlButtonProps {
  active?: boolean;
  tooltip: string;
  onClick: () => void;
  children: React.ReactNode;
}

const ControlButton = ({ active, tooltip, onClick, children }: ControlButtonProps) => {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        onClick={onClick}
        style={{
          ...BUTTON_STYLE,
          ...(active
            ? { color: `rgb(${SRGB_BLUE})`, background: `rgba(${SRGB_BLUE}, 0.2)` }
            : hovered
              ? { background: "rgba(255,255,255,0.12)", color: "#fff" }
              : {}),
        }}
        onMouseDown={(event) => {
          event.currentTarget.style.transform = "scale(0.92)";
        }}
        onMouseUp={(event) => {
          event.currentTarget.style.transform = "";
        }}
      >
        {children}
      </button>
      {hovered && (
        <div style={TOOLTIP_STYLE}>
          {tooltip}
          <div style={ARROW_STYLE} />
        </div>
      )}
    </div>
  );
};

export const ToolbarControls = ({
  selectActive,
  overlayVisible,
  onToggleSelect,
  onToggleOverlay,
}: ToolbarControlsProps) => (
  <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
    <ControlButton active={selectActive} tooltip="Select element" onClick={onToggleSelect}>
      <CursorArrowRaysIcon style={{ width: "16px", height: "16px" }} />
    </ControlButton>
    <ControlButton
      tooltip={overlayVisible ? "Hide overlay" : "Show overlay"}
      onClick={onToggleOverlay}
    >
      {overlayVisible && <EyeIcon style={{ width: "16px", height: "16px" }} />}
      {!overlayVisible && <EyeSlashIcon style={{ width: "16px", height: "16px" }} />}
    </ControlButton>
  </div>
);
