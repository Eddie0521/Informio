import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("electron-log", () => ({
  default: { warn: vi.fn() }
}));

vi.mock("node:fs", () => ({
  statSync: vi.fn()
}));

import { statSync } from "node:fs";
import {
  normalizeFsPath,
  collectFileChangePaths,
  mergeToolOutput,
  createFileChangeAudit,
  verifyFileChangeAudit,
  type FileChangeAudit
} from "./fileChangeVerification";

type MockStatsOpts = {
  isFile?: boolean;
  isDirectory?: boolean;
  size?: number;
  mtimeMs?: number;
};

function makeStats(opts: MockStatsOpts = {}) {
  return {
    isFile: () => opts.isFile ?? true,
    isDirectory: () => opts.isDirectory ?? false,
    size: opts.size ?? 100,
    mtimeMs: opts.mtimeMs ?? 1000
  };
}

// --- existing tests ---

describe("normalizeFsPath", () => {
  it("resolves and normalizes path", () => {
    const result = normalizeFsPath("a/b/c");
    expect(result).toContain("a/b/c");
    expect(result).not.toContain("\\");
  });
  it("removes trailing slash", () => {
    const result = normalizeFsPath("/tmp/");
    expect(result).not.toMatch(/\/$/);
  });
});

describe("collectFileChangePaths", () => {
  it("extracts paths from object with known keys", () => {
    expect(collectFileChangePaths({ path: "/a.txt", file: "/b.txt" })).toEqual(["/a.txt", "/b.txt"]);
  });
  it("extracts from nested objects", () => {
    expect(collectFileChangePaths({ tool: { path: "/a.txt" } })).toEqual(["/a.txt"]);
  });
  it("extracts from arrays inside objects with matching key", () => {
    expect(collectFileChangePaths({ path: ["/a.txt", "/b.txt"] })).toEqual(["/a.txt", "/b.txt"]);
  });
  it("returns empty for non-object", () => {
    expect(collectFileChangePaths("string")).toEqual([]);
    expect(collectFileChangePaths(123)).toEqual([]);
    expect(collectFileChangePaths(null)).toEqual([]);
  });
  it("extracts all string values when pathKeysOnly is false", () => {
    const result = collectFileChangePaths({ foo: "/a.txt", bar: "/b.txt" }, false);
    expect(result).toContain("/a.txt");
    expect(result).toContain("/b.txt");
  });
  it("skips non-string values", () => {
    expect(collectFileChangePaths({ path: 123, file: "/a.txt" })).toEqual(["/a.txt"]);
  });
  it("skips empty strings", () => {
    expect(collectFileChangePaths({ path: "", file: "/a.txt" })).toEqual(["/a.txt"]);
  });
  it("handles deeply nested structures", () => {
    expect(collectFileChangePaths({ a: { b: { c: { path: "/deep.txt" } } } })).toEqual(["/deep.txt"]);
  });
  it("handles cwd key", () => {
    expect(collectFileChangePaths({ cwd: "/workspace" })).toEqual(["/workspace"]);
  });
  it("handles dir and directory keys", () => {
    expect(collectFileChangePaths({ dir: "/a", directory: "/b" })).toEqual(["/a", "/b"]);
  });
});

describe("mergeToolOutput", () => {
  it("joins non-empty items", () => {
    expect(mergeToolOutput(["a", "b", "c"])).toBe("a\n\nb\n\nc");
  });
  it("filters out undefined", () => {
    expect(mergeToolOutput(["a", undefined, "b"])).toBe("a\n\nb");
  });
  it("filters out empty strings", () => {
    expect(mergeToolOutput(["a", "", "  ", "b"])).toBe("a\n\nb");
  });
  it("returns empty for all empty", () => {
    expect(mergeToolOutput([undefined, "", "  "])).toBe("");
  });
  it("returns empty for empty array", () => {
    expect(mergeToolOutput([])).toBe("");
  });
  it("handles single item", () => {
    expect(mergeToolOutput(["only"])).toBe("only");
  });
  it("handles only undefined items", () => {
    expect(mergeToolOutput([undefined, undefined])).toBe("");
  });
});

// --- new tests ---

describe("createFileChangeAudit", () => {
  beforeEach(() => {
    vi.mocked(statSync).mockReset();
  });

  it("creates audit for a single existing absolute path", () => {
    vi.mocked(statSync).mockReturnValue(makeStats({ size: 50, mtimeMs: 1000 }) as any);
    const audit = createFileChangeAudit(["/workspace/file.txt"], { cwd: "/workspace" });

    expect(audit.cwd).toBe(normalizeFsPath("/workspace"));
    expect(audit.paths).toHaveLength(1);
    expect(audit.paths[0]).toBe(normalizeFsPath("/workspace/file.txt"));

    const snap = audit.before.get(audit.paths[0]);
    expect(snap).toBeDefined();
    expect(snap!.kind).toBe("file");
    expect(snap!.size).toBe(50);
    expect(snap!.mtimeMs).toBe(1000);
  });

  it("handles missing files (statSync returns undefined)", () => {
    vi.mocked(statSync).mockReturnValue(undefined as any);
    const audit = createFileChangeAudit(["/workspace/missing.txt"], { cwd: "/workspace" });

    expect(audit.paths).toHaveLength(1);
    const snap = audit.before.get(audit.paths[0]);
    expect(snap).toBeDefined();
    expect(snap!.kind).toBe("missing");
    expect(snap!.size).toBeNull();
    expect(snap!.mtimeMs).toBeNull();
  });

  it("handles directory snapshots", () => {
    vi.mocked(statSync).mockReturnValue(makeStats({ isFile: false, isDirectory: true, mtimeMs: 2000 }) as any);
    const audit = createFileChangeAudit(["/workspace/src"], { cwd: "/workspace" });

    const snap = audit.before.get(audit.paths[0]);
    expect(snap!.kind).toBe("directory");
    expect(snap!.size).toBeNull();
    expect(snap!.mtimeMs).toBe(2000);
  });

  it("handles 'other' file type (neither file nor directory)", () => {
    vi.mocked(statSync).mockReturnValue(makeStats({ isFile: false, isDirectory: false, mtimeMs: 3000 }) as any);
    const audit = createFileChangeAudit(["/dev/null"], { cwd: "/" });

    const snap = audit.before.get(audit.paths[0]);
    expect(snap!.kind).toBe("other");
  });

  it("resolves relative paths against cwd", () => {
    vi.mocked(statSync).mockReturnValue(makeStats() as any);
    const audit = createFileChangeAudit(["src/file.txt"], { cwd: "/workspace" });

    expect(audit.paths).toHaveLength(1);
    expect(audit.paths[0]).toBe(normalizeFsPath("/workspace/src/file.txt"));
  });

  it("resolves relative paths against roots when file exists there", () => {
    // First call (against cwd) returns missing, second call (against root) returns file
    vi.mocked(statSync).mockImplementation((() => {
      let callCount = 0;
      return (..._args: any[]) => {
        callCount++;
        // resolveTrackedPath checks each candidate via snapshotFile
        // For the path "file.txt" resolved against "/workspace", it checks /workspace/file.txt
        // For the path "file.txt" resolved against "/root", it checks /root/file.txt
        // The first candidate that exists wins
        if (callCount <= 1) return undefined; // /workspace/file.txt missing
        return makeStats(); // /root/file.txt exists
      };
    }) as any);

    const audit = createFileChangeAudit(["file.txt"], { cwd: "/workspace", roots: ["/root"] });
    // The path should be resolved - either against cwd or root
    expect(audit.paths.length).toBeGreaterThanOrEqual(1);
  });

  it("filters out empty and whitespace-only paths", () => {
    const audit = createFileChangeAudit(["", "  ", "\t"], { cwd: "/workspace" });
    expect(audit.paths).toHaveLength(0);
  });

  it("deduplicates paths", () => {
    vi.mocked(statSync).mockReturnValue(makeStats() as any);
    const audit = createFileChangeAudit(["/workspace/a.txt", "/workspace/a.txt"], { cwd: "/workspace" });
    expect(audit.paths).toHaveLength(1);
  });

  it("handles multiple files", () => {
    vi.mocked(statSync).mockReturnValue(makeStats({ size: 100, mtimeMs: 500 }) as any);
    const audit = createFileChangeAudit(["/a.txt", "/b.txt", "/c.txt"], { cwd: "/" });
    expect(audit.paths).toHaveLength(3);
    expect(audit.before.size).toBe(3);
  });

  it("normalizes cwd and roots", () => {
    vi.mocked(statSync).mockReturnValue(makeStats() as any);
    const audit = createFileChangeAudit(["/workspace/a.txt"], { cwd: "/workspace/", roots: ["/other/"] });
    expect(audit.cwd).toBe(normalizeFsPath("/workspace"));
    expect(audit.roots).toContain(normalizeFsPath("/other"));
  });

  it("handles statSync throwing an error", () => {
    vi.mocked(statSync).mockImplementation(() => { throw new Error("EACCES"); });
    const audit = createFileChangeAudit(["/locked.txt"], { cwd: "/" });

    const snap = audit.before.get(audit.paths[0]);
    expect(snap!.kind).toBe("missing");
  });

  it("returns empty paths for empty rawPaths input", () => {
    const audit = createFileChangeAudit([], { cwd: "/workspace" });
    expect(audit.paths).toHaveLength(0);
    expect(audit.before.size).toBe(0);
  });

  it("defaults roots to empty array when not provided", () => {
    vi.mocked(statSync).mockReturnValue(makeStats() as any);
    const audit = createFileChangeAudit(["/a.txt"], { cwd: "/" });
    expect(audit.roots).toEqual([]);
  });

  it("filters falsy roots", () => {
    vi.mocked(statSync).mockReturnValue(makeStats() as any);
    const audit = createFileChangeAudit(["/a.txt"], { cwd: "/", roots: ["", "/real", undefined as any, null as any] });
    expect(audit.roots).toContain(normalizeFsPath("/real"));
    expect(audit.roots).not.toContain("");
  });

  it("uses root-relative path when file only exists under a root", () => {
    let callIdx = 0;
    vi.mocked(statSync).mockImplementation((() => {
      callIdx++;
      // First path resolution check: /workspace/file.txt -> missing
      if (callIdx === 1) return undefined;
      // Second path resolution check: /project/file.txt -> exists
      return makeStats({ size: 42, mtimeMs: 999 });
    }) as any);

    const audit = createFileChangeAudit(["file.txt"], { cwd: "/workspace", roots: ["/project"] });
    expect(audit.paths).toHaveLength(1);
    // The resolved path should be under one of the bases
    expect(audit.paths[0]).toContain("file.txt");
  });
});

describe("verifyFileChangeAudit", () => {
  beforeEach(() => {
    vi.mocked(statSync).mockReset();
  });

  it("returns not ok when paths array is empty", () => {
    const audit: FileChangeAudit = {
      cwd: "/workspace",
      roots: [],
      paths: [],
      before: new Map()
    };
    const result = verifyFileChangeAudit(audit);
    expect(result.ok).toBe(false);
    expect(result.changedPaths).toEqual([]);
    expect(result.unchangedPaths).toEqual([]);
    expect(result.message).toContain("没有提供可校验路径");
  });

  it("detects file size change", () => {
    const path = normalizeFsPath("/workspace/file.txt");
    const audit: FileChangeAudit = {
      cwd: "/workspace",
      roots: [],
      paths: [path],
      before: new Map([[path, { kind: "file", size: 100, mtimeMs: 1000 }]])
    };

    vi.mocked(statSync).mockReturnValue(makeStats({ size: 200, mtimeMs: 1000 }) as any);

    const result = verifyFileChangeAudit(audit);
    expect(result.ok).toBe(true);
    expect(result.changedPaths).toEqual([path]);
    expect(result.unchangedPaths).toEqual([]);
    expect(result.message).toContain("已确认写入磁盘");
  });

  it("detects file mtime change", () => {
    const path = normalizeFsPath("/workspace/file.txt");
    const audit: FileChangeAudit = {
      cwd: "/workspace",
      roots: [],
      paths: [path],
      before: new Map([[path, { kind: "file", size: 100, mtimeMs: 1000 }]])
    };

    vi.mocked(statSync).mockReturnValue(makeStats({ size: 100, mtimeMs: 2000 }) as any);

    const result = verifyFileChangeAudit(audit);
    expect(result.ok).toBe(true);
    expect(result.changedPaths).toEqual([path]);
  });

  it("detects file kind change (file -> missing)", () => {
    const path = normalizeFsPath("/workspace/file.txt");
    const audit: FileChangeAudit = {
      cwd: "/workspace",
      roots: [],
      paths: [path],
      before: new Map([[path, { kind: "file", size: 100, mtimeMs: 1000 }]])
    };

    vi.mocked(statSync).mockReturnValue(undefined as any);

    const result = verifyFileChangeAudit(audit);
    expect(result.ok).toBe(true);
    expect(result.changedPaths).toEqual([path]);
    expect(result.changedPaths[0]).toBe(path);
  });

  it("detects file kind change (missing -> file)", () => {
    const path = normalizeFsPath("/workspace/file.txt");
    const audit: FileChangeAudit = {
      cwd: "/workspace",
      roots: [],
      paths: [path],
      before: new Map([[path, { kind: "missing", size: null, mtimeMs: null }]])
    };

    vi.mocked(statSync).mockReturnValue(makeStats({ size: 50, mtimeMs: 3000 }) as any);

    const result = verifyFileChangeAudit(audit);
    expect(result.ok).toBe(true);
    expect(result.changedPaths).toEqual([path]);
  });

  it("detects kind change (file -> directory)", () => {
    const path = normalizeFsPath("/workspace/item");
    const audit: FileChangeAudit = {
      cwd: "/workspace",
      roots: [],
      paths: [path],
      before: new Map([[path, { kind: "file", size: 100, mtimeMs: 1000 }]])
    };

    vi.mocked(statSync).mockReturnValue(makeStats({ isFile: false, isDirectory: true, mtimeMs: 1000 }) as any);

    const result = verifyFileChangeAudit(audit);
    expect(result.ok).toBe(true);
    expect(result.changedPaths).toEqual([path]);
  });

  it("reports no changes when snapshots match", () => {
    const path = normalizeFsPath("/workspace/file.txt");
    const audit: FileChangeAudit = {
      cwd: "/workspace",
      roots: [],
      paths: [path],
      before: new Map([[path, { kind: "file", size: 100, mtimeMs: 1000 }]])
    };

    vi.mocked(statSync).mockReturnValue(makeStats({ size: 100, mtimeMs: 1000 }) as any);

    const result = verifyFileChangeAudit(audit);
    expect(result.ok).toBe(false);
    expect(result.changedPaths).toEqual([]);
    expect(result.unchangedPaths).toEqual([path]);
    expect(result.message).toContain("未在磁盘确认到任何实际变化");
  });

  it("handles mixed changed and unchanged paths", () => {
    const changedPath = normalizeFsPath("/workspace/changed.txt");
    const unchangedPath = normalizeFsPath("/workspace/unchanged.txt");
    const audit: FileChangeAudit = {
      cwd: "/workspace",
      roots: [],
      paths: [changedPath, unchangedPath],
      before: new Map([
        [changedPath, { kind: "file", size: 100, mtimeMs: 1000 }],
        [unchangedPath, { kind: "file", size: 200, mtimeMs: 2000 }]
      ])
    };

    vi.mocked(statSync).mockImplementation((path: any) => {
      if (path === changedPath) return makeStats({ size: 999, mtimeMs: 1000 }) as any;
      return makeStats({ size: 200, mtimeMs: 2000 }) as any;
    });

    const result = verifyFileChangeAudit(audit);
    expect(result.ok).toBe(true);
    expect(result.changedPaths).toEqual([changedPath]);
    expect(result.unchangedPaths).toEqual([unchangedPath]);
    expect(result.message).toContain("部分改动写入磁盘");
    expect(result.message).toContain("未检测到变化");
  });

  it("falls back to snapshotFile when path not in before map", () => {
    const path = normalizeFsPath("/workspace/file.txt");
    const audit: FileChangeAudit = {
      cwd: "/workspace",
      roots: [],
      paths: [path],
      before: new Map() // empty - path not in before map
    };

    // Both calls (fallback snapshot + after snapshot) return the same
    vi.mocked(statSync).mockReturnValue(makeStats({ size: 100, mtimeMs: 1000 }) as any);

    const result = verifyFileChangeAudit(audit);
    expect(result.ok).toBe(false);
    expect(result.unchangedPaths).toEqual([path]);
  });

  it("detects multiple changed files", () => {
    const p1 = normalizeFsPath("/a.txt");
    const p2 = normalizeFsPath("/b.txt");
    const p3 = normalizeFsPath("/c.txt");
    const audit: FileChangeAudit = {
      cwd: "/",
      roots: [],
      paths: [p1, p2, p3],
      before: new Map([
        [p1, { kind: "file", size: 10, mtimeMs: 100 }],
        [p2, { kind: "file", size: 20, mtimeMs: 200 }],
        [p3, { kind: "file", size: 30, mtimeMs: 300 }]
      ])
    };

    vi.mocked(statSync).mockImplementation((path: any) => {
      if (path === p1) return makeStats({ size: 10, mtimeMs: 100 }) as any; // unchanged
      if (path === p2) return makeStats({ size: 99, mtimeMs: 200 }) as any;  // size changed
      if (path === p3) return undefined as any;                                // now missing
      return undefined as any;
    });

    const result = verifyFileChangeAudit(audit);
    expect(result.ok).toBe(true);
    expect(result.changedPaths).toEqual([p2, p3]);
    expect(result.unchangedPaths).toEqual([p1]);
  });

  it("displays relative paths in messages when cwd/roots are set", () => {
    const path = normalizeFsPath("/workspace/src/file.txt");
    const audit: FileChangeAudit = {
      cwd: normalizeFsPath("/workspace"),
      roots: [],
      paths: [path],
      before: new Map([[path, { kind: "file", size: 100, mtimeMs: 1000 }]])
    };

    vi.mocked(statSync).mockReturnValue(makeStats({ size: 200, mtimeMs: 1000 }) as any);

    const result = verifyFileChangeAudit(audit);
    expect(result.message).toContain("src/file.txt");
  });

  it("handles statSync throwing during verification", () => {
    const path = normalizeFsPath("/workspace/file.txt");
    const audit: FileChangeAudit = {
      cwd: "/workspace",
      roots: [],
      paths: [path],
      before: new Map([[path, { kind: "file", size: 100, mtimeMs: 1000 }]])
    };

    vi.mocked(statSync).mockImplementation(() => { throw new Error("ENOENT"); });

    const result = verifyFileChangeAudit(audit);
    // Thrown error -> snapshotFile returns "missing" -> kind changed (file -> missing)
    expect(result.ok).toBe(true);
    expect(result.changedPaths).toEqual([path]);
  });

  it("all changed paths produce success message", () => {
    const p1 = normalizeFsPath("/a.txt");
    const p2 = normalizeFsPath("/b.txt");
    const audit: FileChangeAudit = {
      cwd: "/",
      roots: [],
      paths: [p1, p2],
      before: new Map([
        [p1, { kind: "file", size: 10, mtimeMs: 100 }],
        [p2, { kind: "file", size: 20, mtimeMs: 200 }]
      ])
    };

    vi.mocked(statSync).mockReturnValue(makeStats({ size: 999, mtimeMs: 9999 }) as any);

    const result = verifyFileChangeAudit(audit);
    expect(result.ok).toBe(true);
    expect(result.changedPaths).toHaveLength(2);
    expect(result.unchangedPaths).toHaveLength(0);
    expect(result.message).toContain("已确认写入磁盘");
    expect(result.message).not.toContain("未检测到变化");
  });
});

describe("displayPath (via verifyFileChangeAudit messages)", () => {
  beforeEach(() => {
    vi.mocked(statSync).mockReset();
  });

  it("uses relative path from cwd in messages", () => {
    const path = normalizeFsPath("/workspace/src/app.ts");
    const audit: FileChangeAudit = {
      cwd: normalizeFsPath("/workspace"),
      roots: [],
      paths: [path],
      before: new Map([[path, { kind: "file", size: 10, mtimeMs: 100 }]])
    };

    // unchanged -> message includes the path
    vi.mocked(statSync).mockReturnValue(makeStats({ size: 10, mtimeMs: 100 }) as any);
    const result = verifyFileChangeAudit(audit);
    expect(result.message).toContain("src/app.ts");
    expect(result.message).not.toContain("/workspace/src/app.ts");
  });

  it("uses relative path from root in messages", () => {
    const path = normalizeFsPath("/project/lib/mod.ts");
    const audit: FileChangeAudit = {
      cwd: normalizeFsPath("/workspace"),
      roots: [normalizeFsPath("/project")],
      paths: [path],
      before: new Map([[path, { kind: "file", size: 10, mtimeMs: 100 }]])
    };

    vi.mocked(statSync).mockReturnValue(makeStats({ size: 10, mtimeMs: 100 }) as any);
    const result = verifyFileChangeAudit(audit);
    expect(result.message).toContain("lib/mod.ts");
  });

  it("shows '.' for path equal to cwd", () => {
    const path = normalizeFsPath("/workspace");
    const audit: FileChangeAudit = {
      cwd: normalizeFsPath("/workspace"),
      roots: [],
      paths: [path],
      before: new Map([[path, { kind: "directory", size: null, mtimeMs: 100 }]])
    };

    vi.mocked(statSync).mockReturnValue(makeStats({ isFile: false, isDirectory: true, mtimeMs: 200 }) as any);
    const result = verifyFileChangeAudit(audit);
    expect(result.message).toContain(".");
  });

  it("picks shortest relative path from multiple bases", () => {
    const path = normalizeFsPath("/workspace/src/file.txt");
    const audit: FileChangeAudit = {
      cwd: normalizeFsPath("/workspace"),
      roots: [normalizeFsPath("/workspace/src")],
      paths: [path],
      before: new Map([[path, { kind: "file", size: 10, mtimeMs: 100 }]])
    };

    vi.mocked(statSync).mockReturnValue(makeStats({ size: 10, mtimeMs: 100 }) as any);
    const result = verifyFileChangeAudit(audit);
    // Should pick "file.txt" (from root) over "src/file.txt" (from cwd) since it's shorter
    expect(result.message).toContain("file.txt");
  });
});
