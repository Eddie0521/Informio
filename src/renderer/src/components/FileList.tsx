import { useEffect, useMemo, useState } from "react";
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
import { BlankFileContextMenu, FileContextMenu, ProjectContextMenu } from "./FileContextMenu";
import { FileText, Film, Folder, FolderRoot, ImageIcon, Music, Pin } from "lucide-react";

// ---------------------------------------------------------------------------
// File-tree helpers
// ---------------------------------------------------------------------------

export const fallbackFolder = (path: string): InformioFolder => ({
  id: `folder-${path}`,
  title: pathBaseName(path),
  path,
  updatedAt: new Date().toISOString()
});

export const treeNode = (folder: InformioFolder): FileTreeNode => ({ folder, documents: [], children: [], documentCount: 0 });

export const documentStructureKey = (documents: InformioDocument[]) =>
  documents.map((doc) => `${doc.id}:${doc.title}:${doc.filePath ?? ""}:${documentKind(doc)}:${doc.collection}:${doc.pinned ? "1" : "0"}`).join("|");

export const documentLookupKey = (documents: InformioDocument[], excludedSuggestionDocumentId?: string) =>
  `${excludedSuggestionDocumentId ?? ""}::${documentStructureKey(documents)}`;

export const folderChain = (path: string, projectPaths: string[]) => {
  const normalizedPath = normalizePath(path);
  if (!normalizedPath) return [];
  const containingProject = projectPaths.find((p) => pathContains(p, normalizedPath));
  const normalizedRoot = containingProject ? normalizePath(containingProject) : "";
  if (!normalizedRoot) return [normalizedPath];

  const chain: string[] = [];
  let current = normalizedPath;
  while (current && pathContains(normalizedRoot, current)) {
    chain.unshift(current);
    if (current === normalizedRoot) break;
    const parent = pathDirName(current);
    if (!parent || parent === current) break;
    current = parent;
  }
  return chain;
};

export const buildFileTree = (folders: InformioFolder[], documents: InformioDocument[], projects: InformioProject[]): FileTreeNode[] => {
  const projectPaths = projects.map((p) => normalizePath(p.path));
  const projectsByPath = new Map(projects.map((project) => [normalizePath(project.path), project]));
  const folderRecords = new Map<string, InformioFolder>();
  const nodes = new Map<string, FileTreeNode>();

  folders.forEach((folder) => {
    if (folder.path) folderRecords.set(normalizePath(folder.path), folder);
  });
  projectPaths.forEach((p) => {
    const project = projectsByPath.get(p);
    const existing = folderRecords.get(p) ?? fallbackFolder(p);
    folderRecords.set(p, {
      ...existing,
      title: project?.title || existing.title
    });
  });

  const ensureNode = (path: string) => {
    const key = normalizePath(path);
    const folder = folderRecords.get(key) ?? fallbackFolder(path);
    folderRecords.set(key, folder);
    if (!nodes.has(key)) nodes.set(key, treeNode(folder));
    return nodes.get(key)!;
  };

  const ensureFolderPath = (path: string) => {
    folderChain(path, projectPaths).forEach((folderPath) => ensureNode(folderPath));
  };

  folders.forEach((folder) => {
    if (folder.path) ensureFolderPath(folder.path);
  });
  projectPaths.forEach((p) => ensureFolderPath(p));

  const looseDocuments: InformioDocument[] = [];

  documents.forEach((doc) => {
    if (!doc.filePath) {
      looseDocuments.push(doc);
      return;
    }
    const parent = pathDirName(doc.filePath);
    ensureFolderPath(parent);
    ensureNode(parent).documents.push(doc);
  });

  const roots: FileTreeNode[] = [];
  Array.from(nodes.values())
    .sort((a, b) => normalizePath(a.folder.path).length - normalizePath(b.folder.path).length)
    .forEach((node) => {
      const parentPath = pathDirName(node.folder.path);
      const parent = nodes.get(normalizePath(parentPath));
      if (parent && normalizePath(parent.folder.path) !== normalizePath(node.folder.path) && pathContains(parent.folder.path, node.folder.path)) {
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    });

  const sortNode = (node: FileTreeNode) => {
    node.documents.sort((a, b) => a.title.localeCompare(b.title));
    node.children.sort((a, b) => a.folder.title.localeCompare(b.folder.title));
    node.children.forEach(sortNode);
    node.documentCount = node.documents.length + node.children.reduce((total, child) => total + child.documentCount, 0);
  };
  roots.forEach(sortNode);

  if (looseDocuments.length) {
    roots.push({
      folder: { id: "local-drafts", title: "Local Drafts", path: "", updatedAt: new Date().toISOString() },
      documents: looseDocuments.sort((a, b) => a.title.localeCompare(b.title)),
      children: [],
      documentCount: looseDocuments.length
    });
  }

  return roots.sort((a, b) => {
    const aIsProject = projectPaths.includes(normalizePath(a.folder.path));
    const bIsProject = projectPaths.includes(normalizePath(b.folder.path));
    if (aIsProject !== bIsProject) return aIsProject ? -1 : 1;
    const aPinned = Boolean(projectsByPath.get(normalizePath(a.folder.path))?.pinned);
    const bPinned = Boolean(projectsByPath.get(normalizePath(b.folder.path))?.pinned);
    if (aPinned !== bPinned) return aPinned ? -1 : 1;
    return a.folder.title.localeCompare(b.folder.title);
  });
};

export const filterFileTree = (nodes: FileTreeNode[], query: string): FileTreeNode[] =>
  nodes
    .map((node) => {
      const folderMatches = `${node.folder.title} ${node.folder.path}`.toLowerCase().includes(query);
      const documents = folderMatches
        ? node.documents
        : node.documents.filter((doc) => `${doc.title} ${doc.filePath ?? ""}`.toLowerCase().includes(query));
      const children = folderMatches ? node.children : filterFileTree(node.children, query);
      const documentCount = folderMatches
        ? node.documentCount
        : documents.length + children.reduce((total, child) => total + child.documentCount, 0);
      return folderMatches || documents.length || children.length ? { ...node, documents, children, documentCount } : null;
    })
    .filter((node): node is FileTreeNode => Boolean(node));

// ---------------------------------------------------------------------------
// Drag-and-drop helpers (shared with tree rendering)
// ---------------------------------------------------------------------------

const DOCUMENT_DRAG_MIME = "application/x-informio-document-id";
const FOLDER_DRAG_MIME = "application/x-informio-folder-path";
const TREE_ITEM_DRAG_MIME = "text/informio-tree-item";

const isInternalDocumentDrag = (dataTransfer: DataTransfer | null | undefined) =>
  Boolean(dataTransfer && Array.from(dataTransfer.types).includes(DOCUMENT_DRAG_MIME));

const isInternalTreeDrag = (dataTransfer: DataTransfer | null | undefined) =>
  Boolean(
    dataTransfer &&
      Array.from(dataTransfer.types).some((type) => type === TREE_ITEM_DRAG_MIME || type === DOCUMENT_DRAG_MIME || type === FOLDER_DRAG_MIME)
  );

const serializeTreeDragPayload = (payload: TreeDragPayload) => JSON.stringify(payload);

const parseTreeDragPayload = (dataTransfer: DataTransfer): TreeDragPayload | null => {
  const raw = dataTransfer.getData(TREE_ITEM_DRAG_MIME);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<TreeDragPayload>;
      if (parsed.type === "file" && typeof parsed.documentId === "string" && typeof parsed.path === "string") {
        return { type: "file", documentId: parsed.documentId, path: parsed.path };
      }
      if (parsed.type === "folder" && typeof parsed.path === "string") {
        return { type: "folder", path: parsed.path };
      }
    } catch {
      // Fall back to legacy payloads below.
    }
  }

  const documentId = dataTransfer.getData(DOCUMENT_DRAG_MIME);
  if (documentId) return { type: "file", documentId, path: "" };
  const folderPath = dataTransfer.getData(FOLDER_DRAG_MIME);
  return folderPath ? { type: "folder", path: folderPath } : null;
};

const isExternalFileDrag = (dataTransfer: DataTransfer | null) =>
  Boolean(dataTransfer?.types.includes("Files") && !isInternalTreeDrag(dataTransfer) && !isInternalDocumentDrag(dataTransfer));

const filePathForFile = (file: File) => {
  const legacyPath = (file as File & { path?: string }).path;
  if (legacyPath) return legacyPath;
  return window.informio.getPathForFile(file);
};

const dataTransferFilePaths = (dataTransfer: DataTransfer | null) =>
  Array.from(dataTransfer?.files ?? [])
    .map(filePathForFile)
    .filter(Boolean);

// ---------------------------------------------------------------------------
// FileList component
// ---------------------------------------------------------------------------

export default function FileList({
  folders,
  documents,
  projects,
  activeDocumentId,
  onSelect,
  onCreate,
  onCreateFolder,
  onFileAction,
  onImportExternalFiles,
  onRenameProject,
  onToggleProjectPinned,
  onRemoveProject,
  onDocumentDragStart,
  width,
  creationSignal
}: {
  folders: InformioFolder[];
  documents: InformioDocument[];
  projects: InformioProject[];
  activeDocumentId: string;
  onSelect: (id: string) => void;
  onCreate: (folderPath?: string) => void;
  onCreateFolder: (folderPath?: string) => void;
  onFileAction: (input: FileSystemOperationInput) => void;
  onImportExternalFiles: (sourcePaths: string[], destinationFolderPath: string) => void;
  onRenameProject: (path: string, title: string) => void | Promise<void>;
  onToggleProjectPinned: (path: string) => void;
  onRemoveProject: (path: string) => void;
  onDocumentDragStart: (documentId: string, event: ReactDragEvent<HTMLElement>) => void;
  width: number;
  creationSignal: number;
}) {
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

  const renderTreeNode = (node: FileTreeNode, depth = 0): ReactNode => {
    const folderKey = normalizePath(node.folder.path || node.folder.id);
    const isProject = depth === 0 && projectPaths.has(normalizePath(node.folder.path));
    const collapsed = !expandedFolderKeys.has(folderKey);
    const isEditingFolder = inlineRename?.type === "folder" && normalizePath(inlineRename.path) === folderKey;
    const isEditingProject = inlineRename?.type === "project" && normalizePath(inlineRename.path) === folderKey;
    const isDropTarget = dropTarget?.path === folderKey;
    return (
      <div key={node.folder.id} className="space-y-1">
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
                (inlineRename as InlineRenameState),
                "min-w-0 flex-1 rounded-md bg-white px-2 py-1 text-[13px] font-semibold text-[var(--text-main)] outline-none ring-2 ring-emerald-500/45"
              )
            : <span className="min-w-0 flex-1 truncate">{node.folder.title}</span>}
          {isProject && projectsByPath.get(folderKey)?.pinned ? <Pin size={11} className="shrink-0 text-slate-400" /> : null}
        </button>
        {collapsed ? null : (
          <div className="space-y-1">
            {node.children.map((child) => renderTreeNode(child, depth + 1))}
            {node.documents.map((doc) => {
              const active = doc.id === activeDocumentId;
              const isEditingFile = inlineRename?.type === "file" && inlineRename.documentId === doc.id;
              return (
                <button
                  key={doc.id}
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
                  style={{ paddingLeft: 8 + (depth + 1) * 14 }}
                >
                  <div className="flex items-center gap-2">
                    {documentKind(doc) === "video" ? (
                      <Film size={13} className={cn("shrink-0", active ? "text-emerald-600" : "text-slate-400")} />
                    ) : documentKind(doc) === "audio" ? (
                      <Music size={13} className={cn("shrink-0", active ? "text-emerald-600" : "text-slate-400")} />
                    ) : documentKind(doc) === "image" ? (
                      <ImageIcon size={13} className={cn("shrink-0", active ? "text-emerald-600" : "text-slate-400")} />
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
            })}
          </div>
        )}
      </div>
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
      <div className="space-y-2 overflow-y-auto px-3 py-3 text-[13px]">
        {tree.map((node) => renderTreeNode(node))}
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
