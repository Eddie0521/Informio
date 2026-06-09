import {
  Bookmark,
  ChartNoAxesColumnIncreasing,
  Code2,
  FileText,
  Film,
  ImageIcon,
  LayoutList,
  ListOrdered,
  ListTodo,
  MessageSquareQuote,
  Minus,
  Music,
  Redo2,
  Table2,
  Text,
  TextQuote,
  Undo2
} from "lucide-react";
import type { InsertToolbarAction } from "../types";
import { selectionToolbarSafeAreaSelector } from "../constants";
import { cn } from "../lib/utils";
import { ToolbarGlyphButton } from "./ToolbarGlyphButton";

let selectionToolbarInteractionLockUntil = 0;

export const markSelectionToolbarInteraction = () => {
  selectionToolbarInteractionLockUntil = Date.now() + 250;
};

export const isSelectionToolbarInteractionActive = () => {
  const activeInsideToolbar =
    typeof document !== "undefined" && document.activeElement instanceof HTMLElement
      ? Boolean(document.activeElement.closest(selectionToolbarSafeAreaSelector))
      : false;
  return activeInsideToolbar || Date.now() < selectionToolbarInteractionLockUntil;
};

export const insertToolbarActions: InsertToolbarAction[] = [
  { id: "image", label: "插入图片", icon: ImageIcon, kind: "asset", assetKind: "image" },
  { id: "video", label: "插入视频", icon: Film, kind: "asset", assetKind: "video" },
  { id: "audio", label: "插入音频", icon: Music, kind: "asset", assetKind: "audio" },
  { id: "pdf", label: "插入 PDF", icon: FileText, kind: "asset", assetKind: "pdf" },
  { id: "chart", label: "插入 Mermaid 图表", icon: ChartNoAxesColumnIncreasing, kind: "command", command: "insert:chart" },
  { id: "table", label: "插入表格", icon: Table2, kind: "command", command: "insert:table" },
  { id: "bullet-list", label: "插入项目符号列表", icon: LayoutList, kind: "command", command: "format:bullet-list" },
  { id: "ordered-list", label: "插入编号列表", icon: ListOrdered, kind: "command", command: "format:ordered-list" },
  { id: "task-list", label: "插入任务列表", icon: ListTodo, kind: "command", command: "format:task-list" },
  { id: "blockquote", label: "插入 Note", icon: TextQuote, kind: "command", command: "format:blockquote" },
  { id: "callout", label: "插入 Callout", icon: MessageSquareQuote, kind: "command", command: "insert:callout" },
  { id: "code", label: "插入代码块", icon: Code2, kind: "command", command: "format:code-block" },
  { id: "footnote", label: "插入脚注", icon: Text, kind: "command", command: "insert:footnote" },
  { id: "horizontal-rule", label: "插入水平分隔线", icon: Minus, kind: "command", command: "insert:horizontal-rule" }
];

export function InsertToolbar({
  onAction,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  propertiesOpen,
  onToggleProperties
}: {
  onAction: (action: InsertToolbarAction) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  propertiesOpen?: boolean;
  onToggleProperties?: () => void;
}) {
  const showHistoryControls = Boolean(onUndo && onRedo);
  const showPropertiesToggle = Boolean(onToggleProperties);
  const showHistoryDivider = showHistoryControls && insertToolbarActions.length > 0;
  const showPropertiesDivider = showPropertiesToggle && insertToolbarActions.length > 0;

  return (
    <section className="informio-insert-toolbar" data-selection-toolbar-safe-area="true" onMouseDownCapture={markSelectionToolbarInteraction}>
      <div className="informio-insert-toolbar-row">
        <div className="informio-insert-toolbar-group">
          {showHistoryControls ? (
            <>
              <ToolbarGlyphButton
                label="撤销"
                icon={Undo2}
                disabled={!canUndo}
                onMouseDown={(event) => event.preventDefault()}
                onClick={onUndo}
                className="informio-insert-toolbar-button"
                iconClassName="text-[var(--text-muted)]"
              />
              <ToolbarGlyphButton
                label="重做"
                icon={Redo2}
                disabled={!canRedo}
                onMouseDown={(event) => event.preventDefault()}
                onClick={onRedo}
                className="informio-insert-toolbar-button"
                iconClassName="text-[var(--text-muted)]"
              />
            </>
          ) : null}
          {showHistoryDivider ? <div className="informio-insert-toolbar-divider" aria-hidden="true" /> : null}
          {insertToolbarActions.map((action) => (
            <ToolbarGlyphButton
              key={action.id}
              label={action.label}
              icon={action.icon}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onAction(action)}
              className="informio-insert-toolbar-button"
              iconClassName="text-[var(--text-muted)]"
            />
          ))}
          {showPropertiesDivider ? <div className="informio-insert-toolbar-divider" aria-hidden="true" /> : null}
          {showPropertiesToggle ? (
            <ToolbarGlyphButton
              label={propertiesOpen ? "隐藏属性" : "显示属性"}
              icon={Bookmark}
              pressed={propertiesOpen}
              onMouseDown={(event) => event.preventDefault()}
              onClick={onToggleProperties}
              className={cn("informio-insert-toolbar-button", propertiesOpen && "is-open")}
              iconClassName="text-[var(--text-muted)]"
            />
          ) : null}
        </div>
      </div>
      <div className="informio-insert-toolbar-rule" aria-hidden="true" />
    </section>
  );
}
