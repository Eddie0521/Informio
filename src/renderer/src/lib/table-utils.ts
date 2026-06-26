import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { TableMap } from "@tiptap/pm/tables";
import type { TableColumnWidthInfo } from "../types";
import { TABLE_CELL_MIN_WIDTH } from "../constants";

export const tableResizeSessionRef = { active: false };

export const tablePosFromDom = (editor: Editor, table: HTMLTableElement) => {
  const firstCell = table.querySelector("th, td");
  if (firstCell instanceof HTMLTableCellElement) {
    let cellPos: number | null = null;
    try {
      const contentPos = editor.view.posAtDOM(firstCell, 0);
      const nextCellPos = Math.max(0, contentPos - 1);
      const node = editor.state.doc.nodeAt(nextCellPos);
      if (node?.type.name === "tableCell" || node?.type.name === "tableHeader") cellPos = nextCellPos;
    } catch (error) {
      console.warn("Failed to resolve table cell position:", error);
      cellPos = null;
    }
    if (cellPos !== null) {
      const $cell = editor.state.doc.resolve(cellPos);
      for (let depth = $cell.depth; depth > 0; depth -= 1) {
        if ($cell.node(depth).type.name === "table") return $cell.before(depth);
      }
    }
  }
  return null;
};

export const tableCellPosAt = (table: ProseMirrorNode, tablePos: number, rowIndex: number, columnIndex: number) => {
  const map = TableMap.get(table);
  if (rowIndex < 0 || rowIndex >= map.height || columnIndex < 0 || columnIndex >= map.width) return null;
  const offset = map.map[rowIndex * map.width + columnIndex];
  return tablePos + 1 + offset;
};

export const tableColumnLabel = (index: number) => {
  let value = index;
  let label = "";
  do {
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);
  return label;
};

export const tableColumnWidthInfo = (editor: Editor, table: HTMLTableElement, tablePos: number): TableColumnWidthInfo[] => {
  const tableNode = editor.state.doc.nodeAt(tablePos);
  if (tableNode?.type.name !== "table") return [];

  const map = TableMap.get(tableNode);
  const fallbackWidths = Array.from(table.querySelectorAll("colgroup col")).map((column) => {
    const width = Number.parseFloat(window.getComputedStyle(column).width);
    return Number.isFinite(width) && width > 0 ? width : TABLE_CELL_MIN_WIDTH;
  });

  const widths = Array.from({ length: map.width }, (_, index) => ({
    width: fallbackWidths[index] ?? TABLE_CELL_MIN_WIDTH,
    fixed: false
  }));

  const tableStart = tablePos + 1;
  for (let rowIndex = 0; rowIndex < map.height; rowIndex += 1) {
    for (let columnIndex = 0; columnIndex < map.width; columnIndex += 1) {
      if (widths[columnIndex].fixed) continue;
      const cellPos = tableCellPosAt(tableNode, tablePos, rowIndex, columnIndex);
      if (cellPos === null) continue;

      const cellNode = editor.state.doc.nodeAt(cellPos);
      if (!cellNode) continue;

      const rect = map.findCell(cellPos - tableStart);
      const colwidth = Array.isArray(cellNode.attrs.colwidth) ? cellNode.attrs.colwidth : [];
      const width = Number(colwidth[columnIndex - rect.left] ?? 0);
      if (!Number.isFinite(width) || width <= 0) continue;

      widths[columnIndex] = { width, fixed: true };
    }
  }

  return widths;
};

export const measureNaturalTableColumnWidthInfo = (
  editor: Editor,
  table: HTMLTableElement,
  tablePos: number,
  columns: HTMLElement[]
): TableColumnWidthInfo[] => {
  const previousInlineFit = table.dataset.inlineFit;
  const previousTableWidth = table.style.width;
  const previousColumnWidths = columns.map((column) => column.style.width);

  try {
    delete table.dataset.inlineFit;
    table.style.width = "";
    columns.forEach((column) => {
      column.style.width = "";
    });
    return tableColumnWidthInfo(editor, table, tablePos);
  } finally {
    if (previousInlineFit === undefined) delete table.dataset.inlineFit;
    else table.dataset.inlineFit = previousInlineFit;
    table.style.width = previousTableWidth;
    columns.forEach((column, index) => {
      column.style.width = previousColumnWidths[index] ?? "";
    });
  }
};

export const measureLogicalTableColumns = (
  editor: Editor,
  table: HTMLTableElement,
  tablePos: number,
  tableNode: ProseMirrorNode
): Array<{ left: number; width: number }> => {
  const map = TableMap.get(tableNode);
  const tableRect = table.getBoundingClientRect();
  const tableStart = tablePos + 1;
  const columns: Array<{ left: number; width: number }> = [];

  for (let columnIndex = 0; columnIndex < map.width; columnIndex += 1) {
    const offset = map.map[columnIndex];
    const rect = map.findCell(offset);
    const cellPos = tableStart + offset;
    const dom = editor.view.nodeDOM(cellPos);
    const cellElement =
      dom instanceof HTMLTableCellElement
        ? dom
        : dom instanceof HTMLElement
          ? dom.closest("th, td")
          : null;

    if (!(cellElement instanceof HTMLTableCellElement)) {
      columns.push({ left: 0, width: TABLE_CELL_MIN_WIDTH });
      continue;
    }

    const cellRect = cellElement.getBoundingClientRect();
    const colspan = Math.max(1, rect.right - rect.left);
    const logicalWidth = cellRect.width / colspan;
    columns.push({
      left: cellRect.left - tableRect.left + logicalWidth * (columnIndex - rect.left),
      width: logicalWidth
    });
  }

  return columns;
};

export const applyTableColumnWidths = (editor: Editor, tablePos: number, columnWidths: number[]) => {
  const tableNode = editor.state.doc.nodeAt(tablePos);
  if (tableNode?.type.name !== "table") return;

  const map = TableMap.get(tableNode);
  const tableStart = tablePos + 1;
  let tr = editor.state.tr;

  for (let columnIndex = 0; columnIndex < columnWidths.length && columnIndex < map.width; columnIndex += 1) {
    const columnWidth = Math.max(TABLE_CELL_MIN_WIDTH, Math.round(columnWidths[columnIndex]));
    const seenOffsets = new Set<number>();

    for (let rowIndex = 0; rowIndex < map.height; rowIndex += 1) {
      const offset = map.map[rowIndex * map.width + columnIndex];
      if (seenOffsets.has(offset)) continue;
      seenOffsets.add(offset);

      const cellPos = tableStart + offset;
      const cellNode = tr.doc.nodeAt(cellPos);
      if (!cellNode) continue;

      const rect = map.findCell(offset);
      const colspan = Math.max(1, Number(cellNode.attrs.colspan ?? 1));
      const currentColwidth = Array.isArray(cellNode.attrs.colwidth) ? [...cellNode.attrs.colwidth] : [];
      const nextColwidth = Array.from({ length: colspan }, (_, widthIndex) => {
        const currentWidth = Number(currentColwidth[widthIndex] ?? 0);
        return widthIndex === columnIndex - rect.left
          ? columnWidth
          : Number.isFinite(currentWidth) && currentWidth > 0
            ? currentWidth
            : 0;
      });

      tr = tr.setNodeMarkup(cellPos, undefined, { ...cellNode.attrs, colwidth: nextColwidth });
    }
  }

  if (tr.doc !== editor.state.doc) {
    editor.view.dispatch(tr);
  }
};
