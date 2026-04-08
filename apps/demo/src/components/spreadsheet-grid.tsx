import { useState } from "react";
import { store } from "@/store";

const CELL_HEIGHT = 48;
const CELL_WIDTH = 200;
const ROW_HEADER_WIDTH = 64;

const parseCellId = (cellId: string) => {
  const col = cellId.charCodeAt(0) - 65;
  const row = parseInt(cellId.slice(1), 10);
  return { col, row };
};

const isCellInRange = (cellId: string, anchor: string, end: string) => {
  const { col: cellCol, row: cellRow } = parseCellId(cellId);
  const { col: anchorCol, row: anchorRow } = parseCellId(anchor);
  const { col: endCol, row: endRow } = parseCellId(end);

  const minCol = Math.min(anchorCol, endCol);
  const maxCol = Math.max(anchorCol, endCol);
  const minRow = Math.min(anchorRow, endRow);
  const maxRow = Math.max(anchorRow, endRow);

  return cellCol >= minCol && cellCol <= maxCol && cellRow >= minRow && cellRow <= maxRow;
};

export const SpreadsheetGrid = ({ onUpdate }: { onUpdate: () => void }) => {
  const snapshot = store.getSnapshot();
  const selectedCell = snapshot.selectedCell;
  const [editingCell, setEditingCell] = useState<string | undefined>(undefined);
  const [editValue, setEditValue] = useState("");
  const [dragAnchor, setDragAnchor] = useState<string | undefined>(undefined);
  const [dragEnd, setDragEnd] = useState<string | undefined>(undefined);
  const isDragging = dragAnchor !== undefined;

  const startEditing = (cellId: string) => {
    setEditingCell(cellId);
    setEditValue(store.getCellRaw(cellId));
  };

  const commitEdit = () => {
    if (editingCell) {
      store.setCell(editingCell, editValue);
      setEditingCell(undefined);
      onUpdate();
    }
  };

  const handleCellDoubleClick = (cellId: string) => {
    startEditing(cellId);
  };

  const handleMouseDown = (cellId: string) => {
    if (editingCell) commitEdit();
    setDragAnchor(cellId);
    setDragEnd(cellId);
    store.selectCell(cellId);
    onUpdate();
  };

  const handleMouseEnter = (cellId: string) => {
    if (isDragging) {
      setDragEnd(cellId);
    }
  };

  const handleMouseUp = () => {
    setDragAnchor(undefined);
    setDragEnd(undefined);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter") {
      if (editingCell) {
        commitEdit();
        const { col, row } = parseSelected();
        const nextCell = `${store.colLetter(col)}${row + 1}`;
        store.selectCell(nextCell);
        onUpdate();
      } else {
        startEditing(selectedCell);
      }
    } else if (event.key === "Escape") {
      setEditingCell(undefined);
    } else if (event.key === "Tab") {
      event.preventDefault();
      if (editingCell) commitEdit();
      const { col, row } = parseSelected();
      const nextCol = Math.min(col + 1, store.COL_COUNT - 1);
      store.selectCell(`${store.colLetter(nextCol)}${row}`);
      onUpdate();
    } else if (!editingCell && event.key === "ArrowDown") {
      event.preventDefault();
      const { col, row } = parseSelected();
      const nextRow = Math.min(row + 1, store.ROW_COUNT);
      store.selectCell(`${store.colLetter(col)}${nextRow}`);
      onUpdate();
    } else if (!editingCell && event.key === "ArrowUp") {
      event.preventDefault();
      const { col, row } = parseSelected();
      const nextRow = Math.max(row - 1, 1);
      store.selectCell(`${store.colLetter(col)}${nextRow}`);
      onUpdate();
    } else if (!editingCell && event.key === "ArrowRight") {
      event.preventDefault();
      const { col, row } = parseSelected();
      const nextCol = Math.min(col + 1, store.COL_COUNT - 1);
      store.selectCell(`${store.colLetter(nextCol)}${row}`);
      onUpdate();
    } else if (!editingCell && event.key === "ArrowLeft") {
      event.preventDefault();
      const { col, row } = parseSelected();
      const nextCol = Math.max(col - 1, 0);
      store.selectCell(`${store.colLetter(nextCol)}${row}`);
      onUpdate();
    } else if (!editingCell && event.key === "Delete") {
      store.setCell(selectedCell, "");
      onUpdate();
    } else if (!editingCell && event.key.length === 1 && !event.metaKey && !event.ctrlKey) {
      startEditing(selectedCell);
      setEditValue(event.key);
    }
  };

  const parseSelected = () => {
    const col = selectedCell.charCodeAt(0) - 65;
    const row = parseInt(selectedCell.slice(1), 10);
    return { col, row };
  };

  const isHeaderRow = (row: number) => row === 1;

  const rangeLabel =
    dragAnchor && dragEnd && dragAnchor !== dragEnd ? `${dragAnchor}:${dragEnd}` : selectedCell;

  return (
    <div className="flex flex-col h-full" onMouseUp={handleMouseUp}>
      <div className="flex items-center border-b border-zinc-300 bg-white h-11 shrink-0">
        <div className="w-28 px-2 py-1 border-r border-zinc-300 text-lg font-medium text-zinc-700 bg-zinc-50 h-full flex items-center">
          {rangeLabel}
        </div>
        <div className="flex-1 px-3 flex items-center h-full">
          <input
            value={editingCell === selectedCell ? editValue : store.getCellRaw(selectedCell)}
            onChange={(event) => {
              if (editingCell === selectedCell) {
                setEditValue(event.target.value);
              } else {
                startEditing(selectedCell);
                setEditValue(event.target.value);
              }
            }}
            onBlur={commitEdit}
            onKeyDown={(event) => {
              if (event.key === "Enter") commitEdit();
            }}
            className="w-full text-lg text-zinc-800 bg-transparent border-0 outline-none"
          />
        </div>
      </div>

      <div
        className="flex-1 overflow-auto outline-none select-none"
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        <div className="inline-block min-w-full">
          <div className="flex sticky top-0 z-10">
            <div
              className="bg-zinc-100 border-b border-r border-zinc-300 shrink-0"
              style={{ width: ROW_HEADER_WIDTH, height: CELL_HEIGHT }}
            />
            {Array.from({ length: store.COL_COUNT }, (_, colIndex) => (
              <div
                key={colIndex}
                className="bg-zinc-100 border-b border-r border-zinc-300 flex items-center justify-center text-base font-medium text-zinc-500 shrink-0"
                style={{ width: CELL_WIDTH, height: CELL_HEIGHT }}
              >
                {store.colLetter(colIndex)}
              </div>
            ))}
          </div>

          {Array.from({ length: store.ROW_COUNT }, (_, rowIndex) => {
            const rowNumber = rowIndex + 1;

            return (
              <div key={rowNumber} className="flex">
                <div
                  className="bg-zinc-50 border-b border-r border-zinc-300 flex items-center justify-center text-base text-zinc-300 shrink-0"
                  style={{ width: ROW_HEADER_WIDTH, height: CELL_HEIGHT }}
                >
                  {rowNumber}
                </div>

                {Array.from({ length: store.COL_COUNT }, (_, colIndex) => {
                  const cellId = `${store.colLetter(colIndex)}${rowNumber}`;
                  const isSelected = cellId === selectedCell;
                  const isEditing = cellId === editingCell;
                  const rawValue = store.getCellRaw(cellId);
                  const displayValue = store.getCellValue(cellId);
                  const isFormula = rawValue.startsWith("=");
                  const isHeader = isHeaderRow(rowNumber);
                  const inRange =
                    isDragging && dragAnchor && dragEnd
                      ? isCellInRange(cellId, dragAnchor, dragEnd)
                      : false;

                  const numericValue = Number(displayValue);
                  const isNegative = !isNaN(numericValue) && numericValue < 0 && !isHeader;
                  const isPositive = !isNaN(numericValue) && numericValue > 0 && !isHeader;
                  const isStatusCol = colIndex === 4 && !isHeader;
                  const statusValue = displayValue.toLowerCase();
                  const statusBg =
                    isStatusCol && statusValue === "paid"
                      ? "bg-emerald-50"
                      : isStatusCol && statusValue === "received"
                        ? "bg-blue-50"
                        : isStatusCol && statusValue === "pending"
                          ? "bg-amber-50"
                          : "";

                  return (
                    <div
                      key={cellId}
                      className={`border-b border-r shrink-0 relative cursor-cell ${statusBg} ${
                        isSelected
                          ? "border-blue-600 z-10 ring-2 ring-blue-600 ring-inset"
                          : inRange
                            ? "bg-blue-50 border-blue-300"
                            : "border-zinc-200"
                      }`}
                      style={{ width: CELL_WIDTH, height: CELL_HEIGHT }}
                      onMouseDown={() => handleMouseDown(cellId)}
                      onMouseEnter={() => handleMouseEnter(cellId)}
                      onDoubleClick={() => handleCellDoubleClick(cellId)}
                    >
                      {isEditing && (
                        <input
                          autoFocus
                          value={editValue}
                          onChange={(event) => setEditValue(event.target.value)}
                          onBlur={commitEdit}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              commitEdit();
                              const nextCell = `${store.colLetter(colIndex)}${rowNumber + 1}`;
                              store.selectCell(nextCell);
                              onUpdate();
                            }
                            if (event.key === "Escape") setEditingCell(undefined);
                            if (event.key === "Tab") {
                              event.preventDefault();
                              commitEdit();
                              const nextCol = Math.min(colIndex + 1, store.COL_COUNT - 1);
                              store.selectCell(`${store.colLetter(nextCol)}${rowNumber}`);
                              onUpdate();
                            }
                          }}
                          className="absolute inset-0 px-2 text-lg bg-white border-0 outline-none z-20"
                        />
                      )}
                      {!isEditing && (
                        <div
                          className={`px-2 h-full flex items-center text-lg truncate ${
                            isHeader
                              ? "font-bold text-zinc-900 bg-zinc-50"
                              : isStatusCol && statusValue === "paid"
                                ? "text-emerald-700 font-medium"
                                : isStatusCol && statusValue === "received"
                                  ? "text-blue-700 font-medium"
                                  : isStatusCol && statusValue === "pending"
                                    ? "text-amber-700 font-medium"
                                    : isFormula
                                      ? "text-zinc-800"
                                      : isNegative
                                        ? "text-red-600"
                                        : isPositive
                                          ? "text-emerald-600"
                                          : "text-zinc-800"
                          }`}
                        >
                          {displayValue}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
