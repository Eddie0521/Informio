import { useEffect, useRef } from "react";
import type { ComponentType } from "react";
import { useTranslation } from "react-i18next";
import { Copy, ExternalLink, FilePlus, FolderPlus, Pencil, Pin, PinOff, Trash2, X } from "lucide-react";
import type {
  BlankContextMenuState,
  FileContextMenuState,
  FileContextTarget,
  FileSystemOperationInput,
  ProjectContextMenuState
} from "../types";
import { cn } from "../lib/utils";

const isMacPlatform = () =>
  typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/i.test(navigator.platform);

export function ProjectContextMenu({
  state,
  onClose,
  onCreateFile,
  onCreateFolder,
  onRename,
  onTogglePinned,
  onReveal,
  onRemove
}: {
  state: ProjectContextMenuState;
  onClose: () => void;
  onCreateFile: () => void;
  onCreateFolder: () => void;
  onRename: () => void;
  onTogglePinned: () => void;
  onReveal: () => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (event.target instanceof globalThis.Node && menuRef.current?.contains(event.target)) return;
      onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="no-drag fixed z-50 min-w-44 overflow-hidden rounded-md bg-white py-1 text-[12px] font-semibold text-slate-700 shadow-[0_12px_32px_rgba(15,23,42,0.18),0_0_0_1px_rgba(15,23,42,0.08)]"
      style={{ left: state.x, top: state.y }}
    >
      <button
        type="button"
        className="flex h-8 w-full items-center gap-2 px-3 text-left hover:bg-slate-100 transition-[background-color,color] active:scale-[0.99]"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onCreateFile(); }}
      >
        <FilePlus size={13} />
        <span>{t("files.newFile")}</span>
      </button>
      <button
        type="button"
        className="flex h-8 w-full items-center gap-2 px-3 text-left hover:bg-slate-100 transition-[background-color,color] active:scale-[0.99]"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onCreateFolder(); }}
      >
        <FolderPlus size={13} />
        <span>{t("files.newFolder")}</span>
      </button>
      <button
        type="button"
        className="flex h-8 w-full items-center gap-2 px-3 text-left hover:bg-slate-100 transition-[background-color,color] active:scale-[0.99]"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRename(); }}
      >
        <Pencil size={13} />
        <span>{t("filecontextmenu.renameProject")}</span>
      </button>
      <button
        type="button"
        className="flex h-8 w-full items-center gap-2 px-3 text-left hover:bg-slate-100 transition-[background-color,color] active:scale-[0.99]"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onTogglePinned(); }}
      >
        {state.pinned ? <PinOff size={13} /> : <Pin size={13} />}
        <span>{state.pinned ? t("filecontextmenu.unpinProject") : t("filecontextmenu.pinProject")}</span>
      </button>
      <button
        type="button"
        className="flex h-8 w-full items-center gap-2 px-3 text-left hover:bg-slate-100 transition-[background-color,color] active:scale-[0.99]"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onReveal(); }}
      >
        <ExternalLink size={13} />
        <span>{t("filecontextmenu.openInFinder")}</span>
      </button>
      <button
        type="button"
        className="flex h-8 w-full items-center gap-2 px-3 text-left text-red-600 hover:bg-red-50 transition-[background-color,color] active:scale-[0.99]"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(); }}
      >
        <X size={13} />
        <span>{t("filecontextmenu.removeFromList")}</span>
      </button>
    </div>
  );
}

export function FileContextMenu({
  state,
  onClose,
  onCreateFile,
  onCreateFolder,
  onAction
}: {
  state: FileContextMenuState;
  onClose: () => void;
  onCreateFile: (folderPath: string) => void;
  onCreateFolder: (folderPath: string) => void;
  onAction: (action: FileSystemOperationInput["action"], target: FileContextTarget) => void;
}) {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (event.target instanceof globalThis.Node && menuRef.current?.contains(event.target)) return;
      onClose();
    };
    const closeOnScroll = () => onClose();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", closeOnScroll, true);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", closeOnScroll, true);
    };
  }, [onClose]);

  const revealLabel = isMacPlatform() ? t("filecontextmenu.openInFinder") : t("filecontextmenu.openInFolder");
  const menuItems: Array<{ action: FileSystemOperationInput["action"]; label: string; icon: ComponentType<{ size?: number }> }> = [
    { action: "rename", label: t("common.rename"), icon: Pencil },
    { action: "duplicate", label: t("filecontextmenu.duplicate"), icon: Copy },
    { action: "delete", label: t("filecontextmenu.moveToTrash"), icon: Trash2 },
    { action: "reveal", label: revealLabel, icon: ExternalLink }
  ];

  return (
    <div
      ref={menuRef}
      className="no-drag fixed z-50 min-w-44 overflow-hidden rounded-md bg-white py-1 text-[12px] font-semibold text-slate-700 shadow-[0_12px_32px_rgba(15,23,42,0.18),0_0_0_1px_rgba(15,23,42,0.08)]"
      style={{ left: state.x, top: state.y }}
    >
      {state.target.type === "folder" ? (
        <>
          <button
            type="button"
            className="flex h-8 w-full items-center gap-2 px-3 text-left transition-[background-color,color] hover:bg-slate-100 active:scale-[0.99]"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onCreateFile(state.target.path);
              onClose();
            }}
          >
            <FilePlus size={14} />
            <span>{t("files.newFile")}</span>
          </button>
          <button
            type="button"
            className="flex h-8 w-full items-center gap-2 px-3 text-left transition-[background-color,color] hover:bg-slate-100 active:scale-[0.99]"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onCreateFolder(state.target.path);
              onClose();
            }}
          >
            <FolderPlus size={14} />
            <span>{t("files.newFolder")}</span>
          </button>
        </>
      ) : null}
      {menuItems.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.action}
            type="button"
            className={cn(
              "flex h-8 w-full items-center gap-2 px-3 text-left transition-[background-color,color] active:scale-[0.99]",
              item.action === "delete" ? "text-red-600 hover:bg-red-50" : "hover:bg-slate-100"
            )}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onAction(item.action, state.target);
              onClose();
            }}
          >
            <Icon size={14} />
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function BlankFileContextMenu({
  state,
  onClose,
  onCreateFile,
  onCreateFolder
}: {
  state: BlankContextMenuState;
  onClose: () => void;
  onCreateFile: () => void;
  onCreateFolder: () => void;
}) {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (event.target instanceof globalThis.Node && menuRef.current?.contains(event.target)) return;
      onClose();
    };
    const closeOnScroll = () => onClose();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", closeOnScroll, true);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", closeOnScroll, true);
    };
  }, [onClose]);

  const menuItems = [
    { label: t("files.newFile"), icon: FilePlus, action: onCreateFile },
    { label: t("files.newFolder"), icon: FolderPlus, action: onCreateFolder }
  ];

  return (
    <div
      ref={menuRef}
      className="no-drag fixed z-50 min-w-40 overflow-hidden rounded-md bg-white py-1 text-[12px] font-semibold text-slate-700 shadow-[0_12px_32px_rgba(15,23,42,0.18),0_0_0_1px_rgba(15,23,42,0.08)]"
      style={{ left: state.x, top: state.y }}
    >
      {menuItems.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.label}
            type="button"
            className="flex h-8 w-full items-center gap-2 px-3 text-left transition-[background-color,color] hover:bg-slate-100 active:scale-[0.99]"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              item.action();
              onClose();
            }}
          >
            <Icon size={14} />
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
