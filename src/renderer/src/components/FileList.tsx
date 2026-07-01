import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useAppStore, useDocumentStore } from "../stores";
import type { DragEvent as ReactDragEvent, ReactNode } from "react";
import type {
  BlankContextMenuState,
  FileContextMenuState,
  FileTreeNode,
  FileSystemOperationInput,
  InformioDocument,
  InformioFolder,
  InformioProject,
  InlineRenameState,
  PendingCreationState,
  ProjectContextMenuState,
  TreeDropTarget
} from "../types";
import type { TreeDragPayload } from "../types";
import { cn } from "../lib/utils";
import { normalizePath, pathBaseName, pathContains, pathDirName, pathExtName, relativePath } from "../lib/path";
import { documentKind } from "../lib/file-type";
import { markdownTitle } from "../lib/markdown";
import {
  fallbackFolder,
  treeNode,
  documentStructureKey,
  documentLookupKey,
  folderChain,
  buildFileTree,
  filterFileTree,
  DOCUMENT_DRAG_MIME,
  FOLDER_DRAG_MIME,
  TREE_ITEM_DRAG_MIME,
  isInternalDocumentDrag,
  isInternalTreeDrag,
  serializeTreeDragPayload,
  parseTreeDragPayload,
  isExternalFileDrag,
  filePathForFile,
  dataTransferFilePaths
} from "../lib/file-tree";
import { flattenVisibleFileTree, type FlatTreeRow } from "../lib/file-tree-flat";
import { BlankFileContextMenu, FileContextMenu, ProjectContextMenu } from "./FileContextMenu";
import { FileText, Film, Folder, FolderRoot, ImageIcon, Music, Pin, Table } from "lucide-react";

// ---------------------------------------------------------------------------
// FileList component
// ---------------------------------------------------------------------------

export function FileList({
  onSelect,
  onCreate,
  onCreateFolder,
  onFileAction,
  onImportExternalFiles,
  onRenameProject,
  onToggleProjectPinned,
  onRemoveProject,
  onDocumentDragStart
}: {
  onSelect: (id: string) => void;
  onCreate: (folderPath?: string) => void;
  onCreateFolder: (folderPath?: string) => void;
  onFileAction: (input: FileSystemOperationInput) => void;
  onImportExternalFiles: (sourcePaths: string[], destinationFolderPath: string) => void;
  onRenameProject: (path: string, title: string) => void | Promise<void>;
  onToggleProjectPinned: (path: string) => void;
  onRemoveProject: (path: string) => void;
  onDocumentDragStart: (documentId: string, event: ReactDragEvent<HTMLElement>) => void;
}) {
  const { t } = useTranslation();
  const { data } = useAppStore();
  const { fileListCreationSignal: creationSignal } = useDocumentStore();
  const folders = data?.folders ?? [];
  const documents = data?.documents ?? [];
  const projects = data?.projects ?? [];
  const activeDocumentId = data?.activeDocumentId ?? "";
  const width = data?.settings?.appearance?.leftPanelWidth ?? 240;
  const [contextMenu, setContextMenu] = useState<FileContextMenuState | null>(null);
  const [projectContextMenu, setProjectContextMenu] = useState<ProjectContextMenuState | null>(null);
  const [blankContextMenu, setBlankContextMenu] = useState<BlankContextMenuState | null>(null);
  const [expandedFolderKeys, setExpandedFolderKeys] = useState<Set<string>>(() => new Set());
  const [inlineRename, setInlineRename] = useState<InlineRenameState | null>(null);
  const [pendingCreation, setPendingCreation] = useState<PendingCreationState | null>(null);
  const [dropTarget, setDropTarget] = useState<TreeDropTarget | null>(null);
  const projectPaths = useMemo(() => new Set(projects.map((p) => normalizePath(p.path))), [projects]);
  const treeKey = useMemo(() => documentStructureKey(documents), [documents]);
  const tree = useMemo(() => buildFileTree(folders, documents, projects), [treeKey, folders, projects]);
  const projectsByPath = useMemo(() => new Map(projects.map((project) => [normalizePath(project.path), project])), [projects]);
  const flatRows = useMemo(() => flattenVisibleFileTree(tree, expandedFolderKeys), [tree, expandedFolderKeys]);
  const listRef = useRef<HTMLDivElement | null>(null);
  const virtualizer = useVirtualizer({
    count: flatRows.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => 32,
    overscan: 10
  });

  useEffect(() => {
    if (!inlineRename) return;
    if (inlineRename.type === "project") {
      if (!projects.some((project) => normalizePath(project.path) === normalizePath(inlineRename.path))) {
        setInlineRename(null);
      }
      return;
    }

    if (inlineRename.type === "folder") {
      if (!folders.some((folder) => normalizePath(folder.path) === normalizePath(inlineRename.path))) {
        setInlineRename(null);
      }
      return;
    }

    if (!documents.some((document) => document.id === inlineRename.documentId && normalizePath(document.filePath ?? "") === normalizePath(inlineRename.path))) {
      setInlineRename(null);
    }
  }, [documents, folders, inlineRename, projects]);

  useEffect(() => {
    if (!pendingCreation) return;
    if (pendingCreation.type === "file") {
      const created = documents.find((doc) => {
        if (!doc.filePath) return false;
        const normalizedPath = normalizePath(doc.filePath);
        if (pendingCreation.folderPath) {
          return normalizePath(pathDirName(normalizedPath)) === normalizePath(pendingCreation.folderPath) && pathBaseName(normalizedPath).startsWith("Untitled");
        }
        return pathBaseName(normalizedPath).startsWith("Untitled");
      });
      if (!created?.filePath) return;
      const parentKey = normalizePath(pathDirName(created.filePath));
      setExpandedFolderKeys((items) => new Set(items).add(parentKey));
      setInlineRename({
        type: "file",
        path: created.filePath,
        documentId: created.id,
        value: created.title,
        originalValue: created.title,
        selectBaseName: true
      });
      setPendingCreation(null);
      return;
    }

    const createdFolder = folders.find((folder) => {
      const normalizedPath = normalizePath(folder.path);
      if (pendingCreation.folderPath) {
        return normalizePath(pathDirName(normalizedPath)) === normalizePath(pendingCreation.folderPath) && pathBaseName(normalizedPath).startsWith("New Folder");
      }
      return pathBaseName(normalizedPath).startsWith("New Folder");
    });
    if (!createdFolder) return;
    const parentPath = pathDirName(createdFolder.path);
    const createdKey = normalizePath(createdFolder.path);
    setExpandedFolderKeys((items) => new Set(items).add(normalizePath(parentPath)).add(createdKey));
    setInlineRename({
      type: "folder",
      path: createdFolder.path,
      value: createdFolder.title,
      originalValue: createdFolder.title
    });
    setPendingCreation(null);
  }, [documents, folders, pendingCreation]);

  const toggleFolder = (folder: InformioFolder) => {
    const key = normalizePath(folder.path || folder.id);
    setExpandedFolderKeys((items) => {
      const next = new Set(items);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const startInlineRename = (target: InlineRenameState) => {
    if (target.type !== "project") {
      const parentPath = target.type === "file" ? pathDirName(target.path) : target.path;
      setExpandedFolderKeys((items) => new Set(items).add(normalizePath(parentPath)));
    }
    setInlineRename(target);
  };

  const commitInlineRename = async () => {
    if (!inlineRename) return;
    const nextName = inlineRename.value.trim();
    if (!nextName) {
      setInlineRename(null);
      return;
    }

    if (nextName === inlineRename.originalValue.trim()) {
      setInlineRename(null);
      return;
    }

    const request = inlineRename;
    setInlineRename(null);
    if (request.type === "project") {
      await onRenameProject(request.path, nextName);
      return;
    }
    onFileAction({
      action: "rename",
      targetType: request.type,
      path: request.path,
      documentId: request.type === "file" ? request.documentId : undefined,
      name: nextName
    });
  };

  const cancelInlineRename = () => setInlineRename(null);

  const handleCreateFile = (folderPath?: string) => {
    setPendingCreation({ type: "file", folderPath });
    onCreate(folderPath);
  };

  const handleCreateFolder = (folderPath?: string) => {
    if (folderPath) {
      setExpandedFolderKeys((items) => new Set(items).add(normalizePath(folderPath)));
    }
    setPendingCreation({ type: "folder", folderPath });
    onCreateFolder(folderPath);
  };

  const moveToFolder = (input: FileSystemOperationInput, destinationFolderPath: string) => {
    if (input.targetType === "folder") {
      const normalizedSource = normalizePath(input.path);
      const normalizedDestination = normalizePath(destinationFolderPath);
      if (normalizedSource === normalizedDestination || pathContains(input.path, destinationFolderPath)) return;
    }
    if (normalizePath(pathDirName(input.path)) === normalizePath(destinationFolderPath)) return;
    onFileAction({ ...input, action: "move", destinationFolderPath });
  };

  const handleTreeDrop = (dataTransfer: DataTransfer, destinationFolderPath: string) => {
    const externalPaths = dataTransferFilePaths(dataTransfer);
    if (externalPaths.length) {
      onImportExternalFiles(externalPaths, destinationFolderPath);
      return;
    }

    const payload = parseTreeDragPayload(dataTransfer);
    if (!payload) return;

    if (payload.type === "file") {
      const draggedDocument = documents.find((doc) => doc.id === payload.documentId);
      const sourcePath = payload.path || draggedDocument?.filePath;
      if (!sourcePath) return;
      moveToFolder(
        {
          action: "move",
          targetType: "file",
          path: sourcePath,
          documentId: payload.documentId
        },
        destinationFolderPath
      );
      return;
    }

    moveToFolder(
      {
        action: "move",
        targetType: "folder",
        path: payload.path
      },
      destinationFolderPath
    );
  };

  const renderInlineRenameInput = (state: InlineRenameState, className: string) => (
    <input
      key={`${state.type}:${state.path}`}
      value={state.value}
      autoFocus
      onFocus={(event) => {
        if (state.type === "file" && state.selectBaseName) {
          const extension = pathExtName(state.originalValue);
          const end = extension ? state.originalValue.length - extension.length : state.originalValue.length;
          event.currentTarget.setSelectionRange(0, Math.max(0, end));
        } else {
          event.currentTarget.select();
        }
      }}
      onChange={(event) => setInlineRename((current) => (current && current.path === state.path && current.type === state.type ? { ...current, value: event.target.value, selectBaseName: false } : current))}
      onBlur={() => { void commitInlineRename(); }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          void commitInlineRename();
        }
        if (event.key === "Escape") {
          event.preventDefault();
          cancelInlineRename();
        }
      }}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      className={className}
    />
  );

  const renderFlatRow = (row: FlatTreeRow) => {
    if (row.kind === "folder") {
      const node = row.node;
      const depth = row.depth;
      const folderKey = normalizePath(node.folder.path || node.folder.id);
      const isProject = depth === 0 && projectPaths.has(normalizePath(node.folder.path));
      const isEditingFolder = inlineRename?.type === "folder" && normalizePath(inlineRename.path) === folderKey;
      const isEditingProject = inlineRename?.type === "project" && normalizePath(inlineRename.path) === folderKey;
      const isDropTarget = dropTarget?.path === folderKey;
      return (
        <button
          type="button"
          data-file-context-target={isProject ? "project" : "folder"}
          data-file-path={node.folder.path}
          data-file-title={node.folder.title}
          className={cn(
            "group flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] font-semibold text-[var(--text-muted)] transition-[background-color,color] hover:bg-white/65 hover:text-[var(--text-main)] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/45",
            isDropTarget && "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-500/35"
          )}
          style={{ paddingLeft: 8 + depth * 14 }}
          onClick={() => toggleFolder(node.folder)}
          onDragOver={(event) => {
            const isInternalDrag = isInternalTreeDrag(event.dataTransfer);
            const isExternalDrag = isExternalFileDrag(event.dataTransfer);
            if (!isInternalDrag && !isExternalDrag) return;
            event.preventDefault();
            event.stopPropagation();
            event.dataTransfer.dropEffect = isExternalDrag ? "copy" : "move";
            setDropTarget({ path: folderKey, depth });
          }}
          onDragLeave={(event) => {
            if (!isInternalTreeDrag(event.dataTransfer) && !isExternalFileDrag(event.dataTransfer)) return;
            if (event.currentTarget.contains(event.relatedTarget as globalThis.Node | null)) return;
            setDropTarget((current) => (current?.path === folderKey ? null : current));
          }}
          onDrop={(event) => {
            if (!isInternalTreeDrag(event.dataTransfer) && !isExternalFileDrag(event.dataTransfer)) return;
            event.preventDefault();
            event.stopPropagation();
            setDropTarget(null);
            handleTreeDrop(event.dataTransfer, node.folder.path);
          }}
          draggable={!isProject}
          onDragStart={(event) => {
            if (isProject) return;
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData(TREE_ITEM_DRAG_MIME, serializeTreeDragPayload({ type: "folder", path: node.folder.path }));
            event.dataTransfer.setData(FOLDER_DRAG_MIME, node.folder.path);
          }}
        >
          {isProject ? (
            <Folder size={14} className="shrink-0" />
          ) : (
            <FolderRoot size={14} className="shrink-0 text-slate-400" />
          )}
          {isEditingFolder || isEditingProject
            ? renderInlineRenameInput(
                inlineRename as InlineRenameState,
                "min-w-0 flex-1 rounded-md bg-white px-2 py-1 text-[13px] font-semibold text-[var(--text-main)] outline-none ring-2 ring-emerald-500/45"
              )
            : <span className="min-w-0 flex-1 truncate">{node.folder.title}</span>}
          {isProject && projectsByPath.get(folderKey)?.pinned ? <Pin size={11} className="shrink-0 text-slate-400" /> : null}
        </button>
      );
    }

    const doc = row.document;
    const depth = row.depth;
    const active = doc.id === activeDocumentId;
    const isEditingFile = inlineRename?.type === "file" && inlineRename.documentId === doc.id;
    return (
      <button
        type="button"
        draggable
        data-file-context-target="file"
        data-file-path={doc.filePath ?? ""}
        data-file-title={doc.title}
        data-document-id={doc.id}
        onClick={() => onSelect(doc.id)}
        onDragStart={(event) => onDocumentDragStart(doc.id, event)}
        className={cn(
          "w-full rounded-md px-2.5 py-2 text-left text-[13px] transition-[background-color,box-shadow,transform] duration-150 active:scale-[0.99]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/45",
          active
            ? "bg-white shadow-[0_1px_4px_rgba(15,23,42,0.10),inset_0_0_0_1px_rgba(15,23,42,0.10)]"
            : "hover:bg-white/75"
        )}
        style={{ paddingLeft: 8 + depth * 14 }}
      >
        <div className="flex items-center gap-2">
          {documentKind(doc) === "video" ? (
            <Film size={13} className={cn("shrink-0", active ? "text-emerald-600" : "text-slate-400")} />
          ) : documentKind(doc) === "audio" ? (
            <Music size={13} className={cn("shrink-0", active ? "text-emerald-600" : "text-slate-400")} />
          ) : documentKind(doc) === "image" ? (
            <ImageIcon size={13} className={cn("shrink-0", active ? "text-emerald-600" : "text-slate-400")} />
          ) : documentKind(doc) === "spreadsheet" ? (
            <Table size={13} className={cn("shrink-0", active ? "text-emerald-600" : "text-slate-400")} />
          ) : (
            <FileText size={13} className={cn("shrink-0", active ? "text-emerald-600" : "text-slate-400")} />
          )}
          {isEditingFile
            ? renderInlineRenameInput(
                inlineRename,
                "min-w-0 flex-1 rounded-md bg-white px-2 py-1 text-[13px] font-semibold text-[var(--text-main)] outline-none ring-2 ring-emerald-500/45"
              )
            : <span className="min-w-0 truncate text-[13px] font-semibold text-[var(--text-main)]">{doc.title}</span>}
        </div>
      </button>
    );
  };
  const openContextMenu = (event: React.MouseEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const target =
      event.target instanceof Element ? event.target.closest<HTMLElement>("[data-file-context-target]") : null;
    const targetType = target?.dataset.fileContextTarget;
    const path = target?.dataset.filePath;
    const title = target?.dataset.fileTitle;

    if (targetType === "project" && path) {
      setContextMenu(null);
      setBlankContextMenu(null);
      const project = projectsByPath.get(normalizePath(path));
      setProjectContextMenu({
        x: event.clientX,
        y: event.clientY,
        path,
        title: project?.title || title || pathBaseName(path),
        pinned: Boolean(project?.pinned)
      });
      return;
    }

    if (targetType === "folder" && path && title) {
      setBlankContextMenu(null);
      setProjectContextMenu(null);
      setContextMenu({ x: event.clientX, y: event.clientY, target: { type: "folder", path, title } });
      return;
    }

    if (targetType === "file" && path && title && target.dataset.documentId) {
      setBlankContextMenu(null);
      setProjectContextMenu(null);
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        target: { type: "file", path, title, documentId: target.dataset.documentId }
      });
      return;
    }

    setContextMenu(null);
    setProjectContextMenu(null);
    setBlankContextMenu({ x: event.clientX, y: event.clientY });
  };

  return (
    <aside
      className="context-panel h-full shrink-0"
      style={{ width }}
      onContextMenu={openContextMenu}
    >
      <div ref={listRef} className="overflow-y-auto px-3 py-3 text-[13px]">
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const row = flatRows[virtualRow.index];
            if (!row) return null;
            return (
              <div
                key={row.key}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  transform: `translateY(${virtualRow.start}px)`,
                  height: virtualRow.size
                }}
              >
                {renderFlatRow(row)}
              </div>
            );
          })}
        </div>
      </div>
      {contextMenu ? (
        <FileContextMenu
          state={contextMenu}
          onClose={() => setContextMenu(null)}
          onCreateFile={handleCreateFile}
          onCreateFolder={handleCreateFolder}
          onAction={(action, target) =>
            action === "rename"
              ? startInlineRename(
                  target.type === "file"
                    ? { type: "file", path: target.path, documentId: target.documentId, value: target.title, originalValue: target.title }
                    : { type: "folder", path: target.path, value: target.title, originalValue: target.title }
                )
              : onFileAction({
                  action,
                  targetType: target.type,
                  path: target.path,
                  documentId: target.type === "file" ? target.documentId : undefined
                })
          }
        />
      ) : null}
      {projectContextMenu ? (
        <ProjectContextMenu
          state={projectContextMenu}
          onClose={() => setProjectContextMenu(null)}
          onCreateFile={() => {
            handleCreateFile(projectContextMenu.path);
            setProjectContextMenu(null);
          }}
          onCreateFolder={() => {
            handleCreateFolder(projectContextMenu.path);
            setProjectContextMenu(null);
          }}
          onRename={() => {
            startInlineRename({ type: "project", path: projectContextMenu.path, value: projectContextMenu.title, originalValue: projectContextMenu.title });
            setProjectContextMenu(null);
          }}
          onTogglePinned={() => {
            onToggleProjectPinned(projectContextMenu.path);
            setProjectContextMenu(null);
          }}
          onReveal={() => {
            onFileAction({ action: "reveal", targetType: "folder", path: projectContextMenu.path });
            setProjectContextMenu(null);
          }}
          onRemove={() => {
            onRemoveProject(projectContextMenu.path);
            setProjectContextMenu(null);
          }}
        />
      ) : null}
      {blankContextMenu ? (
        <BlankFileContextMenu
          state={blankContextMenu}
          onClose={() => setBlankContextMenu(null)}
          onCreateFile={() => handleCreateFile()}
          onCreateFolder={() => handleCreateFolder()}
        />
      ) : null}
    </aside>
  );
}

export default memo(FileList);
