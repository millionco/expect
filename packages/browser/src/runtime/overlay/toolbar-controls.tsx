// eslint-disable-next-line no-restricted-imports
import { useState } from "react";
import { EyeIcon, EyeSlashIcon } from "@heroicons/react/20/solid";

interface ToolbarControlsProps {
  overlayVisible: boolean;
  onToggleOverlay: () => void;
}

export const ToolbarControls = ({ overlayVisible, onToggleOverlay }: ToolbarControlsProps) => {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="relative flex items-center justify-center"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        onClick={onToggleOverlay}
        className={`relative flex items-center justify-center size-8 rounded-full border-none p-0 cursor-pointer outline-none transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.92] ${hovered ? "bg-white/[0.12] text-white" : "bg-transparent text-white/85"}`}
      >
        {overlayVisible && <EyeIcon className="size-4" />}
        {!overlayVisible && <EyeSlashIcon className="size-4" />}
      </button>
    </div>
  );
};
