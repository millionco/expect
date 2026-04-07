// eslint-disable-next-line no-restricted-imports -- overlay runs in injected runtime
import { useState } from "react";
import { EyeIcon, EyeSlashIcon } from "@heroicons/react/20/solid";

interface ToolbarControlsProps {
  overlayVisible: boolean;
  onToggleOverlay: () => void;
}

export const ToolbarControls = ({ overlayVisible, onToggleOverlay }: ToolbarControlsProps) => {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div
      className="relative flex items-center justify-center"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <button
        type="button"
        onClick={onToggleOverlay}
        className="relative flex items-center justify-center size-8 rounded-full border-none p-0 cursor-pointer outline-none transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.92] bg-transparent text-white/85 hover:bg-white/[0.12] hover:text-white"
      >
        {overlayVisible && <EyeIcon className="size-4" />}
        {!overlayVisible && <EyeSlashIcon className="size-4" />}
      </button>
      {showTooltip && (
        <div className="absolute bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2 px-2.5 py-1.5 bg-[#1a1a1a] text-white text-[11px] font-normal rounded-lg whitespace-nowrap pointer-events-none shadow-[0_4px_12px_rgba(0,0,0,0.3),0_0_0_1px_rgba(255,255,255,0.08)] animate-[expect-tooltip-in_0.1s_ease-out_forwards]">
          {overlayVisible ? "Hide overlay" : "Show overlay"}
        </div>
      )}
    </div>
  );
};
