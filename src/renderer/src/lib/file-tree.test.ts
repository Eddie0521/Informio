import { describe, expect, it } from "vitest";
import {
  documentStructureKey,
  documentLookupKey,
  folderChain,
  buildFileTree,
  filterFileTree,
  fallbackFolder,
  treeNode,
  DOCUMENT_DRAG_MIME,
  FOLDER_DRAG_MIME,
  TREE_ITEM_DRAG_MIME,
  serializeTreeDragPayload,
  parseTreeDragPayload
} from "./file-tree";
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

describe("documentStructureKey", () => {
  it("generates consistent key for same documents", () => {
    const docs = [makeDocument({ id: "a" }), makeDocument({ id: "b" })];
    expect(documentStructureKey(docs)).toBe(documentStructureKey(docs));
  });

  it("generates different key for different documents", () => {
    const a = [makeDocument({ id: "a" })];
    const b = [makeDocument({ id: "b" })];
    expect(documentStructureKey(a)).not.toBe(documentStructureKey(b));
  });
});

describe("documentLookupKey", () => {
  it("includes excluded id", () => {
    const docs = [makeDocument()];
    expect(documentLookupKey(docs, "excluded")).toContain("excluded");
  });

  it("uses empty prefix when no exclusion", () => {
    const docs = [makeDocument()];
    expect(documentLookupKey(docs)).toMatch(/^::/);
  });
});

describe("fallbackFolder", () => {
  it("creates folder from path", () => {
    const folder = fallbackFolder("/test/path");
    expect(folder.path).toBe("/test/path");
    expect(folder.title).toBe("path");
    expect(folder.id).toContain("folder-");
  });
});

describe("treeNode", () => {
  it("creates empty tree node", () => {
    const folder = makeFolder();
    const node = treeNode(folder);
    expect(node.folder).toBe(folder);
    expect(node.documents).toEqual([]);
    expect(node.children).toEqual([]);
    expect(node.documentCount).toBe(0);
  });
});

describe("folderChain", () => {
  it("returns empty for empty path", () => {
    expect(folderChain("", ["/test"])).toEqual([]);
  });

  it("returns chain from root to path", () => {
    const chain = folderChain("/test/project/sub/deep", ["/test/project"]);
    expect(chain).toEqual(["/test/project", "/test/project/sub", "/test/project/sub/deep"]);
  });
});

describe("buildFileTree", () => {
  it("creates tree from folders and documents", () => {
    const folders = [makeFolder({ path: "/project/src" })];
    const documents = [makeDocument({ filePath: "/project/src/file.md" })];
    const projects = [makeProject({ path: "/project" })];
    const tree = buildFileTree(folders, documents, projects);
    expect(tree.length).toBeGreaterThan(0);
  });

  it("groups loose documents under Local Drafts", () => {
    const documents = [makeDocument({ filePath: undefined })];
    const tree = buildFileTree([], documents, []);
    const drafts = tree.find((n) => n.folder.id === "local-drafts");
    expect(drafts).toBeDefined();
    expect(drafts!.documents).toHaveLength(1);
  });

  it("sorts projects with pinned first", () => {
    const projects = [
      makeProject({ path: "/b", title: "B", pinned: false }),
      makeProject({ path: "/a", title: "A", pinned: true })
    ];
    const tree = buildFileTree([], [], projects);
    expect(tree[0].folder.title).toBe("A");
  });
});

describe("filterFileTree", () => {
  it("matches by folder title", () => {
    const tree = [treeNode(makeFolder({ title: "Alpha", path: "/alpha" }))];
    const result = filterFileTree(tree, "alpha");
    expect(result).toHaveLength(1);
  });

  it("matches by document title", () => {
    const node = treeNode(makeFolder({ path: "/test" }));
    node.documents = [makeDocument({ title: "Special" })];
    const result = filterFileTree([node], "special");
    expect(result).toHaveLength(1);
  });

  it("returns empty for no match", () => {
    const tree = [treeNode(makeFolder({ path: "/test" }))];
    expect(filterFileTree(tree, "nonexistent")).toEqual([]);
  });
});

describe("drag helpers", () => {
  it("serializes and parses tree drag payload", () => {
    const payload = { type: "file" as const, documentId: "doc-1", path: "/test" };
    const serialized = serializeTreeDragPayload(payload);
    expect(typeof serialized).toBe("string");

    const mockDataTransfer = {
      getData: (type: string) => (type === TREE_ITEM_DRAG_MIME ? serialized : "")
    } as unknown as DataTransfer;
    const parsed = parseTreeDragPayload(mockDataTransfer);
    expect(parsed).toEqual(payload);
  });

  it("defines correct MIME constants", () => {
    expect(DOCUMENT_DRAG_MIME).toBe("application/x-informio-document-id");
    expect(FOLDER_DRAG_MIME).toBe("application/x-informio-folder-path");
    expect(TREE_ITEM_DRAG_MIME).toBe("text/informio-tree-item");
  });
});
