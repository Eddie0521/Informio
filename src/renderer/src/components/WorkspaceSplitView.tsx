import { Fragment, useMemo } from "react";
import type { DragEvent as ReactDragEvent, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Maximize2, X } from "lucide-react";
import type { EditorDropZone, SplitDirection, WorkspaceDropTarget, WorkspaceLeafNode, WorkspaceSplitNode } from "../types";
import { cn } from "../lib/utils";
import {
  AGENT_DRAG_MIME,
  BROWSER_DRAG_MIME,
  MAX_WORKSPACE_PANES,
  countWorkspaceLeaves,
  paneDropZoneFromRect,
  updateSplitRatioAtPath,
} from "../lib/workspace-layout-utils";
import { DOCUMENT_DRAG_MIME, isInternalDocumentDrag } from "../lib/file-tree";
import { BROWSER_BOUNDS_SYNC_EVENT } from "./BrowserPanel";

type WorkspaceSplitViewProps = {
  layout: WorkspaceSplitNode;
  activePaneId: string;
  dropTarget: WorkspaceDropTarget;
  splitPath?: readonly number[];
  onActivatePane: (paneId: string) => void;
  onMaximizePane: (paneId: string) => void;
  onClosePane: (paneId: string) => void;
  onDropTargetChange: (target: WorkspaceDropTarget) => void;
  onDrop: (target: WorkspaceDropTarget, dataTransfer: DataTransfer) => void;
  onResizeSplit: (path: readonly number[], ratio: number) => void;
  renderLeaf: (leaf: WorkspaceLeafNode, active: boolean) => ReactNode;
};

const isToolPaneDrag = (dataTransfer: DataTransfer) =>
  dataTransfer.types.includes(BROWSER_DRAG_MIME) || dataTransfer.types.includes(AGENT_DRAG_MIME);

const isWorkspaceDrag = (dataTransfer: DataTransfer) => isInternalDocumentDrag(dataTransfer) || isToolPaneDrag(dataTransfer);

export function WorkspaceSplitView({
  layout,
  activePaneId,
  dropTarget,
  splitPath = [],
  onActivatePane,
  onMaximizePane,
  onClosePane,
  onDropTargetChange,
  onDrop,
  onResizeSplit,
  renderLeaf,
}: WorkspaceSplitViewProps) {
  const { t } = useTranslation();
  const leafCount = useMemo(() => countWorkspaceLeaves(layout), [layout]);

  const startResize = (event: ReactPointerEvent<HTMLDivElement>, path: readonly number[], direction: SplitDirection, ratio: number) => {
    event.preventDefault();
    const container = event.currentTarget.parentElement;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const startRatio = ratio;
    document.body.classList.add("is-resizing-panel");
    void window.informio.setBrowserPanelResizing(true);
    void window.informio.hideAllBrowserPanes();
    const onPointerMove = (moveEvent: PointerEvent) => {
      const delta = direction === "horizontal" ? moveEvent.clientX - startX : moveEvent.clientY - startY;
      const size = direction === "horizontal" ? rect.width : rect.height;
      onResizeSplit(path, startRatio + delta / Math.max(1, size));
    };
    const onPointerUp = () => {
      document.body.classList.remove("is-resizing-panel");
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      void window.informio.setBrowserPanelResizing(false);
      window.dispatchEvent(new Event(BROWSER_BOUNDS_SYNC_EVENT));
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, { once: true });
  };

  const renderDropOverlay = (paneId: string, zone: EditorDropZone | null) => {
    if (!zone || dropTarget?.paneId !== paneId) return null;
    return (
      <div className="pointer-events-none absolute inset-0 z-40 grid grid-cols-3 grid-rows-3 gap-1 bg-emerald-500/5 p-2">
        <div className={cn("col-start-1 row-span-3 rounded-md", zone === "left" && "bg-emerald-500/20 ring-1 ring-emerald-500/35")} />
        <div className={cn("col-start-3 row-span-3 rounded-md", zone === "right" && "bg-emerald-500/20 ring-1 ring-emerald-500/35")} />
        <div className={cn("col-span-3 row-start-1 rounded-md", zone === "top" && "bg-emerald-500/20 ring-1 ring-emerald-500/35")} />
        <div className={cn("col-span-3 row-start-3 rounded-md", zone === "bottom" && "bg-emerald-500/20 ring-1 ring-emerald-500/35")} />
        <div className="col-start-2 row-start-2 grid place-items-center rounded-md bg-white/70 px-3 text-center text-[12px] font-semibold text-emerald-700 shadow-sm">
          {zone === "left"
            ? t("app.splitLeft")
            : zone === "right"
              ? t("app.splitRight")
              : zone === "top"
                ? t("app.splitTop")
                : t("app.splitBottom")}
        </div>
      </div>
    );
  };

  const bindPaneDrag = (paneId: string) => ({
    onDragOver: (event: ReactDragEvent<HTMLDivElement>) => {
      if (!isWorkspaceDrag(event.dataTransfer)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      const zone = paneDropZoneFromRect(event.currentTarget.getBoundingClientRect(), event.clientX, event.clientY);
      onDropTargetChange({ paneId, zone });
    },
    onDragLeave: (event: ReactDragEvent<HTMLDivElement>) => {
      if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
      if (dropTarget?.paneId === paneId) onDropTargetChange(null);
    },
    onDrop: (event: ReactDragEvent<HTMLDivElement>) => {
      if (!isWorkspaceDrag(event.dataTransfer)) return;
      event.preventDefault();
      event.stopPropagation();
      const zone = paneDropZoneFromRect(event.currentTarget.getBoundingClientRect(), event.clientX, event.clientY);
      onDrop({ paneId, zone }, event.dataTransfer);
      onDropTargetChange(null);
    },
  });

  if (layout.type === "leaf") {
    const active = layout.id === activePaneId || leafCount === 1;
    const zone = dropTarget?.paneId === layout.id ? dropTarget.zone : null;
    const canClose = leafCount > 1 || layout.content.type !== "document";
    return (
      <div
        className={cn(
          "workspace-pane relative flex min-h-0 min-w-0 flex-col",
          active && leafCount > 1 && "ring-1 ring-emerald-500/30"
        )}
        onMouseDown={() => onActivatePane(layout.id)}
        onFocusCapture={() => onActivatePane(layout.id)}
        {...bindPaneDrag(layout.id)}
      >
        {leafCount > 1 && active ? (
          <div className="absolute right-3 top-3 z-30 flex items-center gap-1">
            <button
              type="button"
              aria-label={t("app.expandPane")}
              className="grid h-6 w-6 place-items-center rounded-md text-slate-400 opacity-80 transition hover:bg-slate-100 hover:text-slate-600"
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onMaximizePane(layout.id);
              }}
            >
              <Maximize2 size={14} strokeWidth={1.8} />
            </button>
            {canClose ? (
              <button
                type="button"
                aria-label={t("app.closePane")}
                className="grid h-6 w-6 place-items-center rounded-md text-slate-400 opacity-80 transition hover:bg-slate-100 hover:text-slate-600"
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onClosePane(layout.id);
                }}
              >
                <X size={14} strokeWidth={1.8} />
              </button>
            ) : null}
          </div>
        ) : null}
        {renderLeaf(layout, active)}
        {renderDropOverlay(layout.id, zone)}
      </div>
    );
  }

  const basis = `${layout.ratio * 100}%`;
  const secondaryBasis = `${(1 - layout.ratio) * 100}%`;
  const isHorizontal = layout.direction === "horizontal";

  return (
    <div className={cn("flex min-h-0 min-w-0 flex-1", !isHorizontal && "flex-col")}>
      <div className="relative min-h-0 min-w-0 flex flex-col" style={{ flexBasis: basis }}>
        <WorkspaceSplitView
          layout={layout.first}
          activePaneId={activePaneId}
          dropTarget={dropTarget}
          splitPath={[...splitPath, 0]}
          onActivatePane={onActivatePane}
          onMaximizePane={onMaximizePane}
          onClosePane={onClosePane}
          onDropTargetChange={onDropTargetChange}
          onDrop={onDrop}
          onResizeSplit={onResizeSplit}
          renderLeaf={renderLeaf}
        />
      </div>
      <div
        className={cn(
          "shrink-0 bg-slate-200/70 transition-colors hover:bg-slate-300/80",
          isHorizontal ? "h-full w-1 cursor-col-resize" : "h-1 w-full cursor-row-resize"
        )}
        onPointerDown={(event) => startResize(event, splitPath, layout.direction, layout.ratio)}
      />
      <div className="relative min-h-0 min-w-0 flex flex-col" style={{ flexBasis: secondaryBasis }}>
        <WorkspaceSplitView
          layout={layout.second}
          activePaneId={activePaneId}
          dropTarget={dropTarget}
          splitPath={[...splitPath, 1]}
          onActivatePane={onActivatePane}
          onMaximizePane={onMaximizePane}
          onClosePane={onClosePane}
          onDropTargetChange={onDropTargetChange}
          onDrop={onDrop}
          onResizeSplit={onResizeSplit}
          renderLeaf={renderLeaf}
        />
      </div>
    </div>
  );
}

export const workspaceDragAccepts = (dataTransfer: DataTransfer) =>
  isWorkspaceDrag(dataTransfer) || dataTransfer.types.includes(DOCUMENT_DRAG_MIME);
