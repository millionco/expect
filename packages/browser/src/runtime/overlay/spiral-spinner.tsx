// eslint-disable-next-line no-restricted-imports
import { useEffect, useRef } from "react";

const GRID_SIZE = 3;
const CELL_PX = 1;
const CANVAS_SIZE = GRID_SIZE * CELL_PX;
const TICK_MS = 120;

const GLIDER = [
  [0, 1],
  [1, 2],
  [2, 0],
  [2, 1],
  [2, 2],
];

const createGrid = (): boolean[][] => {
  const grid: boolean[][] = Array.from({ length: GRID_SIZE }, () =>
    Array.from({ length: GRID_SIZE }, () => false),
  );
  for (const [row, col] of GLIDER) {
    grid[row % GRID_SIZE][col % GRID_SIZE] = true;
  }
  return grid;
};

const countNeighbors = (grid: boolean[][], row: number, col: number): number => {
  let count = 0;
  for (let deltaRow = -1; deltaRow <= 1; deltaRow++) {
    for (let deltaCol = -1; deltaCol <= 1; deltaCol++) {
      if (deltaRow === 0 && deltaCol === 0) continue;
      const neighborRow = (row + deltaRow + GRID_SIZE) % GRID_SIZE;
      const neighborCol = (col + deltaCol + GRID_SIZE) % GRID_SIZE;
      if (grid[neighborRow][neighborCol]) count++;
    }
  }
  return count;
};

const step = (grid: boolean[][]): boolean[][] =>
  grid.map((row, rowIndex) =>
    row.map((alive, colIndex) => {
      const neighbors = countNeighbors(grid, rowIndex, colIndex);
      return alive ? neighbors === 2 || neighbors === 3 : neighbors === 3;
    }),
  );

export const SpiralSpinner = ({ visible }: { visible: boolean }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gridRef = useRef<boolean[][]>(createGrid());
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
      gridRef.current = step(gridRef.current);
      ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      ctx.fillStyle = "white";
      for (let row = 0; row < GRID_SIZE; row++) {
        for (let col = 0; col < GRID_SIZE; col++) {
          if (gridRef.current[row][col]) {
            ctx.fillRect(col * CELL_PX, row * CELL_PX, CELL_PX, CELL_PX);
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
