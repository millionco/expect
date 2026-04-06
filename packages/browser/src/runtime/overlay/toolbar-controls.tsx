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
      className="relative flex items-center justify-center"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        onClick={onClick}
        className="relative flex items-center justify-center size-8 rounded-full border-none p-0 cursor-pointer transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.92]"
        style={{
          background: active
            ? `rgba(${SRGB_BLUE}, 0.2)`
            : hovered
              ? "rgba(255,255,255,0.12)"
              : "transparent",
          color: active ? `rgb(${SRGB_BLUE})` : hovered ? "#fff" : "rgba(255,255,255,0.85)",
        }}
      >
        {children}
      </button>
      {hovered && (
        <div className="absolute bottom-[calc(100%+14px)] left-1/2 -translate-x-1/2 px-2.5 py-1.5 bg-[#1a1a1a] text-white/90 text-xs font-medium rounded-lg whitespace-nowrap pointer-events-none shadow-[0_4px_20px_rgba(0,0,0,0.3),0_0_0_1px_rgba(255,255,255,0.08)] z-[100001]">
          {tooltip}
          <div className="absolute top-[calc(100%-4px)] left-1/2 -translate-x-1/2 rotate-45 size-2 bg-[#1a1a1a] rounded-br-sm" />
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
  <div className="flex items-center gap-0.5">
    <ControlButton active={selectActive} tooltip="Select element" onClick={onToggleSelect}>
      <CursorArrowRaysIcon className="size-4" />
    </ControlButton>
    <ControlButton
      tooltip={overlayVisible ? "Hide overlay" : "Show overlay"}
      onClick={onToggleOverlay}
    >
      {overlayVisible && <EyeIcon className="size-4" />}
      {!overlayVisible && <EyeSlashIcon className="size-4" />}
    </ControlButton>
  </div>
);
