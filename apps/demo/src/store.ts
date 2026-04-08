import type { CellData } from "./types";
import { SEED_CELLS } from "./seed";

const COL_COUNT = 10;
const ROW_COUNT = 25;

const colLetter = (index: number) => String.fromCharCode(65 + index);

const evaluateFormula = (formula: string, cells: Record<string, CellData>): string => {
  const sumMatch = formula.match(/^=SUM\(([A-Z])(\d+):([A-Z])(\d+)\)$/i);
  if (!sumMatch) {
    return "ERR";
  }

  const startCol = sumMatch[1].toUpperCase().charCodeAt(0) - 65;
  const startRow = parseInt(sumMatch[2], 10);
  const endCol = sumMatch[3].toUpperCase().charCodeAt(0) - 65;
  const endRow = parseInt(sumMatch[4], 10);

  let total = 0;
  for (let col = startCol; col <= endCol; col++) {
    for (let row = startRow; row <= endRow; row++) {
      const id = `${colLetter(col)}${row}`;
      const cell = cells[id];
      if (cell) {
        const value = Number(cell.value);
        if (!isNaN(value)) total += value;
      }
    }
  }
  return String(total);
};

interface StoreData {
  cells: Record<string, CellData>;
  selectedCell: string;
}

let data: StoreData = {
  cells: { ...SEED_CELLS },
  selectedCell: "A1",
};
let listeners: Array<() => void> = [];

const notify = () => {
  listeners.forEach((listener) => listener());
};

export const store = {
  subscribe(listener: () => void) {
    listeners.push(listener);
    return () => {
      listeners = listeners.filter((l) => l !== listener);
    };
  },

  getSnapshot: () => data,

  getCellValue: (cellId: string) => {
    const cell = data.cells[cellId];
    if (!cell) return "";
    if (cell.value.startsWith("=")) {
      return evaluateFormula(cell.value, data.cells);
    }
    return cell.value;
  },

  getCellRaw: (cellId: string) => {
    return data.cells[cellId]?.value ?? "";
  },

  setCell(cellId: string, value: string) {
    data = {
      ...data,
      cells: {
        ...data.cells,
        [cellId]: { value },
      },
    };
    notify();
  },

  selectCell(cellId: string) {
    data = { ...data, selectedCell: cellId };
    notify();
  },

  getSelectionRange(anchor: string, end: string) {
    return `${anchor}:${end}`;
  },

  deleteRow(rowNumber: number) {
    const newCells: Record<string, CellData> = {};
    for (const [id, cell] of Object.entries(data.cells)) {
      const row = parseInt(id.slice(1), 10);
      if (row !== rowNumber) {
        newCells[id] = cell;
      }
    }
    data = { ...data, cells: newCells };
    notify();
  },

  reset() {
    data = {
      cells: { ...SEED_CELLS },
      selectedCell: "A1",
    };
    notify();
  },

  COL_COUNT,
  ROW_COUNT,
  colLetter,
};
