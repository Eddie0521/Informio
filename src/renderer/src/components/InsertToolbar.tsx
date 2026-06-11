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
import { useTranslation } from "react-i18next";
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

export const getInsertToolbarActions = (t: (key: string) => string): InsertToolbarAction[] => [
  { id: "image", label: t("inserttoolbar.insertImage"), icon: ImageIcon, kind: "asset", assetKind: "image" },
  { id: "video", label: t("inserttoolbar.insertVideo"), icon: Film, kind: "asset", assetKind: "video" },
  { id: "audio", label: t("inserttoolbar.insertAudio"), icon: Music, kind: "asset", assetKind: "audio" },
  { id: "pdf", label: t("inserttoolbar.insertPdf"), icon: FileText, kind: "asset", assetKind: "pdf" },
  { id: "chart", label: t("inserttoolbar.insertMermaidChart"), icon: ChartNoAxesColumnIncreasing, kind: "command", command: "insert:chart" },
  { id: "table", label: t("inserttoolbar.insertTable"), icon: Table2, kind: "command", command: "insert:table" },
  { id: "bullet-list", label: t("inserttoolbar.insertBulletList"), icon: LayoutList, kind: "command", command: "format:bullet-list" },
  { id: "ordered-list", label: t("inserttoolbar.insertOrderedList"), icon: ListOrdered, kind: "command", command: "format:ordered-list" },
  { id: "task-list", label: t("inserttoolbar.insertTaskList"), icon: ListTodo, kind: "command", command: "format:task-list" },
  { id: "blockquote", label: t("inserttoolbar.insertNote"), icon: TextQuote, kind: "command", command: "format:blockquote" },
  { id: "callout", label: t("inserttoolbar.insertCallout"), icon: MessageSquareQuote, kind: "command", command: "insert:callout" },
  { id: "code", label: t("inserttoolbar.insertCodeBlock"), icon: Code2, kind: "command", command: "format:code-block" },
  { id: "footnote", label: t("inserttoolbar.insertFootnote"), icon: Text, kind: "command", command: "insert:footnote" },
  { id: "horizontal-rule", label: t("inserttoolbar.insertHorizontalRule"), icon: Minus, kind: "command", command: "insert:horizontal-rule" }
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
  const { t } = useTranslation();
  const insertToolbarActions = getInsertToolbarActions(t);
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
                label={t("common.undo")}
                icon={Undo2}
                disabled={!canUndo}
                onMouseDown={(event) => event.preventDefault()}
                onClick={onUndo}
                className="informio-insert-toolbar-button"
                iconClassName="text-[var(--text-muted)]"
              />
              <ToolbarGlyphButton
                label={t("common.redo")}
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
              label={propertiesOpen ? t("inserttoolbar.hideProperties") : t("inserttoolbar.showProperties")}
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
