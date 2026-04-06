import { CursorArrowRaysIcon, EyeIcon, EyeSlashIcon } from "@heroicons/react/20/solid";
import { SRGB_BLUE } from "./constants";

interface ToolbarControlsProps {
  selectActive: boolean;
  overlayVisible: boolean;
  onToggleSelect: () => void;
  onToggleOverlay: () => void;
}

const CONTROL_BUTTON_STYLE: React.CSSProperties = {
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

export const ToolbarControls = ({
  selectActive,
  overlayVisible,
  onToggleSelect,
  onToggleOverlay,
}: ToolbarControlsProps) => (
  <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
    <button
      type="button"
      onClick={onToggleSelect}
      style={{
        ...CONTROL_BUTTON_STYLE,
        ...(selectActive
          ? {
              color: `rgb(${SRGB_BLUE})`,
              background: `rgba(${SRGB_BLUE}, 0.2)`,
            }
          : {}),
      }}
      onMouseEnter={(event) => {
        if (!selectActive) {
          event.currentTarget.style.background = "rgba(255,255,255,0.12)";
          event.currentTarget.style.color = "#fff";
        }
      }}
      onMouseLeave={(event) => {
        if (!selectActive) {
          event.currentTarget.style.background = "transparent";
          event.currentTarget.style.color = "rgba(255,255,255,0.85)";
        }
      }}
      onMouseDown={(event) => {
        event.currentTarget.style.transform = "scale(0.92)";
      }}
      onMouseUp={(event) => {
        event.currentTarget.style.transform = "";
      }}
    >
      <CursorArrowRaysIcon style={{ width: "16px", height: "16px" }} />
    </button>
    <button
      type="button"
      onClick={onToggleOverlay}
      style={CONTROL_BUTTON_STYLE}
      onMouseEnter={(event) => {
        event.currentTarget.style.background = "rgba(255,255,255,0.12)";
        event.currentTarget.style.color = "#fff";
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.background = "transparent";
        event.currentTarget.style.color = "rgba(255,255,255,0.85)";
      }}
      onMouseDown={(event) => {
        event.currentTarget.style.transform = "scale(0.92)";
      }}
      onMouseUp={(event) => {
        event.currentTarget.style.transform = "";
      }}
    >
      {overlayVisible && <EyeIcon style={{ width: "16px", height: "16px" }} />}
      {!overlayVisible && <EyeSlashIcon style={{ width: "16px", height: "16px" }} />}
    </button>
  </div>
);
