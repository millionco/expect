import type { CSSProperties, ReactNode } from "react";

const TRAFFIC_COLORS = ["#FF5F57", "#FEBC2E", "#28C840"] as const;

const WINDOW_SHADOW = [
  "color(display-p3 0 0 0 / 5%) 0px 0px 0px 1px",
  "color(display-p3 0 0 0 / 8%) 0px 4px 24px",
  "color(display-p3 0 0 0 / 4%) 0px 1px 3px",
].join(", ");

export const MacWindow = ({
  children,
  surfaceStyle,
}: {
  children: ReactNode;
  surfaceStyle?: CSSProperties;
}) => (
  <div
    className="relative flex h-full flex-col overflow-hidden rounded-xl bg-white"
    style={{ ...surfaceStyle, boxShadow: WINDOW_SHADOW }}
  >
    <div className="flex items-center gap-2 px-4 py-3">
      <div className="flex items-center gap-[6px]">
        {TRAFFIC_COLORS.map((color) => (
          <div
            key={color}
            className="size-3 shrink-0 rounded-full"
            style={{ backgroundColor: color }}
          />
        ))}
      </div>
    </div>
    <div className="min-h-0 flex-1">{children}</div>
  </div>
);
