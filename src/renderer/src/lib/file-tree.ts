import type {
  FileTreeNode,
  InformioDocument,
  InformioFolder,
  InformioProject,
  TreeDragPayload
} from "../types";
import { normalizePath, pathBaseName, pathContains, pathDirName } from "./path";
import { documentKind } from "./file-type";

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

export const DOCUMENT_DRAG_MIME = "application/x-informio-document-id";
export const FOLDER_DRAG_MIME = "application/x-informio-folder-path";
export const TREE_ITEM_DRAG_MIME = "text/informio-tree-item";

export const isInternalDocumentDrag = (dataTransfer: DataTransfer | null | undefined) =>
  Boolean(dataTransfer && Array.from(dataTransfer.types).includes(DOCUMENT_DRAG_MIME));

export const isInternalTreeDrag = (dataTransfer: DataTransfer | null | undefined) =>
  Boolean(
    dataTransfer &&
      Array.from(dataTransfer.types).some((type) => type === TREE_ITEM_DRAG_MIME || type === DOCUMENT_DRAG_MIME || type === FOLDER_DRAG_MIME)
  );

export const serializeTreeDragPayload = (payload: TreeDragPayload) => JSON.stringify(payload);

export const parseTreeDragPayload = (dataTransfer: DataTransfer): TreeDragPayload | null => {
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

export const isExternalFileDrag = (dataTransfer: DataTransfer | null) =>
  Boolean(dataTransfer?.types.includes("Files") && !isInternalTreeDrag(dataTransfer) && !isInternalDocumentDrag(dataTransfer));

export const filePathForFile = (file: File) => {
  const legacyPath = (file as File & { path?: string }).path;
  if (legacyPath) return legacyPath;
  return window.informio.getPathForFile(file);
};

export const dataTransferFilePaths = (dataTransfer: DataTransfer | null) =>
  Array.from(dataTransfer?.files ?? [])
    .map(filePathForFile)
    .filter(Boolean);
