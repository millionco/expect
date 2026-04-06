// eslint-disable-next-line no-restricted-imports
import { useEffect, useRef } from "react";

const TICK_MS = 250;
const CELL_PX = 4;
const GAP_PX = 2;
const CANVAS_SIZE = 3 * CELL_PX + 2 * GAP_PX;

const GLIDER_FRAMES = [
  [
    [0, 1, 0],
    [0, 0, 1],
    [1, 1, 1],
  ],
  [
    [1, 0, 0],
    [0, 1, 1],
    [1, 1, 0],
  ],
  [
    [0, 1, 0],
    [0, 0, 1],
    [1, 1, 1],
  ],
  [
    [0, 0, 1],
    [1, 0, 1],
    [0, 1, 1],
  ],
];

export const SpiralSpinner = ({ visible }: { visible: boolean }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);

  useEffect(() => {
    if (!visible) {
      clearInterval(intervalRef.current);
      intervalRef.current = undefined;
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const render = () => {
      const grid = GLIDER_FRAMES[frameRef.current % GLIDER_FRAMES.length];
      frameRef.current++;
      ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      ctx.fillStyle = "white";
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
          if (grid[row][col]) {
            ctx.fillRect(col * (CELL_PX + GAP_PX), row * (CELL_PX + GAP_PX), CELL_PX, CELL_PX);
          }
        }
      }
    };

    render();
    intervalRef.current = setInterval(render, TICK_MS);
    return () => clearInterval(intervalRef.current);
  }, [visible]);

  return (
    <div className="size-4 shrink-0 rounded-sm overflow-hidden">
      <canvas
        ref={canvasRef}
        width={CANVAS_SIZE}
        height={CANVAS_SIZE}
        className="size-full"
        style={{ imageRendering: "pixelated" }}
      />
    </div>
  );
};
