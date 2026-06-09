import { Extension } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import { Table } from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import { NodeSelection } from "@tiptap/pm/state";
import { CellSelection } from "@tiptap/pm/tables";
import type { HorizontalCellAlign, VerticalCellAlign } from "../types";
import { tableJsonUsesRichMarkdown, renderRichTableToMarkdown, renderTableToGfm } from "../lib/markdown";

export const ResizableTableRow = TableRow.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      rowHeight: {
        default: null,
        parseHTML: (element) => {
          const raw = element.getAttribute("data-rowheight") || element.style.height;
          const height = raw ? Number.parseInt(raw, 10) : Number.NaN;
          return Number.isFinite(height) && height > 0 ? height : null;
        },
        renderHTML: (attributes) => {
          const rowHeight = Number(attributes.rowHeight);
          if (!Number.isFinite(rowHeight) || rowHeight <= 0) return {};
          return {
            "data-rowheight": String(rowHeight),
            style: `height: ${rowHeight}px`
          };
        }
      }
    };
  }
});

export const parseHorizontalCellAlign = (element: HTMLElement) => {
  const raw = (element.getAttribute("align") || element.style.textAlign || "").trim().toLowerCase();
  return raw === "left" || raw === "right" || raw === "center" ? (raw as HorizontalCellAlign) : "center";
};

export const parseVerticalCellAlign = (element: HTMLElement) => {
  const raw = (element.getAttribute("valign") || element.style.verticalAlign || "").trim().toLowerCase();
  if (raw === "top" || raw === "bottom" || raw === "middle") return raw as VerticalCellAlign;
  return "middle";
};

export const renderCellStyle = (attributes: Record<string, unknown>) => {
  const align = typeof attributes.align === "string" ? attributes.align : "center";
  const verticalAlign = typeof attributes.verticalAlign === "string" ? attributes.verticalAlign : "middle";
  const styles = [`text-align:${align}`, `vertical-align:${verticalAlign}`];
  return { style: `${styles.join(";")};` };
};

export const AlignableTableCell = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      align: {
        default: "center",
        parseHTML: (element: HTMLElement) => parseHorizontalCellAlign(element),
        renderHTML: (attributes: Record<string, unknown>) => renderCellStyle(attributes)
      },
      verticalAlign: {
        default: "middle",
        parseHTML: (element: HTMLElement) => parseVerticalCellAlign(element),
        renderHTML: (attributes: Record<string, unknown>) => renderCellStyle(attributes)
      }
    };
  }
});

export const AlignableTableHeader = TableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      align: {
        default: "center",
        parseHTML: (element: HTMLElement) => parseHorizontalCellAlign(element),
        renderHTML: (attributes: Record<string, unknown>) => renderCellStyle(attributes)
      },
      verticalAlign: {
        default: "middle",
        parseHTML: (element: HTMLElement) => parseVerticalCellAlign(element),
        renderHTML: (attributes: Record<string, unknown>) => renderCellStyle(attributes)
      }
    };
  }
});

export const RichTable = Table.extend({
  draggable: true,
  renderMarkdown(node, h) {
    const content = node as JSONContent;
    return tableJsonUsesRichMarkdown(content) ? renderRichTableToMarkdown(content) : renderTableToGfm(content, h);
  }
});

export const TableStructureKeymap = Extension.create({
  name: "tableStructureKeymap",
  priority: 1000,
  addKeyboardShortcuts() {
    const deleteStructuredSelection = () => {
      const selection = this.editor.state.selection;
      if (selection instanceof CellSelection) {
        if (selection.isRowSelection()) return this.editor.commands.deleteRow();
        if (selection.isColSelection()) return this.editor.commands.deleteColumn();
        return false;
      }
      if (selection instanceof NodeSelection && selection.node.type.name === "table") {
        this.editor.view.dispatch(this.editor.state.tr.deleteSelection().scrollIntoView());
        return true;
      }
      return false;
    };

    return {
      Backspace: deleteStructuredSelection,
      Delete: deleteStructuredSelection,
      "Mod-Backspace": deleteStructuredSelection,
      "Mod-Delete": deleteStructuredSelection
    };
  }
});
