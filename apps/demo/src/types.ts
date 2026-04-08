export interface CellData {
  value: string;
}

export interface SpreadsheetState {
  cells: Record<string, CellData>;
  selectedCell: string;
}
