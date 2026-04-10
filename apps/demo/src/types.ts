export interface CellData {
  value: string;
}

interface SpreadsheetState {
  cells: Record<string, CellData>;
  selectedCell: string;
}
