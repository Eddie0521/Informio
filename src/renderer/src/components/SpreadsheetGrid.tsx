import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Plus } from "lucide-react";
import {
  SpreadsheetContextMenu,
  type SpreadsheetContextMenuState,
  type SpreadsheetMenuTarget
} from "./SpreadsheetContextMenu";
import {
  addWorkbookSheet,
  cellDisplayValue,
  clearSheetColumn,
  clearSheetRow,
  columnLabel,
  deleteSheetColumn,
  deleteSheetRow,
  deleteWorkbookSheet,
  insertSheetColumn,
  insertSheetRow,
  renameWorkbookSheet,
  sheetGridSize,
  updateWorkbookCell,
  type SpreadsheetWorkbook
} from "../lib/spreadsheet-workbook";
import { cn } from "../lib/utils";

type ActiveCell = { row: number; column: number };

type SpreadsheetGridProps = {
  workbook: SpreadsheetWorkbook;
  zoom: number;
  onWorkbookChange: (workbook: SpreadsheetWorkbook) => void;
  onCellChange: (sheetIndex: number, row: number, column: number, value: string) => void;
};

const ROW_HEIGHT = 28;
const COL_WIDTH = 96;
const ROW_HEADER_WIDTH = 44;
const COL_HEADER_HEIGHT = 28;

export function SpreadsheetGrid({ workbook, zoom, onWorkbookChange, onCellChange }: SpreadsheetGridProps) {
  const { t } = useTranslation();
  const [activeCell, setActiveCell] = useState<ActiveCell>({ row: 0, column: 0 });
  const [menu, setMenu] = useState<SpreadsheetContextMenuState | null>(null);
  const clipboardRef = useRef("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const activeSheet = workbook.sheets[workbook.activeSheetIndex] ?? workbook.sheets[0];
  const { rowCount, colCount } = useMemo(() => sheetGridSize(activeSheet), [activeSheet]);

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 5
  });

  const colVirtualizer = useVirtualizer({
    horizontal: true,
    count: colCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => COL_WIDTH,
    overscan: 2
  });

  useEffect(() => {
    rowVirtualizer.scrollToIndex(activeCell.row, { align: "auto" });
    colVirtualizer.scrollToIndex(activeCell.column, { align: "auto" });
  }, [activeCell.row, activeCell.column, colVirtualizer, rowVirtualizer]);

  if (!activeSheet) {
    return <div className="informio-spreadsheet-message is-error">{t("editor.assetDecodeError", { type: t("spreadsheet.fileType") })}</div>;
  }

  const applyStructure = (next: SpreadsheetWorkbook) => {
    onWorkbookChange(next);
  };

  const openMenu = (event: React.MouseEvent, target: SpreadsheetMenuTarget) => {
    event.preventDefault();
    event.stopPropagation();
    if (target.kind === "cell") {
      setActiveCell({ row: target.row, column: target.column });
    } else if (target.kind === "row") {
      setActiveCell((current) => ({ ...current, row: target.row }));
    } else if (target.kind === "column") {
      setActiveCell((current) => ({ ...current, column: target.column }));
    } else if (target.kind === "sheet") {
      onWorkbookChange({ ...workbook, activeSheetIndex: target.sheetIndex });
    }
    setMenu({ x: event.clientX, y: event.clientY, target });
  };

  const handleInsertRowAbove = () => {
    applyStructure(insertSheetRow(workbook, workbook.activeSheetIndex, activeCell.row));
  };

  const handleInsertRowBelow = () => {
    applyStructure(insertSheetRow(workbook, workbook.activeSheetIndex, activeCell.row + 1));
  };

  const handleDeleteRow = () => {
    applyStructure(deleteSheetRow(workbook, workbook.activeSheetIndex, activeCell.row));
    setActiveCell((current) => ({ ...current, row: Math.max(0, current.row - 1) }));
  };

  const handleInsertColumnLeft = () => {
    applyStructure(insertSheetColumn(workbook, workbook.activeSheetIndex, activeCell.column));
  };

  const handleInsertColumnRight = () => {
    applyStructure(insertSheetColumn(workbook, workbook.activeSheetIndex, activeCell.column + 1));
  };

  const handleDeleteColumn = () => {
    applyStructure(deleteSheetColumn(workbook, workbook.activeSheetIndex, activeCell.column));
    setActiveCell((current) => ({ ...current, column: Math.max(0, current.column - 1) }));
  };

  const handleClearCell = () => {
    applyStructure(updateWorkbookCell(workbook, workbook.activeSheetIndex, activeCell.row, activeCell.column, null));
  };

  const handleClearRow = () => {
    applyStructure(clearSheetRow(workbook, workbook.activeSheetIndex, activeCell.row));
  };

  const handleClearColumn = () => {
    applyStructure(clearSheetColumn(workbook, workbook.activeSheetIndex, activeCell.column));
  };

  const handleCopy = () => {
    const value = activeSheet.rows[activeCell.row]?.[activeCell.column];
    clipboardRef.current = cellDisplayValue(value);
    void navigator.clipboard?.writeText(clipboardRef.current);
  };

  const handlePaste = async () => {
    let text = clipboardRef.current;
    try {
      text = (await navigator.clipboard.readText()) || text;
    } catch {
      // fall back to in-app clipboard buffer
    }
    onCellChange(workbook.activeSheetIndex, activeCell.row, activeCell.column, text);
  };

  const handleAddSheet = () => {
    applyStructure(addWorkbookSheet(workbook));
  };

  const handleDeleteSheet = () => {
    const sheetIndex = menu?.target.kind === "sheet" ? menu.target.sheetIndex : workbook.activeSheetIndex;
    applyStructure(deleteWorkbookSheet(workbook, sheetIndex));
  };

  const handleRenameSheet = () => {
    const sheetIndex = menu?.target.kind === "sheet" ? menu.target.sheetIndex : workbook.activeSheetIndex;
    const currentName = workbook.sheets[sheetIndex]?.name ?? "";
    const nextName = window.prompt(t("spreadsheet.renameSheetPrompt"), currentName);
    if (!nextName || nextName.trim() === currentName) return;
    applyStructure(renameWorkbookSheet(workbook, sheetIndex, nextName));
  };

  const gridWidth = ROW_HEADER_WIDTH + colVirtualizer.getTotalSize();
  const gridHeight = COL_HEADER_HEIGHT + rowVirtualizer.getTotalSize();

  return (
    <div className="informio-spreadsheet-grid-shell">
      <div className="informio-spreadsheet-status">
        <span className="informio-spreadsheet-status-address">
          {columnLabel(activeCell.column)}
          {activeCell.row + 1}
        </span>
        <span className="informio-spreadsheet-status-hint">{t("spreadsheet.contextMenuHint")}</span>
      </div>
      <div
        ref={scrollRef}
        className="informio-spreadsheet-grid-scroll"
        onContextMenu={(event) => openMenu(event, { kind: "cell", row: activeCell.row, column: activeCell.column })}
      >
        <div className="informio-spreadsheet-grid-zoom" style={{ zoom }}>
          <div
            className="informio-spreadsheet-grid"
            aria-label={activeSheet.name}
            style={{ width: gridWidth, height: gridHeight, position: "relative" }}
          >
            <div
              className="informio-spreadsheet-grid-corner"
              style={{ position: "sticky", left: 0, top: 0, width: ROW_HEADER_WIDTH, height: COL_HEADER_HEIGHT, zIndex: 3 }}
            />
            <div style={{ position: "absolute", top: 0, left: ROW_HEADER_WIDTH, height: COL_HEADER_HEIGHT, width: colVirtualizer.getTotalSize() }}>
              {colVirtualizer.getVirtualItems().map((virtualColumn) => {
                const column = virtualColumn.index;
                return (
                  <div
                    key={column}
                    className={cn(
                      "informio-spreadsheet-grid-col-header",
                      column === activeCell.column && "is-active"
                    )}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: virtualColumn.start,
                      width: virtualColumn.size,
                      height: COL_HEADER_HEIGHT
                    }}
                    onClick={() => setActiveCell((current) => ({ ...current, column }))}
                    onContextMenu={(event) => openMenu(event, { kind: "column", column })}
                  >
                    {columnLabel(column)}
                  </div>
                );
              })}
            </div>
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const row = virtualRow.index;
              return (
                <div
                  key={row}
                  style={{
                    position: "absolute",
                    top: COL_HEADER_HEIGHT + virtualRow.start,
                    left: 0,
                    width: gridWidth,
                    height: virtualRow.size
                  }}
                >
                  <div
                    className={cn("informio-spreadsheet-grid-row-header", row === activeCell.row && "is-active")}
                    style={{
                      position: "sticky",
                      left: 0,
                      width: ROW_HEADER_WIDTH,
                      height: virtualRow.size,
                      zIndex: 2
                    }}
                    onClick={() => setActiveCell((current) => ({ ...current, row }))}
                    onContextMenu={(event) => openMenu(event, { kind: "row", row })}
                  >
                    {row + 1}
                  </div>
                  {colVirtualizer.getVirtualItems().map((virtualColumn) => {
                    const column = virtualColumn.index;
                    const value = activeSheet.rows[row]?.[column];
                    const isActive = row === activeCell.row && column === activeCell.column;
                    return (
                      <div
                        key={column}
                        className={cn("informio-spreadsheet-grid-cell", isActive && "is-active")}
                        style={{
                          position: "absolute",
                          top: 0,
                          left: ROW_HEADER_WIDTH + virtualColumn.start,
                          width: virtualColumn.size,
                          height: virtualRow.size
                        }}
                        onContextMenu={(event) => openMenu(event, { kind: "cell", row, column })}
                      >
                        <input
                          key={`${workbook.activeSheetIndex}-${row}-${column}-${cellDisplayValue(value)}`}
                          className="informio-spreadsheet-grid-input"
                          defaultValue={cellDisplayValue(value)}
                          onFocus={() => setActiveCell({ row, column })}
                          onBlur={(event) => {
                            onCellChange(workbook.activeSheetIndex, row, column, event.currentTarget.value);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.currentTarget.blur();
                            }
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div
        className="informio-spreadsheet-sheet-tabs"
        role="tablist"
        aria-label={t("spreadsheet.fileType")}
        onContextMenu={(event) => openMenu(event, { kind: "sheetBar" })}
      >
        {workbook.sheets.map((sheet, index) => (
          <button
            key={`${sheet.name}-${index}`}
            type="button"
            role="tab"
            aria-selected={index === workbook.activeSheetIndex}
            className={cn(
              "informio-spreadsheet-sheet-tab",
              index === workbook.activeSheetIndex && "is-active"
            )}
            onClick={() => onWorkbookChange({ ...workbook, activeSheetIndex: index })}
            onContextMenu={(event) => openMenu(event, { kind: "sheet", sheetIndex: index })}
          >
            {sheet.name}
          </button>
        ))}
        <button
          type="button"
          className="informio-spreadsheet-sheet-add"
          aria-label={t("spreadsheet.addSheet")}
          onClick={handleAddSheet}
        >
          <Plus size={13} strokeWidth={2} />
        </button>
      </div>
      {menu ? (
        <SpreadsheetContextMenu
          state={menu}
          canDeleteSheet={workbook.sheets.length > 1}
          onClose={() => setMenu(null)}
          onInsertRowAbove={handleInsertRowAbove}
          onInsertRowBelow={handleInsertRowBelow}
          onDeleteRow={handleDeleteRow}
          onInsertColumnLeft={handleInsertColumnLeft}
          onInsertColumnRight={handleInsertColumnRight}
          onDeleteColumn={handleDeleteColumn}
          onClearCell={handleClearCell}
          onClearRow={handleClearRow}
          onClearColumn={handleClearColumn}
          onCopy={handleCopy}
          onPaste={() => void handlePaste()}
          onAddSheet={handleAddSheet}
          onRenameSheet={handleRenameSheet}
          onDeleteSheet={handleDeleteSheet}
        />
      ) : null}
    </div>
  );
}
