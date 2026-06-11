import { describe, expect, it } from "vitest";
import {
  normalizePath,
  normalizePathForCompare,
  pathBaseName,
  pathDirName,
  pathExtName,
  isAbsoluteAssetPath,
  hasRenderableScheme,
  safeDecodeUri,
  encodeLocalFilePath,
  localFileUrlForPath,
  joinAssetPath,
  pathContains,
  relativePath,
  shortcutDisplayPlatform,
  isWindowsPlatform
} from "./path";

// ─── normalizePath ───────────────────────────────────────────────────────────

describe("normalizePath", () => {
  it("converts backslashes to forward slashes", () => {
    expect(normalizePath("a\\b\\c")).toBe("a/b/c");
  });

  it("strips trailing slashes", () => {
    expect(normalizePath("a/b/c/")).toBe("a/b/c");
    expect(normalizePath("a/b/c//")).toBe("a/b/c");
  });

  it("normalizes mixed separators and trailing slashes", () => {
    // "a\\b/c\\" in JS -> a\b/c\ -> normalize -> a//b/c -> strip trailing -> a//b/c
    // normalizePath only replaces backslashes and strips trailing slashes, does not collapse doubles
    expect(normalizePath("a\\b\\c/")).toBe("a/b/c");
  });

  it("handles empty string", () => {
    expect(normalizePath("")).toBe("");
  });

  it("handles root slash", () => {
    expect(normalizePath("/")).toBe("");
  });

  it("handles single segment", () => {
    expect(normalizePath("file.txt")).toBe("file.txt");
  });

  it("handles Windows absolute path", () => {
    expect(normalizePath("C:\\Users\\test")).toBe("C:/Users/test");
  });
});

// ─── normalizePathForCompare ─────────────────────────────────────────────────

describe("normalizePathForCompare", () => {
  it("normalizes separators", () => {
    const result = normalizePathForCompare("a\\b/c");
    expect(result).toContain("/");
    expect(result).not.toContain("\\");
  });

  it("strips trailing slashes", () => {
    expect(normalizePathForCompare("a/b/")).toBe(normalizePathForCompare("a/b"));
  });

  if (isWindowsPlatform) {
    it("lowercases on Windows", () => {
      expect(normalizePathForCompare("A/B/C")).toBe("a/b/c");
    });
  } else {
    it("preserves case on non-Windows", () => {
      expect(normalizePathForCompare("A/B/C")).toBe("A/B/C");
    });
  }
});

// ─── pathBaseName ────────────────────────────────────────────────────────────

describe("pathBaseName", () => {
  it("returns last segment of unix path", () => {
    expect(pathBaseName("/a/b/c.txt")).toBe("c.txt");
  });

  it("returns last segment when no slashes", () => {
    expect(pathBaseName("file.txt")).toBe("file.txt");
  });

  it("handles trailing slash by returning last real segment", () => {
    expect(pathBaseName("/a/b/dir/")).toBe("dir");
  });

  it("handles Windows backslash paths", () => {
    expect(pathBaseName("C:\\Users\\doc.md")).toBe("doc.md");
  });

  it("handles empty segments from trailing slashes", () => {
    // After normalize + split + filter(Boolean), empty string yields []
    // at(-1) is undefined, so fallback to original path
    expect(pathBaseName("/")).toBe("/");
  });

  it("returns full path for single segment", () => {
    expect(pathBaseName("hello")).toBe("hello");
  });
});

// ─── pathDirName ─────────────────────────────────────────────────────────────

describe("pathDirName", () => {
  it("returns directory portion of unix path", () => {
    expect(pathDirName("/a/b/c.txt")).toBe("/a/b");
  });

  it("returns directory for relative path", () => {
    expect(pathDirName("a/b/c.txt")).toBe("a/b");
  });

  it("returns the path itself when no directory separator", () => {
    expect(pathDirName("file.txt")).toBe("file.txt");
  });

  it("handles Windows backslash paths", () => {
    expect(pathDirName("C:\\Users\\doc.md")).toBe("C:/Users");
  });

  it("handles root path", () => {
    // "/" -> normalizePath("") -> split("/") -> [""] -> slice(0,-1) -> [] -> join("") -> ""
    // "" is falsy, so returns original path "/"
    expect(pathDirName("/")).toBe("/");
  });

  it("handles single-level absolute path", () => {
    // "/" -> normalizePath("") -> split("/") -> [""] -> slice(0,-1) -> [] -> join("") -> ""
    // "" is falsy, so pathDirName returns original path
    expect(pathDirName("/file.txt")).toBe("/file.txt");
  });
});

// ─── pathExtName ─────────────────────────────────────────────────────────────

describe("pathExtName", () => {
  it("returns extension with dot", () => {
    expect(pathExtName("file.txt")).toBe(".txt");
    expect(pathExtName("archive.tar.gz")).toBe(".gz");
  });

  it("returns empty string for no extension", () => {
    expect(pathExtName("Makefile")).toBe("");
    expect(pathExtName("README")).toBe("");
  });

  it("returns empty string for dotfile (dot at index 0)", () => {
    // dotIndex must be > 0, so ".gitignore" -> dotIndex 0 -> ""
    expect(pathExtName(".gitignore")).toBe("");
    expect(pathExtName(".env")).toBe("");
  });

  it("extracts extension from full path", () => {
    expect(pathExtName("/a/b/file.tsx")).toBe(".tsx");
  });

  it("handles path with trailing slash", () => {
    // pathBaseName strips trailing slash, so "dir/" -> basename "dir" -> no ext
    expect(pathExtName("dir/")).toBe("");
  });

  it("handles Windows paths", () => {
    expect(pathExtName("C:\\a\\b\\file.txt")).toBe(".txt");
  });

  it("handles empty string", () => {
    expect(pathExtName("")).toBe("");
  });
});

// ─── isAbsoluteAssetPath ─────────────────────────────────────────────────────

describe("isAbsoluteAssetPath", () => {
  it("detects unix absolute path", () => {
    expect(isAbsoluteAssetPath("/a/b/c")).toBe(true);
  });

  it("detects Windows absolute path", () => {
    expect(isAbsoluteAssetPath("C:/Users/test")).toBe(true);
    expect(isAbsoluteAssetPath("D:/folder")).toBe(true);
  });

  it("detects Windows absolute path without trailing slash after drive", () => {
    // The regex is /^[A-Za-z]:\// — requires slash after colon
    expect(isAbsoluteAssetPath("C:")).toBe(false);
    expect(isAbsoluteAssetPath("C:\\")).toBe(false);
    expect(isAbsoluteAssetPath("C:/")).toBe(true);
  });

  it("rejects relative paths", () => {
    expect(isAbsoluteAssetPath("a/b/c")).toBe(false);
    expect(isAbsoluteAssetPath("./file")).toBe(false);
    expect(isAbsoluteAssetPath("../file")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isAbsoluteAssetPath("")).toBe(false);
  });
});

// ─── hasRenderableScheme ─────────────────────────────────────────────────────

describe("hasRenderableScheme", () => {
  it("detects http scheme", () => {
    expect(hasRenderableScheme("http://example.com")).toBe(true);
  });

  it("detects https scheme", () => {
    expect(hasRenderableScheme("https://example.com/img.png")).toBe(true);
  });

  it("detects data URI", () => {
    expect(hasRenderableScheme("data:image/png;base64,abc")).toBe(true);
  });

  it("detects blob URI", () => {
    expect(hasRenderableScheme("blob:http://localhost/abc")).toBe(true);
  });

  it("detects local-file scheme", () => {
    expect(hasRenderableScheme("local-file:///path/to/file")).toBe(true);
  });

  it("case insensitive matching", () => {
    expect(hasRenderableScheme("HTTP://example.com")).toBe(true);
    expect(hasRenderableScheme("HTTPS://example.com")).toBe(true);
    expect(hasRenderableScheme("DATA:text/plain,hello")).toBe(true);
    expect(hasRenderableScheme("BLOB:xxx")).toBe(true);
  });

  it("rejects file:// scheme", () => {
    expect(hasRenderableScheme("file:///path")).toBe(false);
  });

  it("rejects plain paths", () => {
    expect(hasRenderableScheme("/a/b/c")).toBe(false);
    expect(hasRenderableScheme("relative/path")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(hasRenderableScheme("")).toBe(false);
  });
});

// ─── safeDecodeUri ───────────────────────────────────────────────────────────

describe("safeDecodeUri", () => {
  it("decodes percent-encoded characters", () => {
    expect(safeDecodeUri("hello%20world")).toBe("hello world");
  });

  it("returns the original value on invalid encoding", () => {
    expect(safeDecodeUri("%E0%A4%A")).toBe("%E0%A4%A");
  });

  it("passes through plain strings unchanged", () => {
    expect(safeDecodeUri("plain")).toBe("plain");
  });

  it("handles empty string", () => {
    expect(safeDecodeUri("")).toBe("");
  });

  it("decodes unicode sequences", () => {
    expect(safeDecodeUri("%E4%B8%AD%E6%96%87")).toBe("中文");
  });
});

// ─── encodeLocalFilePath ─────────────────────────────────────────────────────

describe("encodeLocalFilePath", () => {
  it("encodes path segments", () => {
    expect(encodeLocalFilePath("/a/b/file name.txt")).toBe("/a/b/file%20name.txt");
  });

  it("handles spaces and special characters", () => {
    expect(encodeLocalFilePath("/my folder/a+b")).toBe("/my%20folder/a%2Bb");
  });

  it("normalizes backslashes before encoding", () => {
    expect(encodeLocalFilePath("C:\\Users\\test")).toBe("C%3A/Users/test");
  });

  it("preserves slashes", () => {
    expect(encodeLocalFilePath("/a/b/c")).toBe("/a/b/c");
  });

  it("handles empty string", () => {
    expect(encodeLocalFilePath("")).toBe("");
  });

  it("encodes unicode characters", () => {
    expect(encodeLocalFilePath("/folder/中文")).toBe("/folder/%E4%B8%AD%E6%96%87");
  });
});

// ─── localFileUrlForPath ─────────────────────────────────────────────────────

describe("localFileUrlForPath", () => {
  it("creates local-file URL for unix path", () => {
    expect(localFileUrlForPath("/a/b/c.txt")).toBe("local-file:///a/b/c.txt");
  });

  it("creates local-file URL for relative path (adds leading slash)", () => {
    expect(localFileUrlForPath("a/b/c.txt")).toBe("local-file:///a/b/c.txt");
  });

  it("encodes special characters in path", () => {
    expect(localFileUrlForPath("/my file.txt")).toBe("local-file:///my%20file.txt");
  });

  it("handles Windows absolute path", () => {
    const result = localFileUrlForPath("C:/Users/test");
    expect(result).toMatch(/^local-file:\/\//);
    expect(result).toContain("C%3A");
  });
});

// ─── joinAssetPath ───────────────────────────────────────────────────────────

describe("joinAssetPath", () => {
  it("joins folder and asset path", () => {
    expect(joinAssetPath("/a/b", "c/d.txt")).toBe("/a/b/c/d.txt");
  });

  it("strips leading ./ from asset path", () => {
    expect(joinAssetPath("/a/b", "./c/d.txt")).toBe("/a/b/c/d.txt");
  });

  it("strips leading / from asset path", () => {
    expect(joinAssetPath("/a/b", "/c/d.txt")).toBe("/a/b/c/d.txt");
  });

  it("normalizes backslashes", () => {
    // "\\a\\b" in JS is string \a\b -> normalizePath -> /a/b
    expect(joinAssetPath("\\a\\b", "c\\d.txt")).toBe("/a/b/c/d.txt");
  });

  it("handles empty asset path", () => {
    expect(joinAssetPath("/a/b", "")).toBe("/a/b/");
  });

  it("handles empty folder", () => {
    expect(joinAssetPath("", "file.txt")).toBe("/file.txt");
  });
});

// ─── pathContains ────────────────────────────────────────────────────────────

describe("pathContains", () => {
  it("returns true when path is inside folder", () => {
    expect(pathContains("/a/b", "/a/b/c.txt")).toBe(true);
  });

  it("returns true when path equals folder", () => {
    expect(pathContains("/a/b", "/a/b")).toBe(true);
  });

  it("returns false when path is not inside folder", () => {
    expect(pathContains("/a/b", "/a/c/file.txt")).toBe(false);
  });

  it("returns false for prefix match that is not a real subpath", () => {
    expect(pathContains("/a/b", "/a/bc/file.txt")).toBe(false);
  });

  it("handles trailing slashes in folder", () => {
    expect(pathContains("/a/b/", "/a/b/c.txt")).toBe(true);
  });

  it("handles backslashes", () => {
    expect(pathContains("\\a\\b", "\\a\\b\\c.txt")).toBe(true);
  });

  if (isWindowsPlatform) {
    it("case insensitive on Windows", () => {
      expect(pathContains("C:/Users", "c:/users/file.txt")).toBe(true);
    });
  } else {
    it("case sensitive on non-Windows", () => {
      expect(pathContains("/A/B", "/a/b/c.txt")).toBe(false);
    });
  }
});

// ─── relativePath ────────────────────────────────────────────────────────────

describe("relativePath", () => {
  it("returns relative path when path is inside folder", () => {
    expect(relativePath("/a/b", "/a/b/c/d.txt")).toBe("c/d.txt");
  });

  it("returns basename when path equals folder", () => {
    // pathContains returns true, slice gives "", || falls back to pathBaseName
    expect(relativePath("/a/b", "/a/b")).toBe("b");
  });

  it("returns basename when path is not inside folder", () => {
    expect(relativePath("/a/b", "/x/y/z.txt")).toBe("z.txt");
  });

  it("handles nested relative path", () => {
    expect(relativePath("/project", "/project/src/lib/file.ts")).toBe("src/lib/file.ts");
  });

  it("handles Windows-style paths", () => {
    expect(relativePath("C:\\a", "C:\\a\\b\\c.txt")).toBe("b/c.txt");
  });

  it("returns basename for empty folder", () => {
    // empty folder -> pathContains("", path) checks if path starts with ""
    // pathContains("", "/a/b") -> normalizedPath === normalizedFolder || starts with normalizedFolder+"/"
    // normalizedFolder is "" so "/a/b".startsWith("/") -> true
    // So it slices "/a/b".slice(0) = "/a/b", strips leading slashes = "a/b"
    expect(relativePath("", "/a/b")).toBe("a/b");
  });
});

// ─── platform constants ──────────────────────────────────────────────────────

describe("platform constants", () => {
  it("shortcutDisplayPlatform is mac or windows", () => {
    expect(["mac", "windows"]).toContain(shortcutDisplayPlatform);
  });

  it("isWindowsPlatform is consistent with shortcutDisplayPlatform", () => {
    expect(isWindowsPlatform).toBe(shortcutDisplayPlatform === "windows");
  });
});
