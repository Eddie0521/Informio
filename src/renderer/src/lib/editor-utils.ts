import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type {
  AgentSelection,
  EditorPaneState,
  EditorTextSearchIndex,
  PdfSelectionRect
} from "../types";

export function normalizeEditorPanes(
  panes: EditorPaneState[],
  isValidDocument: (documentId: string) => boolean = () => true
): EditorPaneState[] {
  const valid = panes.filter((pane) => isValidDocument(pane.documentId)).slice(0, 2);
  if (!valid.length) return [];
  const normalized = valid.map((pane, index) => ({
    id: (index === 0 ? "main" : "secondary") as EditorPaneState["id"],
    documentId: pane.documentId
  }));
  if (normalized.length === 2 && normalized[0].documentId === normalized[1].documentId) {
    return [{ id: "main", documentId: normalized[0].documentId }];
  }
  return normalized;
}

export function formatRelative(value: string) {
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.round(diff / 60000));
  if (minutes < 60) return `edited ${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `edited ${hours}h ago`;
  return "edited yesterday";
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export const samePdfSelectionRects = (left: PdfSelectionRect[] | undefined, right: PdfSelectionRect[] | undefined) => {
  const leftRects = left ?? [];
  const rightRects = right ?? [];
  if (leftRects.length !== rightRects.length) return false;
  return leftRects.every((rect, index) => {
    const other = rightRects[index];
    return (
      rect.x === other?.x &&
      rect.y === other?.y &&
      rect.width === other?.width &&
      rect.height === other?.height
    );
  });
};

export const sameAgentSelection = (left: AgentSelection | null, right: AgentSelection | null) => {
  if (left === right) return true;
  if (!left || !right) return false;
  return (
    left.kind === right.kind &&
    left.documentId === right.documentId &&
    left.from === right.from &&
    left.to === right.to &&
    left.text === right.text &&
    left.markdown === right.markdown &&
    left.title === right.title &&
    left.filePath === right.filePath &&
    left.page === right.page &&
    left.overlayLeft === right.overlayLeft &&
    left.overlayTop === right.overlayTop &&
    samePdfSelectionRects(left.rects, right.rects)
  );
};

export const buildEditorTextSearchIndex = (doc: ProseMirrorNode): EditorTextSearchIndex => {
  const chars: string[] = [];
  const positions: number[] = [];
  let firstBlock = true;

  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    if (!firstBlock) {
      chars.push("\n");
      positions.push(Math.max(0, pos));
    }
    firstBlock = false;
    node.descendants((child, childPos) => {
      const absolutePos = pos + 1 + childPos;
      if (child.isText) {
        Array.from(child.text ?? "").forEach((char, index) => {
          chars.push(char);
          positions.push(absolutePos + index);
        });
      } else if (child.type.name === "hardBreak") {
        chars.push("\n");
        positions.push(absolutePos);
      }
      return true;
    });
    return false;
  });

  return { text: chars.join(""), positions };
};

export const findNextTextMatch = (text: string, query: string, fromIndex: number) => {
  if (!query) return null;
  const firstIndex = text.indexOf(query, Math.max(0, fromIndex));
  if (firstIndex >= 0) return { start: firstIndex, end: firstIndex + query.length };
  const wrappedIndex = text.indexOf(query, 0);
  return wrappedIndex >= 0 ? { start: wrappedIndex, end: wrappedIndex + query.length } : null;
};
