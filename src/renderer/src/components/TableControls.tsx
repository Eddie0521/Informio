import React, { useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { NodeSelection } from "@tiptap/pm/state";
import { CellSelection, TableMap } from "@tiptap/pm/tables";
import {
  AlignCenter,
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  AlignHorizontalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  Columns3,
  Merge,
  Plus,
  Rows3,
  Split,
  Trash2,
} from "lucide-react";
import type {
  HorizontalCellAlign,
  TableColumnWidthInfo,
  TableHoverTarget,
  TableOverlayState,
  TableSelectionShape,
  VerticalCellAlign,
} from "../types";
import {
  TABLE_CELL_MIN_WIDTH,
  TABLE_CONTROL_SIZE,
  TABLE_CONTEXT_OFFSET,
  TABLE_EDGE_HIT_DISTANCE,
  TABLE_HEADER_STRIP_SIZE,
  TABLE_ROW_MIN_HEIGHT,
  TABLE_TOOLBAR_HEIGHT,
} from "../constants";
import { cn } from "../lib/utils";

const tablePosFromDom = (editor: Editor, table: HTMLTableElement) => {
  const firstCell = table.querySelector("th, td");
  if (firstCell instanceof HTMLTableCellElement) {
    let cellPos: number | null = null;
    try {
      const contentPos = editor.view.posAtDOM(firstCell, 0);
      const nextCellPos = Math.max(0, contentPos - 1);
      const node = editor.state.doc.nodeAt(nextCellPos);
      if (node?.type.name === "tableCell" || node?.type.name === "tableHeader") cellPos = nextCellPos;
    } catch {
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

const selectCellForTableCommand = (editor: Editor, table: HTMLTableElement, rowIndex: number, columnIndex: number) => {
  const row = table.rows.item(rowIndex);
  const cell = row?.cells.item(columnIndex);
  if (!cell) return false;
  const pos = editor.view.posAtDOM(cell, 0);
  editor.chain().focus().setTextSelection(pos).run();
  return true;
};

const selectionTableFromEditor = (editor: Editor) => {
  const domAtSelection = editor.view.domAtPos(editor.state.selection.from);
  const target =
    domAtSelection.node instanceof Element ? domAtSelection.node : domAtSelection.node.parentElement;
  return target?.closest("table") as HTMLTableElement | null;
};

const tableCellPosAt = (table: ProseMirrorNode, tablePos: number, rowIndex: number, columnIndex: number) => {
  const map = TableMap.get(table);
  if (rowIndex < 0 || rowIndex >= map.height || columnIndex < 0 || columnIndex >= map.width) return null;
  const offset = map.map[rowIndex * map.width + columnIndex];
  return tablePos + 1 + offset;
};

const tableRowPosAt = (table: ProseMirrorNode, tablePos: number, rowIndex: number) => {
  if (rowIndex < 0 || rowIndex >= table.childCount) return null;
  let pos = tablePos + 1;
  for (let index = 0; index < rowIndex; index += 1) {
    pos += table.child(index).nodeSize;
  }
  return pos;
};

const tableSelectionShapeFromSelection = (selection: Editor["state"]["selection"], table: ProseMirrorNode, tablePos: number): TableSelectionShape | null => {
  if (selection instanceof CellSelection) {
    const map = TableMap.get(table);
    const tableStart = tablePos + 1;
    const rect = map.rectBetween(selection.$anchorCell.pos - tableStart, selection.$headCell.pos - tableStart);
    return {
      top: rect.top,
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
      rowSelection: selection.isRowSelection(),
      columnSelection: selection.isColSelection(),
      fullTable: rect.top === 0 && rect.left === 0 && rect.bottom === map.height && rect.right === map.width
    };
  }

  if (selection instanceof NodeSelection && selection.node.type.name === "table" && selection.from === tablePos) {
    const map = TableMap.get(table);
    return {
      top: 0,
      bottom: map.height,
      left: 0,
      right: map.width,
      rowSelection: false,
      columnSelection: false,
      fullTable: true
    };
  }

  const { $from } = selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name !== "tableCell" && node.type.name !== "tableHeader") continue;
    const cellPos = $from.before(depth);
    const map = TableMap.get(table);
    const tableStart = tablePos + 1;
    const rect = map.findCell(cellPos - tableStart);
    return {
      top: rect.top,
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
      rowSelection: false,
      columnSelection: false,
      fullTable: false
    };
  }

  return null;
};

const activeTableCellNodeFromSelection = (selection: Editor["state"]["selection"]) => {
  if (selection instanceof CellSelection) {
    return selection.$anchorCell.nodeAfter;
  }
  if (selection instanceof NodeSelection && (selection.node.type.name === "tableCell" || selection.node.type.name === "tableHeader")) {
    return selection.node;
  }
  const { $from } = selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name === "tableCell" || node.type.name === "tableHeader") return node;
  }
  return null;
};

const tableColumnLabel = (index: number) => {
  let value = index;
  let label = "";
  do {
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);
  return label;
};

const tableColumnWidthInfo = (editor: Editor, table: HTMLTableElement, tablePos: number): TableColumnWidthInfo[] => {
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

const measureNaturalTableColumnWidthInfo = (
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

const nearestTableHoverTarget = (overlay: TableOverlayState, clientX: number, clientY: number): TableHoverTarget => {
  const tableRect = overlay.table.getBoundingClientRect();
  const relativeX = clientX - tableRect.left;
  const relativeY = clientY - tableRect.top;
  const columnLines = [0, ...overlay.columns.map((column) => column.left + column.width)];
  const rowLines = [0, ...overlay.rows.map((row) => row.top + row.height)];
  const nearestColumn = columnLines.reduce(
    (best, line, index) => {
      const distance = Math.abs(relativeX - line);
      return distance < best.distance ? { index, distance } : best;
    },
    { index: -1, distance: Number.POSITIVE_INFINITY }
  );
  const nearestRow = rowLines.reduce(
    (best, line, index) => {
      const distance = Math.abs(relativeY - line);
      return distance < best.distance ? { index, distance } : best;
    },
    { index: -1, distance: Number.POSITIVE_INFINITY }
  );
  const insideColumnBand = relativeY >= -TABLE_EDGE_HIT_DISTANCE && relativeY <= overlay.rect.height + TABLE_EDGE_HIT_DISTANCE;
  const insideRowBand = relativeX >= -TABLE_EDGE_HIT_DISTANCE && relativeX <= overlay.rect.width + TABLE_EDGE_HIT_DISTANCE;
  const columnTarget =
    insideColumnBand && nearestColumn.distance <= TABLE_EDGE_HIT_DISTANCE
      ? ({ axis: "column", index: nearestColumn.index } as const)
      : null;
  const rowTarget =
    insideRowBand && nearestRow.distance <= TABLE_EDGE_HIT_DISTANCE
      ? ({ axis: "row", index: nearestRow.index } as const)
      : null;
  if (columnTarget && rowTarget) return nearestColumn.distance <= nearestRow.distance ? columnTarget : rowTarget;
  return columnTarget ?? rowTarget;
};

export function TableControls({ editor, containerRef }: { editor: Editor | null; containerRef: React.RefObject<HTMLElement | null> }) {
  const [overlay, setOverlay] = useState<TableOverlayState | null>(null);
  const [hoverTarget, setHoverTarget] = useState<TableHoverTarget>(null);
  const selectionTableRef = useRef<HTMLTableElement | null>(null);

  const measureTable = (table: HTMLTableElement): TableOverlayState | null => {
    const container = containerRef.current;
    if (!container) return null;
    const tablePos = tablePosFromDom(editor!, table);
    if (tablePos === null) return null;
    const containerRect = container.getBoundingClientRect();
    const tableRect = table.getBoundingClientRect();
    const firstRow = table.rows.item(0);
    if (!firstRow) return null;
    const tableNode = editor?.state.doc.nodeAt(tablePos);
    if (tableNode?.type.name !== "table") return null;
    const map = TableMap.get(tableNode);
    const colGroupColumns = Array.from(table.querySelectorAll("colgroup col"))
      .map((column) => Number.parseFloat(window.getComputedStyle(column).width))
      .filter((width) => Number.isFinite(width) && width > 0);
    const columns =
      colGroupColumns.length === map.width
        ? (() => {
            let accumulatedLeft = 0;
            return colGroupColumns.map((width) => {
              const column = { left: accumulatedLeft, width };
              accumulatedLeft += width;
              return column;
            });
          })()
        : Array.from(firstRow.cells).flatMap((cell) => {
            const rect = cell.getBoundingClientRect();
            const colspan = Math.max(1, cell.colSpan || 1);
            const logicalWidth = rect.width / colspan;
            return Array.from({ length: colspan }, (_, columnIndex) => ({
              left: rect.left - tableRect.left + logicalWidth * columnIndex,
              width: logicalWidth
            }));
          }).slice(0, map.width);
    return {
      table,
      tablePos,
      rect: {
        top: tableRect.top - containerRect.top + container.scrollTop,
        left: tableRect.left - containerRect.left + container.scrollLeft,
        width: tableRect.width,
        height: tableRect.height
      },
      rows: Array.from(table.rows).map((row) => {
        const rect = row.getBoundingClientRect();
        return { top: rect.top - tableRect.top, height: rect.height };
      }),
      columns
    };
  };

  const refreshOverlay = (table = overlay?.table) => {
    if (!table || !document.body.contains(table)) {
      setOverlay(null);
      return;
    }
    setOverlay(measureTable(table));
  };

  useEffect(() => {
    if (!editor) return;
    const container = containerRef.current;
    if (!container) return;

    const onPointerMove = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("[data-table-controls]")) return;
      const table =
        (target?.closest("table") as HTMLTableElement | null) ??
        (target?.closest(".tableWrapper")?.querySelector("table") as HTMLTableElement | null);
      if (!table) {
        setHoverTarget(null);
        if (selectionTableRef.current) refreshOverlay(selectionTableRef.current);
        else setOverlay(null);
        return;
      }
      const measured = measureTable(table);
      setOverlay(measured);
      setHoverTarget(measured ? nearestTableHoverTarget(measured, event.clientX, event.clientY) : null);
    };
    const onPointerLeave = () => {
      setHoverTarget(null);
      if (selectionTableRef.current) refreshOverlay(selectionTableRef.current);
      else setOverlay(null);
    };
    const updateFromSelection = () => {
      const table = selectionTableFromEditor(editor);
      selectionTableRef.current = table;
      if (table) refreshOverlay(table);
      else if (!hoverTarget) setOverlay(null);
    };
    const onScroll = () => refreshOverlay();
    const onResize = () => refreshOverlay();

    container.addEventListener("pointermove", onPointerMove);
    container.addEventListener("pointerleave", onPointerLeave);
    container.addEventListener("scroll", onScroll);
    window.addEventListener("resize", onResize);
    editor.on("selectionUpdate", updateFromSelection);
    editor.on("update", updateFromSelection);
    updateFromSelection();
    return () => {
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("pointerleave", onPointerLeave);
      container.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      editor.off("selectionUpdate", updateFromSelection);
      editor.off("update", updateFromSelection);
    };
  }, [containerRef, editor, hoverTarget, overlay?.table]);

  if (!editor || !overlay) return null;

  const selectionInOverlayTable = selectionTableRef.current === overlay.table;
  const tableNode = editor.state.doc.nodeAt(overlay.tablePos);
  if (tableNode?.type.name !== "table") return null;

  const hasCellSelection = selectionInOverlayTable && editor.state.selection instanceof CellSelection;
  const selectionShape = selectionInOverlayTable ? tableSelectionShapeFromSelection(editor.state.selection, tableNode, overlay.tablePos) : null;
  const activeCellNode = selectionInOverlayTable ? activeTableCellNodeFromSelection(editor.state.selection) : null;
  const currentHorizontalAlign = (activeCellNode?.attrs.align as HorizontalCellAlign | undefined) ?? "center";
  const currentVerticalAlign = (activeCellNode?.attrs.verticalAlign as VerticalCellAlign | undefined) ?? "middle";
  const canMergeCells = hasCellSelection && editor.can().chain().focus().mergeCells().run();
  const canSplitCell = selectionInOverlayTable && editor.can().chain().focus().splitCell().run();
  const canDeleteRow = selectionInOverlayTable && editor.can().chain().focus().deleteRow().run();
  const canDeleteColumn = selectionInOverlayTable && editor.can().chain().focus().deleteColumn().run();
  const canDeleteTable = selectionInOverlayTable && editor.can().chain().focus().deleteTable().run();

  const applyCellAttribute = (name: "align" | "verticalAlign", value: HorizontalCellAlign | VerticalCellAlign) => {
    if (!selectionInOverlayTable) return;
    editor.chain().focus().setCellAttribute(name, value).run();
    window.setTimeout(() => refreshOverlay(), 0);
  };

  const setSelectionAndFocus = (selection: CellSelection) => {
    editor.view.dispatch(editor.state.tr.setSelection(selection).scrollIntoView());
    editor.view.focus();
    window.setTimeout(() => refreshOverlay(), 0);
  };

  const selectTableRowAt = (rowIndex: number) => {
    const map = TableMap.get(tableNode);
    const anchor = tableCellPosAt(tableNode, overlay.tablePos, rowIndex, 0);
    const head = tableCellPosAt(tableNode, overlay.tablePos, rowIndex, map.width - 1);
    if (anchor === null || head === null) return;
    setSelectionAndFocus(CellSelection.rowSelection(editor.state.doc.resolve(anchor), editor.state.doc.resolve(head)));
  };

  const selectTableColumnAt = (columnIndex: number) => {
    const map = TableMap.get(tableNode);
    const anchor = tableCellPosAt(tableNode, overlay.tablePos, 0, columnIndex);
    const head = tableCellPosAt(tableNode, overlay.tablePos, map.height - 1, columnIndex);
    if (anchor === null || head === null) return;
    setSelectionAndFocus(CellSelection.colSelection(editor.state.doc.resolve(anchor), editor.state.doc.resolve(head)));
  };

  const selectWholeTable = () => {
    const map = TableMap.get(tableNode);
    const anchor = tableCellPosAt(tableNode, overlay.tablePos, 0, 0);
    const head = tableCellPosAt(tableNode, overlay.tablePos, map.height - 1, map.width - 1);
    if (anchor === null || head === null) return;
    setSelectionAndFocus(CellSelection.create(editor.state.doc, anchor, head));
  };

  const updateRowHeight = (rowIndex: number, nextHeight: number) => {
    const rowPos = tableRowPosAt(tableNode, overlay.tablePos, rowIndex);
    if (rowPos === null) return;
    const rowNode = tableNode.child(rowIndex);
    const rowHeight = Math.max(TABLE_ROW_MIN_HEIGHT, Math.round(nextHeight));
    const tr = editor.state.tr.setNodeMarkup(rowPos, undefined, { ...rowNode.attrs, rowHeight });
    editor.view.dispatch(tr);
  };

  const updateColumnWidth = (columnIndex: number, nextWidth: number) => {
    const map = TableMap.get(tableNode);
    const tableStart = overlay.tablePos + 1;
    const columnWidth = Math.max(TABLE_CELL_MIN_WIDTH, Math.round(nextWidth));
    const seenOffsets = new Set<number>();
    let tr = editor.state.tr;

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

    editor.view.dispatch(tr);
  };

  const startRowResize = (rowIndex: number, event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const baseHeight = overlay.rows[rowIndex]?.height ?? TABLE_ROW_MIN_HEIGHT;
    const startY = event.clientY;
    const onPointerMove = (moveEvent: PointerEvent) => {
      updateRowHeight(rowIndex, baseHeight + (moveEvent.clientY - startY));
      refreshOverlay();
    };
    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      refreshOverlay();
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, { once: true });
  };

  const startColumnResize = (columnIndex: number, event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const baseWidth = overlay.columns[columnIndex]?.width ?? TABLE_CELL_MIN_WIDTH;
    const startX = event.clientX;
    const onPointerMove = (moveEvent: PointerEvent) => {
      updateColumnWidth(columnIndex, baseWidth + (moveEvent.clientX - startX));
      refreshOverlay();
    };
    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      refreshOverlay();
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, { once: true });
  };

  const runTableTool = (
    action:
      | "merge-cells"
      | "split-cell"
      | "delete-row"
      | "delete-column"
      | "delete-table"
  ) => {
    if (!selectionInOverlayTable) return;
    if (action === "merge-cells") {
      if (!canMergeCells) return;
      editor.chain().focus().mergeCells().run();
    } else if (action === "split-cell") {
      if (!canSplitCell) return;
      editor.chain().focus().splitCell().run();
    } else if (action === "delete-row") {
      if (!canDeleteRow) return;
      editor.chain().focus().deleteRow().run();
    } else if (action === "delete-column") {
      if (!canDeleteColumn) return;
      editor.chain().focus().deleteColumn().run();
    } else if (action === "delete-table") {
      if (!canDeleteTable) return;
      editor.chain().focus().deleteTable().run();
      setHoverTarget(null);
      setOverlay(null);
      selectionTableRef.current = null;
      return;
    }
    window.setTimeout(() => refreshOverlay(), 0);
  };

  const contextAddButtonPosition = hoverTarget
    ? hoverTarget.axis === "column"
      ? {
          top: overlay.rect.top - TABLE_CONTEXT_OFFSET,
          left:
            overlay.rect.left +
            (hoverTarget.index <= 0
              ? 0
              : hoverTarget.index >= overlay.columns.length
                ? overlay.rect.width
                : overlay.columns[hoverTarget.index].left) -
            TABLE_CONTROL_SIZE / 2
        }
      : {
          top:
            overlay.rect.top +
            (hoverTarget.index <= 0
              ? 0
              : hoverTarget.index >= overlay.rows.length
                ? overlay.rect.height
                : overlay.rows[hoverTarget.index].top) -
            TABLE_CONTROL_SIZE / 2,
          left: overlay.rect.left - TABLE_CONTEXT_OFFSET
        }
    : null;

  const runContextAdd = () => {
    if (!hoverTarget) return;
    if (hoverTarget.axis === "column") {
      if (hoverTarget.index <= 0) {
        if (!selectCellForTableCommand(editor, overlay.table, 0, 0)) return;
        editor.chain().focus().addColumnBefore().run();
      } else if (hoverTarget.index >= overlay.columns.length) {
        if (!selectCellForTableCommand(editor, overlay.table, 0, Math.max(0, overlay.columns.length - 1))) return;
        editor.chain().focus().addColumnAfter().run();
      }
      else {
        if (!selectCellForTableCommand(editor, overlay.table, 0, hoverTarget.index)) return;
        editor.chain().focus().addColumnBefore().run();
      }
      window.setTimeout(() => refreshOverlay(), 0);
      return;
    }

    if (hoverTarget.index <= 0) {
      if (!selectCellForTableCommand(editor, overlay.table, 0, 0)) return;
      editor.chain().focus().addRowBefore().run();
    } else if (hoverTarget.index >= overlay.rows.length) {
      if (!selectCellForTableCommand(editor, overlay.table, Math.max(0, overlay.rows.length - 1), 0)) return;
      editor.chain().focus().addRowAfter().run();
    }
    else {
      if (!selectCellForTableCommand(editor, overlay.table, hoverTarget.index, 0)) return;
      editor.chain().focus().addRowBefore().run();
    }
    window.setTimeout(() => refreshOverlay(), 0);
  };

  return (
    <div className="informio-table-controls" data-table-controls="true" contentEditable={false}>
      {contextAddButtonPosition ? (
        <button
          type="button"
          className="informio-table-context-add"
          style={contextAddButtonPosition}
          aria-label={hoverTarget?.axis === "column" ? "添加列" : "添加行"}
          title={hoverTarget?.axis === "column" ? "添加列" : "添加行"}
          onMouseDown={(event) => event.preventDefault()}
          onClick={runContextAdd}
        >
          <Plus size={12} />
        </button>
      ) : null}

      <div
        className="informio-table-toolbar"
        style={{
          top: overlay.rect.top - TABLE_HEADER_STRIP_SIZE - TABLE_TOOLBAR_HEIGHT - 6,
          left: overlay.rect.left + TABLE_HEADER_STRIP_SIZE
        }}
      >
        <button
          type="button"
          className={cn("informio-table-toolbutton", currentHorizontalAlign === "left" && "is-active")}
          aria-label="水平左对齐"
          title="水平左对齐"
          disabled={!selectionInOverlayTable}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => applyCellAttribute("align", "left")}
        >
          <AlignHorizontalJustifyStart size={13} />
        </button>
        <button
          type="button"
          className={cn("informio-table-toolbutton", currentHorizontalAlign === "center" && "is-active")}
          aria-label="水平居中"
          title="水平居中"
          disabled={!selectionInOverlayTable}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => applyCellAttribute("align", "center")}
        >
          <AlignHorizontalJustifyCenter size={13} />
        </button>
        <button
          type="button"
          className={cn("informio-table-toolbutton", currentHorizontalAlign === "right" && "is-active")}
          aria-label="水平右对齐"
          title="水平右对齐"
          disabled={!selectionInOverlayTable}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => applyCellAttribute("align", "right")}
        >
          <AlignHorizontalJustifyEnd size={13} />
        </button>
        <div className="informio-table-toolbar-divider" aria-hidden="true" />
        <button
          type="button"
          className={cn("informio-table-toolbutton", currentVerticalAlign === "top" && "is-active")}
          aria-label="垂直顶对齐"
          title="垂直顶对齐"
          disabled={!selectionInOverlayTable}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => applyCellAttribute("verticalAlign", "top")}
        >
          <AlignVerticalJustifyStart size={13} />
        </button>
        <button
          type="button"
          className={cn("informio-table-toolbutton", currentVerticalAlign === "middle" && "is-active")}
          aria-label="垂直居中"
          title="垂直居中"
          disabled={!selectionInOverlayTable}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => applyCellAttribute("verticalAlign", "middle")}
        >
          <AlignVerticalJustifyCenter size={13} />
        </button>
        <button
          type="button"
          className={cn("informio-table-toolbutton", currentVerticalAlign === "bottom" && "is-active")}
          aria-label="垂直底对齐"
          title="垂直底对齐"
          disabled={!selectionInOverlayTable}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => applyCellAttribute("verticalAlign", "bottom")}
        >
          <AlignVerticalJustifyEnd size={13} />
        </button>
        <div className="informio-table-toolbar-divider" aria-hidden="true" />
        <button
          type="button"
          className="informio-table-toolbutton"
          aria-label="合并单元格"
          title="合并单元格"
          disabled={!canMergeCells}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => runTableTool("merge-cells")}
        >
          <Merge size={13} />
        </button>
        <button
          type="button"
          className="informio-table-toolbutton"
          aria-label="拆分单元格"
          title="拆分单元格"
          disabled={!canSplitCell}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => runTableTool("split-cell")}
        >
          <Split size={13} />
        </button>
        <div className="informio-table-toolbar-divider" aria-hidden="true" />
        <button
          type="button"
          className="informio-table-toolbutton is-danger"
          aria-label="删除行"
          title="删除行"
          disabled={!canDeleteRow}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => runTableTool("delete-row")}
        >
          <Rows3 size={13} />
        </button>
        <button
          type="button"
          className="informio-table-toolbutton is-danger"
          aria-label="删除列"
          title="删除列"
          disabled={!canDeleteColumn}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => runTableTool("delete-column")}
        >
          <Columns3 size={13} />
        </button>
        <button
          type="button"
          className="informio-table-toolbutton is-danger"
          aria-label="删除表格"
          title="删除表格"
          disabled={!canDeleteTable}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => runTableTool("delete-table")}
        >
          <Trash2 size={13} />
        </button>
      </div>

      <button
        type="button"
        className={cn("informio-table-corner-button", selectionShape?.fullTable && "is-active")}
        style={{
          top: overlay.rect.top - TABLE_HEADER_STRIP_SIZE,
          left: overlay.rect.left - TABLE_HEADER_STRIP_SIZE,
          width: TABLE_HEADER_STRIP_SIZE,
          height: TABLE_HEADER_STRIP_SIZE
        }}
        aria-label="选中整个表格"
        title="选中整个表格"
        onMouseDown={(event) => event.preventDefault()}
        onClick={selectWholeTable}
      >
        <AlignCenter size={12} />
      </button>

      {overlay.columns.map((column, columnIndex) => (
        <div
          key={`column-header-${columnIndex}`}
          className="informio-table-column-header"
          style={{
            top: overlay.rect.top - TABLE_HEADER_STRIP_SIZE,
            left: overlay.rect.left + column.left,
            width: column.width,
            height: TABLE_HEADER_STRIP_SIZE
          }}
        >
          <button
            type="button"
            className={cn(
              "informio-table-header-button is-column",
              selectionShape && columnIndex >= selectionShape.left && columnIndex < selectionShape.right && "is-active"
            )}
            style={{ width: column.width, height: TABLE_HEADER_STRIP_SIZE }}
            aria-label={`选中第 ${columnIndex + 1} 列`}
            title={`选中第 ${columnIndex + 1} 列`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => selectTableColumnAt(columnIndex)}
          >
            <span>{tableColumnLabel(columnIndex)}</span>
          </button>
          <button
            type="button"
            className="informio-table-column-resize-handle"
            aria-label={`调整第 ${columnIndex + 1} 列宽度`}
            title={`调整第 ${columnIndex + 1} 列宽度`}
            onMouseDown={(event) => startColumnResize(columnIndex, event)}
          />
        </div>
      ))}

      {overlay.rows.map((row, rowIndex) => (
        <div
          key={`row-header-${rowIndex}`}
          className="informio-table-row-header"
          style={{
            top: overlay.rect.top + row.top,
            left: overlay.rect.left - TABLE_HEADER_STRIP_SIZE,
            width: TABLE_HEADER_STRIP_SIZE,
            height: row.height
          }}
        >
          <button
            type="button"
            className={cn(
              "informio-table-header-button is-row",
              selectionShape && rowIndex >= selectionShape.top && rowIndex < selectionShape.bottom && "is-active"
            )}
            style={{ width: TABLE_HEADER_STRIP_SIZE, height: row.height }}
            aria-label={`选中第 ${rowIndex + 1} 行`}
            title={`选中第 ${rowIndex + 1} 行`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => selectTableRowAt(rowIndex)}
          >
            <span>{rowIndex + 1}</span>
          </button>
          <button
            type="button"
            className="informio-table-row-resize-handle"
            aria-label={`调整第 ${rowIndex + 1} 行高度`}
            title={`调整第 ${rowIndex + 1} 行高度`}
            onMouseDown={(event) => startRowResize(rowIndex, event)}
          />
        </div>
      ))}
    </div>
  );
}
