import { useEffect, useState } from "react";
import { useStdout } from "ink";
import { FALLBACK_TERMINAL_COLUMNS, FALLBACK_TERMINAL_ROWS } from "../constants";

const safeColumns = (value: number | undefined): number =>
  value && value > 0 ? value : FALLBACK_TERMINAL_COLUMNS;

const safeRows = (value: number | undefined): number =>
  value && value > 0 ? value : FALLBACK_TERMINAL_ROWS;

export const useStdoutDimensions = (): [columns: number, rows: number] => {
  const { stdout } = useStdout();
  const [dimensions, setDimensions] = useState<[number, number]>([
    safeColumns(stdout.columns),
    safeRows(stdout.rows),
  ]);

  useEffect(() => {
    const onResize = () => setDimensions([safeColumns(stdout.columns), safeRows(stdout.rows)]);
    stdout.on("resize", onResize);
    return () => {
      stdout.off("resize", onResize);
    };
  }, [stdout]);

  return dimensions;
};
