import { describe, expect, it } from "vitest";
import {
  browserTabLabel,
  collectWorkspaceLeaves,
  countWorkspaceLeaves,
  createAgentLeaf,
  createBrowserContent,
  createBrowserId,
  createBrowserLeaf,
  createDocumentLeaf,
  findAgentLeaf,
  findBrowserLeafByTabId,
  findDocumentLeafById,
  findWorkspaceLeaf,
  getBrowserTabId,
  isSameDropTarget,
  maximizeWorkspaceLeaf,
  normalizeBrowserContent,
  normalizeBrowserUrl,
  normalizeWorkspaceLayout,
  paneDropZoneFromRect,
  removeWorkspaceLeaf,
  splitWorkspaceLeaf,
  updateSplitRatioAtPath,
  workspaceLayoutFromLegacyPanes,
} from "./workspace-layout-utils";
import type { WorkspaceSplitNode } from "../types";

describe("workspace layout utils", () => {
  it("splits a single document leaf horizontally", () => {
    const layout = createDocumentLeaf("doc-a");
    const next = splitWorkspaceLeaf(layout, layout.id, "right", { type: "document", documentId: "doc-b" });
    expect(countWorkspaceLeaves(next)).toBe(2);
    expect(collectWorkspaceLeaves(next!).map((leaf) => leaf.content)).toEqual([
      { type: "document", documentId: "doc-a" },
      { type: "document", documentId: "doc-b" },
    ]);
  });

  it("caps at four panes", () => {
    let layout: WorkspaceSplitNode = createDocumentLeaf("doc-1");
    layout = splitWorkspaceLeaf(layout, layout.id, "right", { type: "document", documentId: "doc-2" })!;
    const rightLeaf = collectWorkspaceLeaves(layout).find((leaf) => leaf.content.type === "document" && leaf.content.documentId === "doc-2")!;
    layout = splitWorkspaceLeaf(layout, rightLeaf.id, "bottom", { type: "document", documentId: "doc-3" })!;
    const bottomLeaf = collectWorkspaceLeaves(layout).find((leaf) => leaf.content.type === "document" && leaf.content.documentId === "doc-3")!;
    layout = splitWorkspaceLeaf(layout, bottomLeaf.id, "right", { type: "document", documentId: "doc-4" })!;
    expect(countWorkspaceLeaves(layout)).toBe(4);
    const blocked = splitWorkspaceLeaf(layout, bottomLeaf.id, "right", createBrowserContent());
    expect(countWorkspaceLeaves(blocked!)).toBe(4);
  });

  it("finds singleton agent leaf", () => {
    const layout = createAgentLeaf("agent-pane");
    expect(findAgentLeaf(layout)?.id).toBe("agent-pane");
  });

  it("removes a leaf and collapses the tree", () => {
    const layout = splitWorkspaceLeaf(
      createDocumentLeaf("doc-a"),
      createDocumentLeaf("doc-a").id,
      "right",
      { type: "document", documentId: "doc-b" }
    )!;
    const removed = removeWorkspaceLeaf(layout, collectWorkspaceLeaves(layout)[1].id);
    expect(countWorkspaceLeaves(removed)).toBe(1);
    expect(collectWorkspaceLeaves(removed!)[0].content).toEqual({ type: "document", documentId: "doc-a" });
  });

  it("maximizes a leaf to a single pane", () => {
    const layout = splitWorkspaceLeaf(
      createDocumentLeaf("doc-a"),
      createDocumentLeaf("doc-a").id,
      "right",
      createBrowserContent("browser-1")
    )!;
    const browserLeaf = collectWorkspaceLeaves(layout).find((leaf) => leaf.content.type === "browser")!;
    const maximized = maximizeWorkspaceLeaf(layout, browserLeaf.id);
    expect(maximized).toEqual(browserLeaf);
  });

  it("updates split ratio along a path", () => {
    const layout = splitWorkspaceLeaf(
      createDocumentLeaf("doc-a"),
      createDocumentLeaf("doc-a").id,
      "right",
      { type: "document", documentId: "doc-b" }
    )!;
    const updated = updateSplitRatioAtPath(layout, [], 0.7);
    expect(updated.type).toBe("split");
    if (updated.type === "split") expect(updated.ratio).toBe(0.7);
  });

  it("deduplicates duplicate document panes", () => {
    const layout = splitWorkspaceLeaf(
      createDocumentLeaf("doc-a"),
      createDocumentLeaf("doc-a").id,
      "right",
      { type: "document", documentId: "doc-a" }
    )!;
    const normalized = normalizeWorkspaceLayout(layout);
    expect(countWorkspaceLeaves(normalized)).toBe(1);
  });

  it("migrates legacy two-pane layout", () => {
    const layout = workspaceLayoutFromLegacyPanes([
      { id: "main", documentId: "doc-a" },
      { id: "secondary", documentId: "doc-b" },
    ]);
    expect(countWorkspaceLeaves(layout)).toBe(2);
    expect(findDocumentLeafById(layout, "doc-b")?.content).toEqual({ type: "document", documentId: "doc-b" });
  });

  it("normalizes browser urls", () => {
    expect(normalizeBrowserUrl("example.com")).toBe("https://example.com");
    expect(normalizeBrowserUrl("https://example.com")).toBe("https://example.com");
    expect(normalizeBrowserUrl("  ")).toBe("");
  });

  it("creates browser leaf with defaults", () => {
    const leaf = createBrowserLeaf();
    expect(leaf.content.type).toBe("browser");
    if (leaf.content.type === "browser") {
      expect(leaf.content.tabId).toMatch(/^browser-/);
    }
  });

  it("finds leaf by pane id", () => {
    const tabId = "browser-1";
    const leaf = createBrowserLeaf(tabId, "pane-42");
    const found = findWorkspaceLeaf(leaf, "pane-42");
    expect(found?.content).toEqual({ type: "browser", tabId });
  });

  it("normalizes legacy browser content", () => {
    const normalized = normalizeBrowserContent({ type: "browser", browserId: "browser-1", url: "https://example.com" });
    expect(normalized).toEqual({ type: "browser", tabId: "browser-1" });
    const fromTabs = normalizeBrowserContent({
      type: "browser",
      tabs: [{ id: "tab-a", url: "https://a.com" }, { id: "tab-b" }],
      activeTabId: "tab-b",
    });
    expect(fromTabs.tabId).toBe("tab-b");
  });

  it("finds browser leaf by tab id", () => {
    const layout = createBrowserLeaf("browser-42", "pane-1");
    expect(findBrowserLeafByTabId(layout, "browser-42")?.id).toBe("pane-1");
    expect(getBrowserTabId({ type: "browser", tabId: "browser-42" })).toBe("browser-42");
  });

  it("labels browser tabs from title, host, or fallback", () => {
    expect(browserTabLabel({ title: "Docs" }, "New tab")).toBe("Docs");
    expect(browserTabLabel({ url: "https://example.com/path" }, "New tab")).toBe("example.com");
    expect(browserTabLabel(undefined, "New tab")).toBe("New tab");
  });

  it("creates independent browser tab ids", () => {
    const first = createBrowserId();
    const second = createBrowserId();
    expect(first).not.toBe(second);
  });

  it("resolves drop zones by aspect-independent quadrants", () => {
    const tall = { left: 0, top: 0, width: 400, height: 800 };
    // Upper half of a tall, narrow pane should resolve to "top", not "left"/"right".
    expect(paneDropZoneFromRect(tall, 200, 80)).toBe("top");
    expect(paneDropZoneFromRect(tall, 200, 720)).toBe("bottom");
    expect(paneDropZoneFromRect(tall, 20, 400)).toBe("left");
    expect(paneDropZoneFromRect(tall, 380, 400)).toBe("right");

    const wide = { left: 0, top: 0, width: 1000, height: 300 };
    expect(paneDropZoneFromRect(wide, 30, 150)).toBe("left");
    expect(paneDropZoneFromRect(wide, 970, 150)).toBe("right");
    expect(paneDropZoneFromRect(wide, 500, 20)).toBe("top");
    expect(paneDropZoneFromRect(wide, 500, 280)).toBe("bottom");
  });

  it("compares drop targets for dedup", () => {
    expect(isSameDropTarget(null, null)).toBe(true);
    expect(isSameDropTarget({ paneId: "p", zone: "top" }, { paneId: "p", zone: "top" })).toBe(true);
    expect(isSameDropTarget({ paneId: "p", zone: "top" }, { paneId: "p", zone: "bottom" })).toBe(false);
    expect(isSameDropTarget(null, { paneId: "p", zone: "top" })).toBe(false);
  });
});
