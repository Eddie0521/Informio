import { describe, expect, it } from "vitest";
import { buildFileTree } from "./file-tree";
import { flattenVisibleFileTree } from "./file-tree-flat";
import type { InformioDocument, InformioFolder, InformioProject } from "../types";

const makeDocument = (overrides: Partial<InformioDocument> = {}): InformioDocument => ({
  id: "doc-1",
  title: "Test",
  markdown: "# Test",
  collection: "writing",
  updatedAt: new Date().toISOString(),
  ...overrides
});

const makeFolder = (overrides: Partial<InformioFolder> = {}): InformioFolder => ({
  id: "folder-1",
  title: "Folder",
  path: "/test/folder",
  updatedAt: new Date().toISOString(),
  ...overrides
});

const makeProject = (overrides: Partial<InformioProject> = {}): InformioProject => ({
  id: "project-1",
  title: "Project",
  path: "/test/project",
  addedAt: new Date().toISOString(),
  pinned: false,
  ...overrides
});

describe("flattenVisibleFileTree", () => {
  it("returns only roots when collapsed", () => {
    const tree = buildFileTree(
      [makeFolder({ path: "/test/project/src" })],
      [makeDocument({ id: "doc-a", filePath: "/test/project/src/a.md" })],
      [makeProject({ path: "/test/project" })]
    );
    const rows = flattenVisibleFileTree(tree, new Set());
    expect(rows.every((row) => row.kind === "folder")).toBe(true);
    expect(rows.some((row) => row.kind === "file")).toBe(false);
  });

  it("includes children and documents when expanded", () => {
    const tree = buildFileTree(
      [makeFolder({ path: "/test/project/src" })],
      [makeDocument({ id: "doc-a", filePath: "/test/project/src/a.md", title: "A" })],
      [makeProject({ path: "/test/project" })]
    );
    const expanded = new Set(["/test/project", "/test/project/src"]);
    const rows = flattenVisibleFileTree(tree, expanded);
    expect(rows.some((row) => row.kind === "file" && row.document.id === "doc-a")).toBe(true);
  });
});
