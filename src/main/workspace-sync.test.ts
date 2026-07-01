import { describe, expect, it } from "vitest";
import {
  collectPendingChange,
  collectUniquePaths,
  documentMatchesRemovedPath,
  filterFolderPathsAfterRemoval,
  mergeRefreshedDocuments,
  normalizeWorkspacePath,
  shouldFallbackToFullRefresh,
  workspacePathContains
} from "./workspace-sync";

describe("normalizeWorkspacePath", () => {
  it("normalizes slashes and trailing slash", () => {
    expect(normalizeWorkspacePath("/tmp/foo/", false)).toBe("/tmp/foo");
  });
});

describe("collectPendingChange", () => {
  it("returns absolute path for file events", () => {
    expect(collectPendingChange("/project", "change", "notes/a.md", false)).toEqual({
      kind: "path",
      absolutePath: "/project/notes/a.md"
    });
  });

  it("requests fallback when filename is missing", () => {
    expect(collectPendingChange("/project", "rename", null, false)).toEqual({ kind: "fallback" });
  });
});

describe("shouldFallbackToFullRefresh", () => {
  it("falls back when pending exceeds threshold", () => {
    const pending = new Set(Array.from({ length: 51 }, (_, index) => `/p/${index}.md`));
    expect(shouldFallbackToFullRefresh(pending)).toBe(true);
  });

  it("keeps incremental refresh for small batches", () => {
    expect(shouldFallbackToFullRefresh(new Set(["/p/a.md"]))).toBe(false);
  });
});

describe("mergeRefreshedDocuments", () => {
  it("replaces refreshed paths and removes deleted subtrees", () => {
    const current = [
      { id: "a", filePath: "/project/a.md" },
      { id: "b", filePath: "/project/old/b.md" },
      { id: "local", filePath: undefined }
    ];
    const refreshed = [{ id: "a2", filePath: "/project/a.md" }];
    const merged = mergeRefreshedDocuments(
      current,
      refreshed,
      ["/project/old"],
      (path) => path.startsWith("/project")
    );
    expect(merged.map((doc) => doc.id)).toEqual(["local", "a2"]);
  });
});

describe("documentMatchesRemovedPath", () => {
  it("matches exact file and descendants", () => {
    expect(documentMatchesRemovedPath("/project/a.md", "/project/a.md", false)).toBe(true);
    expect(documentMatchesRemovedPath("/project/sub/a.md", "/project/sub", false)).toBe(true);
    expect(documentMatchesRemovedPath("/project/other.md", "/project/sub", false)).toBe(false);
  });
});

describe("filterFolderPathsAfterRemoval", () => {
  it("drops folders under removed paths", () => {
    const folders = ["/project", "/project/sub", "/outside"];
    expect(filterFolderPathsAfterRemoval(folders, ["/project/sub"], false)).toEqual(["/project", "/outside"]);
  });
});

describe("workspacePathContains", () => {
  it("treats nested paths as contained", () => {
    expect(workspacePathContains("/project", "/project/a.md", false)).toBe(true);
  });
});

describe("collectUniquePaths", () => {
  it("deduplicates normalized paths", () => {
    expect(collectUniquePaths(["/a", "/a/", "/b"], false)).toEqual(["/a", "/b"]);
  });
});
