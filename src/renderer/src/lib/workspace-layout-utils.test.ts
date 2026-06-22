import { describe, expect, it } from "vitest";
import {
  browserTabLabel,
  collectWorkspaceLeaves,
  countWorkspaceLeaves,
  createAgentLeaf,
  createBrowserContent,
  createBrowserLeaf,
  createBrowserTab,
  createDocumentLeaf,
  findAgentLeaf,
  findDocumentLeafById,
  findWorkspaceLeaf,
  getBrowserTabIds,
  maximizeWorkspaceLeaf,
  normalizeBrowserContent,
  normalizeBrowserUrl,
  normalizeWorkspaceLayout,
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
      createBrowserContent()
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
      expect(leaf.content.tabs).toHaveLength(1);
      expect(leaf.content.tabs[0]?.id).toMatch(/^browser-/);
      expect(leaf.content.activeTabId).toBe(leaf.content.tabs[0]?.id);
    }
  });

  it("finds leaf by pane id", () => {
    const leaf = createBrowserLeaf("https://example.com", "pane-42");
    const found = findWorkspaceLeaf(leaf, "pane-42");
    expect(found?.content.type).toBe("browser");
    if (found?.content.type === "browser") {
      expect(found.content.tabs[0]?.url).toBe("https://example.com");
      expect(getBrowserTabIds(found.content)).toEqual([found.content.tabs[0]!.id]);
    }
  });

  it("normalizes legacy browser content", () => {
    const normalized = normalizeBrowserContent({ type: "browser", browserId: "browser-1", url: "https://example.com" });
    expect(normalized.tabs).toHaveLength(1);
    expect(normalized.tabs[0]).toEqual({ id: "browser-1", url: "https://example.com" });
    expect(normalized.activeTabId).toBe("browser-1");
  });

  it("labels browser tabs from title, host, or fallback", () => {
    expect(browserTabLabel({ id: "a", title: "Docs" }, "New tab")).toBe("Docs");
    expect(browserTabLabel({ id: "b", url: "https://example.com/path" }, "New tab")).toBe("example.com");
    expect(browserTabLabel({ id: "c" }, "New tab")).toBe("New tab");
  });

  it("creates independent browser tabs", () => {
    const first = createBrowserTab();
    const second = createBrowserTab("https://example.com");
    expect(first.id).not.toBe(second.id);
    expect(second.url).toBe("https://example.com");
  });
});
