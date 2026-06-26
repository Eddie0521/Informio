import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
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

export function SpreadsheetGrid({ workbook, zoom, onWorkbookChange, onCellChange }: SpreadsheetGridProps) {
  const { t } = useTranslation();
  const [activeCell, setActiveCell] = useState<ActiveCell>({ row: 0, column: 0 });
  const [menu, setMenu] = useState<SpreadsheetContextMenuState | null>(null);
  const clipboardRef = useRef("");
  const activeSheet = workbook.sheets[workbook.activeSheetIndex] ?? workbook.sheets[0];
  const { rowCount, colCount } = useMemo(() => sheetGridSize(activeSheet), [activeSheet]);

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
        className="informio-spreadsheet-grid-scroll"
        onContextMenu={(event) => openMenu(event, { kind: "cell", row: activeCell.row, column: activeCell.column })}
      >
        <div className="informio-spreadsheet-grid-zoom" style={{ zoom }}>
          <table className="informio-spreadsheet-grid" aria-label={activeSheet.name}>
            <thead>
              <tr>
                <th className="informio-spreadsheet-grid-corner" scope="col" />
                {Array.from({ length: colCount }, (_, column) => (
                  <th
                    key={column}
                    className={cn(
                      "informio-spreadsheet-grid-col-header",
                      column === activeCell.column && "is-active"
                    )}
                    scope="col"
                    onClick={() => setActiveCell((current) => ({ ...current, column }))}
                    onContextMenu={(event) => openMenu(event, { kind: "column", column })}
                  >
                    {columnLabel(column)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: rowCount }, (_, row) => (
                <tr key={row}>
                  <th
                    className={cn(
                      "informio-spreadsheet-grid-row-header",
                      row === activeCell.row && "is-active"
                    )}
                    scope="row"
                    onClick={() => setActiveCell((current) => ({ ...current, row }))}
                    onContextMenu={(event) => openMenu(event, { kind: "row", row })}
                  >
                    {row + 1}
                  </th>
                  {Array.from({ length: colCount }, (_, column) => {
                    const value = activeSheet.rows[row]?.[column];
                    const isActive = row === activeCell.row && column === activeCell.column;
                    return (
                      <td
                        key={column}
                        className={cn("informio-spreadsheet-grid-cell", isActive && "is-active")}
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
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
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
