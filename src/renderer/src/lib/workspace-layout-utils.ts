import type {
  BrowserTabMeta,
  EditorDropZone,
  SplitDirection,
  WorkspaceDropTarget,
  WorkspaceLeafNode,
  WorkspacePaneContent,
  WorkspaceSplitNode,
} from "../types";

export const MAX_WORKSPACE_PANES = 4;
export const BROWSER_DRAG_MIME = "application/x-informio-browser-pane";
export const AGENT_DRAG_MIME = "application/x-informio-agent-pane";
export const MAIN_PANE_ID = "main-pane";

export function createPaneId() {
  return `pane-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createBrowserId() {
  return `browser-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createBrowserContent(tabId = createBrowserId()) {
  return { type: "browser" as const, tabId };
}

export function createBrowserLeaf(tabId = createBrowserId(), paneId = createPaneId()): WorkspaceLeafNode {
  return { type: "leaf", id: paneId, content: createBrowserContent(tabId) };
}

type LegacyBrowserContent = {
  type: "browser";
  tabId?: string;
  browserId?: string;
  url?: string;
  tabs?: Array<{ id: string; url?: string; title?: string }>;
  activeTabId?: string;
};

export function normalizeBrowserContent(content: LegacyBrowserContent): Extract<WorkspacePaneContent, { type: "browser" }> {
  if (content.tabId) {
    return { type: "browser", tabId: content.tabId };
  }
  if (content.tabs?.length && content.activeTabId) {
    return { type: "browser", tabId: content.activeTabId };
  }
  if (content.tabs?.length) {
    return { type: "browser", tabId: content.tabs[0]!.id };
  }
  const tabId = content.browserId ?? createBrowserId();
  return { type: "browser", tabId };
}

export function getBrowserTabId(content: Extract<WorkspacePaneContent, { type: "browser" }> | LegacyBrowserContent) {
  return normalizeBrowserContent(content as LegacyBrowserContent).tabId;
}

export function findBrowserLeafByTabId(node: WorkspaceSplitNode | null, tabId: string) {
  return collectWorkspaceLeaves(node).find(
    (leaf) => leaf.content.type === "browser" && leaf.content.tabId === tabId,
  ) ?? null;
}

export function browserTabLabel(meta: BrowserTabMeta | undefined, fallback: string) {
  if (meta?.title?.trim()) return meta.title.trim();
  const url = meta?.url?.trim();
  if (!url) return fallback;
  try {
    return new URL(url).hostname || url;
  } catch {
    return url;
  }
}

export function createDocumentLeaf(documentId: string, paneId = MAIN_PANE_ID): WorkspaceLeafNode {
  return { type: "leaf", id: paneId, content: { type: "document", documentId } };
}

export function createAgentLeaf(paneId = createPaneId()): WorkspaceLeafNode {
  return { type: "leaf", id: paneId, content: { type: "agent" } };
}

export function countWorkspaceLeaves(node: WorkspaceSplitNode | null): number {
  if (!node) return 0;
  if (node.type === "leaf") return 1;
  return countWorkspaceLeaves(node.first) + countWorkspaceLeaves(node.second);
}

export function collectWorkspaceLeaves(node: WorkspaceSplitNode | null): WorkspaceLeafNode[] {
  if (!node) return [] as WorkspaceLeafNode[];
  if (node.type === "leaf") return [node];
  return [...collectWorkspaceLeaves(node.first), ...collectWorkspaceLeaves(node.second)];
}

export function findWorkspaceLeaf(node: WorkspaceSplitNode | null, paneId: string): WorkspaceLeafNode | null {
  if (!node) return null;
  if (node.type === "leaf") return node.id === paneId ? node : null;
  return findWorkspaceLeaf(node.first, paneId) ?? findWorkspaceLeaf(node.second, paneId);
}

export function findAgentLeaf(node: WorkspaceSplitNode | null): WorkspaceLeafNode | null {
  if (!node) return null;
  if (node.type === "leaf") return node.content.type === "agent" ? node : null;
  return findAgentLeaf(node.first) ?? findAgentLeaf(node.second);
}

export function findDocumentLeafById(node: WorkspaceSplitNode | null, documentId: string) {
  return collectWorkspaceLeaves(node).find(
    (leaf) => leaf.content.type === "document" && leaf.content.documentId === documentId
  ) ?? null;
}

export function clampSplitRatio(value: number) {
  return Math.min(0.8, Math.max(0.2, value));
}

export function paneDropZoneFromRect(
  rect: Pick<DOMRect, "left" | "top" | "width" | "height">,
  clientX: number,
  clientY: number
): EditorDropZone {
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  const fx = Math.min(1, Math.max(0, (clientX - rect.left) / width));
  const fy = Math.min(1, Math.max(0, (clientY - rect.top) / height));
  const distances: Array<[EditorDropZone, number]> = [
    ["left", fx],
    ["right", 1 - fx],
    ["top", fy],
    ["bottom", 1 - fy],
  ];
  return distances.sort((left, right) => left[1] - right[1])[0][0];
}

export function splitDirectionForZone(zone: EditorDropZone): SplitDirection {
  return zone === "left" || zone === "right" ? "horizontal" : "vertical";
}

export function mapWorkspaceLayout(
  node: WorkspaceSplitNode,
  mapper: (leaf: WorkspaceLeafNode) => WorkspaceLeafNode
): WorkspaceSplitNode {
  if (node.type === "leaf") return mapper(node);
  return {
    ...node,
    first: mapWorkspaceLayout(node.first, mapper),
    second: mapWorkspaceLayout(node.second, mapper),
  };
}

export function updateWorkspaceLeaf(
  node: WorkspaceSplitNode,
  paneId: string,
  updater: (leaf: WorkspaceLeafNode) => WorkspaceLeafNode
): WorkspaceSplitNode {
  if (node.type === "leaf") return node.id === paneId ? updater(node) : node;
  return {
    ...node,
    first: updateWorkspaceLeaf(node.first, paneId, updater),
    second: updateWorkspaceLeaf(node.second, paneId, updater),
  };
}

export function removeWorkspaceLeaf(node: WorkspaceSplitNode, paneId: string): WorkspaceSplitNode | null {
  if (node.type === "leaf") return node.id === paneId ? null : node;
  const first = removeWorkspaceLeaf(node.first, paneId);
  const second = removeWorkspaceLeaf(node.second, paneId);
  if (!first && !second) return null;
  if (!first) return second;
  if (!second) return first;
  return { ...node, first, second };
}

export function collapseSingleChildSplits(node: WorkspaceSplitNode | null): WorkspaceSplitNode | null {
  if (!node) return null;
  if (node.type === "leaf") return node;
  const first = collapseSingleChildSplits(node.first);
  const second = collapseSingleChildSplits(node.second);
  if (!first && !second) return null;
  if (!first) return second;
  if (!second) return first;
  return { ...node, first, second };
}

export function splitWorkspaceLeaf(
  node: WorkspaceSplitNode,
  targetPaneId: string,
  zone: EditorDropZone,
  newContent: WorkspacePaneContent,
  options?: { newPaneId?: string }
): WorkspaceSplitNode | null {
  if (countWorkspaceLeaves(node) >= MAX_WORKSPACE_PANES) return node;

  const direction = splitDirectionForZone(zone);
  const newPaneId = options?.newPaneId ?? createPaneId();
  const newLeaf: WorkspaceLeafNode = { type: "leaf", id: newPaneId, content: newContent };
  const placeNewFirst = zone === "left" || zone === "top";

  const splitAtLeaf = (current: WorkspaceSplitNode): WorkspaceSplitNode => {
    if (current.type === "leaf") {
      if (current.id !== targetPaneId) return current;
      return {
        type: "split",
        direction,
        ratio: 0.5,
        first: placeNewFirst ? newLeaf : current,
        second: placeNewFirst ? current : newLeaf,
      };
    }
    return {
      ...current,
      first: splitAtLeaf(current.first),
      second: splitAtLeaf(current.second),
    };
  };

  return splitAtLeaf(node);
}

export function replaceWorkspaceLeafContent(
  node: WorkspaceSplitNode,
  paneId: string,
  content: WorkspacePaneContent
) {
  return updateWorkspaceLeaf(node, paneId, (leaf) => ({ ...leaf, content }));
}

export function maximizeWorkspaceLeaf(node: WorkspaceSplitNode, paneId: string) {
  const leaf = findWorkspaceLeaf(node, paneId);
  return leaf ?? node;
}

export function updateSplitRatioAtPath(
  node: WorkspaceSplitNode,
  path: readonly number[],
  ratio: number
): WorkspaceSplitNode {
  if (path.length === 0) {
    if (node.type === "split") return { ...node, ratio: clampSplitRatio(ratio) };
    return node;
  }
  if (node.type === "leaf") return node;
  const [index, ...rest] = path;
  if (index === 0) return { ...node, first: updateSplitRatioAtPath(node.first, rest, ratio) };
  return { ...node, second: updateSplitRatioAtPath(node.second, rest, ratio) };
}

export function normalizeWorkspaceLayout(
  layout: WorkspaceSplitNode | null,
  isValidDocument: (documentId: string) => boolean = () => true
): WorkspaceSplitNode | null {
  if (!layout) return null;

  const normalizeNode = (node: WorkspaceSplitNode): WorkspaceSplitNode | null => {
    if (node.type === "leaf") {
      if (node.content.type === "document" && !isValidDocument(node.content.documentId)) return null;
      return node;
    }
    const first = normalizeNode(node.first);
    const second = normalizeNode(node.second);
    if (!first && !second) return null;
    if (!first) return second;
    if (!second) return first;
    return { ...node, first, second };
  };

  let normalized = collapseSingleChildSplits(normalizeNode(layout));
  if (!normalized) return null;

  const leaves = collectWorkspaceLeaves(normalized);
  const seenDocuments = new Set<string>();
  const dedupedLeaves: WorkspaceLeafNode[] = [];
  for (const leaf of leaves) {
    if (leaf.content.type === "document") {
      if (seenDocuments.has(leaf.content.documentId)) continue;
      seenDocuments.add(leaf.content.documentId);
    }
    dedupedLeaves.push(leaf);
  }

  if (dedupedLeaves.length !== leaves.length) {
    if (dedupedLeaves.length === 0) return null;
    if (dedupedLeaves.length === 1) return dedupedLeaves[0];
    normalized = dedupedLeaves.reduce<WorkspaceSplitNode | null>((acc, leaf, index) => {
      if (index === 0) return leaf;
      if (!acc) return leaf;
      return {
        type: "split",
        direction: "horizontal",
        ratio: 0.5,
        first: acc,
        second: leaf,
      };
    }, null);
  }

  const finalLeaves = collectWorkspaceLeaves(normalized);
  if (finalLeaves.length > MAX_WORKSPACE_PANES) {
    const trimmed = finalLeaves.slice(0, MAX_WORKSPACE_PANES);
    normalized = trimmed.reduce<WorkspaceSplitNode | null>((acc, leaf, index) => {
      if (index === 0) return leaf;
      if (!acc) return leaf;
      return {
        type: "split",
        direction: index % 2 === 1 ? "horizontal" : "vertical",
        ratio: 0.5,
        first: acc,
        second: leaf,
      };
    }, null);
  }

  return normalized;
}

export function getDocumentIdFromLeaf(leaf: WorkspaceLeafNode | null) {
  return leaf?.content.type === "document" ? leaf.content.documentId : null;
}

export function getActiveDocumentId(layout: WorkspaceSplitNode | null, activePaneId: string | null) {
  if (!layout || !activePaneId) return getDocumentIdFromLeaf(collectWorkspaceLeaves(layout).find((leaf) => leaf.content.type === "document") ?? null);
  const activeLeaf = findWorkspaceLeaf(layout, activePaneId);
  const activeDocumentId = getDocumentIdFromLeaf(activeLeaf);
  if (activeDocumentId) return activeDocumentId;
  return getDocumentIdFromLeaf(collectWorkspaceLeaves(layout).find((leaf) => leaf.content.type === "document") ?? null);
}

export function workspaceLayoutFromLegacyPanes(
  panes: Array<{ id: string; documentId: string }>
): WorkspaceSplitNode | null {
  if (!panes.length) return null;
  if (panes.length === 1) {
    return createDocumentLeaf(panes[0].documentId, panes[0].id === "secondary" ? createPaneId() : MAIN_PANE_ID);
  }
  return {
    type: "split",
    direction: "horizontal",
    ratio: 0.5,
    first: createDocumentLeaf(panes[0].documentId, MAIN_PANE_ID),
    second: createDocumentLeaf(panes[1].documentId, "secondary-pane"),
  };
}

export function isSameDropTarget(left: WorkspaceDropTarget, right: WorkspaceDropTarget) {
  if (left === right) return true;
  if (!left || !right) return false;
  return left.paneId === right.paneId && left.zone === right.zone;
}

export function normalizeBrowserUrl(input: string) {
  const trimmed = input.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}
