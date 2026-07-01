import type { FileTreeNode, InformioDocument } from "../types";
import { normalizePath } from "./path";

export type FlatTreeRow =
  | { kind: "folder"; depth: number; node: FileTreeNode; key: string }
  | { kind: "file"; depth: number; document: InformioDocument; key: string };

export const flattenVisibleFileTree = (roots: FileTreeNode[], expandedKeys: Set<string>): FlatTreeRow[] => {
  const rows: FlatTreeRow[] = [];

  const walk = (node: FileTreeNode, depth: number) => {
    const folderKey = normalizePath(node.folder.path || node.folder.id);
    rows.push({ kind: "folder", depth, node, key: `folder:${folderKey}` });
    if (!expandedKeys.has(folderKey)) return;

    node.children.forEach((child) => walk(child, depth + 1));
    node.documents.forEach((document) => {
      rows.push({
        kind: "file",
        depth: depth + 1,
        document,
        key: `file:${document.id}`
      });
    });
  };

  roots.forEach((root) => walk(root, 0));
  return rows;
};
