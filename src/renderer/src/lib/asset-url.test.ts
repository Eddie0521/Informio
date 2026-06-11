import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  assetPathPartFromSrc,
  assetExtensionFromSrc,
  resolveMarkdownAssetSrc,
  resolveMarkdownAssetPath,
  loadLocalAssetObjectUrl
} from "./asset-url";

// ─── assetPathPartFromSrc ────────────────────────────────────────────────────

describe("assetPathPartFromSrc", () => {
  it("returns empty string for empty input", () => {
    expect(assetPathPartFromSrc("")).toBe("");
  });

  it("returns empty string for whitespace-only input", () => {
    expect(assetPathPartFromSrc("   ")).toBe("");
  });

  it("trims whitespace", () => {
    expect(assetPathPartFromSrc("  /a/b.txt  ")).toBe("/a/b.txt");
  });

  describe("local-file:// URLs", () => {
    it("extracts unix path from local-file URL", () => {
      expect(assetPathPartFromSrc("local-file:///a/b/c.txt")).toBe("/a/b/c.txt");
    });

    it("extracts Windows drive path from local-file URL", () => {
      // "local-file://C:/Users/file.txt" -> host="C:", pathname="/Users/file.txt"
      // host matches /^[A-Za-z]:?$/ so returns "C:/Users/file.txt"
      expect(assetPathPartFromSrc("local-file://C:/Users/file.txt")).toBe("C:/Users/file.txt");
    });

    it("extracts Windows drive path with no trailing slash", () => {
      expect(assetPathPartFromSrc("local-file://C:/path")).toBe("C:/path");
    });

    it("decodes percent-encoded characters in local-file URL", () => {
      expect(assetPathPartFromSrc("local-file:///my%20file.txt")).toBe("/my file.txt");
    });

    it("handles local-file URL with no host", () => {
      // "local-file:///path" -> host="", pathname="/path"
      // host is falsy so returns pathname
      expect(assetPathPartFromSrc("local-file:///some/path")).toBe("/some/path");
    });
  });

  describe("file:// URLs", () => {
    it("extracts unix path from file:// URL", () => {
      expect(assetPathPartFromSrc("file:///a/b/c.txt")).toBe("/a/b/c.txt");
    });

    it("extracts Windows drive path from file:// URL", () => {
      // URL parsing of file://D:/folder/file.txt gives host="D:" pathname="/folder/file.txt"
      // Code takes the 'host is truthy but not drive-letter' branch -> "/D:/folder/file.txt"
      expect(assetPathPartFromSrc("file://D:/folder/file.txt")).toBe("/D:/folder/file.txt");
    });
  });

  describe("http/https URLs", () => {
    it("extracts pathname from http URL", () => {
      expect(assetPathPartFromSrc("http://example.com/path/to/image.png")).toBe("/path/to/image.png");
    });

    it("extracts pathname from https URL", () => {
      expect(assetPathPartFromSrc("https://cdn.example.com/assets/style.css")).toBe("/assets/style.css");
    });

    it("decodes percent-encoded characters in http URL pathname", () => {
      expect(assetPathPartFromSrc("http://example.com/my%20file.png")).toBe("/my file.png");
    });

    it("returns / for bare domain", () => {
      expect(assetPathPartFromSrc("https://example.com")).toBe("/");
    });
  });

  describe("non-URL paths (fallback parsing)", () => {
    it("returns plain relative path unchanged", () => {
      expect(assetPathPartFromSrc("images/photo.jpg")).toBe("images/photo.jpg");
    });

    it("strips query string from plain path", () => {
      expect(assetPathPartFromSrc("image.png?v=123")).toBe("image.png");
    });

    it("strips fragment from plain path", () => {
      expect(assetPathPartFromSrc("image.png#section")).toBe("image.png");
    });

    it("strips query and fragment from plain path", () => {
      expect(assetPathPartFromSrc("image.png?v=1#top")).toBe("image.png");
    });

    it("decodes percent-encoded plain path", () => {
      expect(assetPathPartFromSrc("my%20image.png")).toBe("my image.png");
    });

    it("handles path with multiple query params", () => {
      expect(assetPathPartFromSrc("file.txt?a=1&b=2")).toBe("file.txt");
    });
  });
});

// ─── assetExtensionFromSrc ───────────────────────────────────────────────────

describe("assetExtensionFromSrc", () => {
  it("returns extension without dot", () => {
    expect(assetExtensionFromSrc("image.png")).toBe("png");
  });

  it("lowercases extension", () => {
    expect(assetExtensionFromSrc("file.JPEG")).toBe("jpeg");
  });

  it("returns extension from URL", () => {
    expect(assetExtensionFromSrc("https://example.com/style.CSS")).toBe("css");
  });

  it("returns extension from local-file URL", () => {
    expect(assetExtensionFromSrc("local-file:///a/b/file.txt")).toBe("txt");
  });

  it("returns empty string for no extension", () => {
    expect(assetExtensionFromSrc("Makefile")).toBe("");
  });

  it("returns empty string for empty input", () => {
    expect(assetExtensionFromSrc("")).toBe("");
  });

  it("handles query string (stripped by assetPathPartFromSrc)", () => {
    expect(assetExtensionFromSrc("image.png?v=123")).toBe("png");
  });

  it("handles dotfile (dot at position 0, returns empty)", () => {
    expect(assetExtensionFromSrc(".gitignore")).toBe("");
  });
});

// ─── resolveMarkdownAssetSrc ─────────────────────────────────────────────────

describe("resolveMarkdownAssetSrc", () => {
  it("returns empty string for empty input", () => {
    expect(resolveMarkdownAssetSrc("")).toBe("");
  });

  it("returns whitespace-only after trim", () => {
    expect(resolveMarkdownAssetSrc("   ")).toBe("");
  });

  describe("renderable schemes (passed through)", () => {
    it("passes through https URL", () => {
      expect(resolveMarkdownAssetSrc("https://example.com/img.png")).toBe("https://example.com/img.png");
    });

    it("passes through http URL", () => {
      expect(resolveMarkdownAssetSrc("http://example.com/img.png")).toBe("http://example.com/img.png");
    });

    it("passes through data URI", () => {
      const dataUri = "data:image/png;base64,abc";
      expect(resolveMarkdownAssetSrc(dataUri)).toBe(dataUri);
    });

    it("passes through blob URI", () => {
      expect(resolveMarkdownAssetSrc("blob:http://localhost/abc")).toBe("blob:http://localhost/abc");
    });

    it("passes through local-file URI", () => {
      expect(resolveMarkdownAssetSrc("local-file:///a/b.png")).toBe("local-file:///a/b.png");
    });
  });

  describe("file:// conversion", () => {
    it("converts file:// to local-file://", () => {
      expect(resolveMarkdownAssetSrc("file:///a/b/c.png")).toBe("local-file:///a/b/c.png");
    });

    it("converts case-insensitive FILE://", () => {
      expect(resolveMarkdownAssetSrc("FILE:///a/b.png")).toBe("local-file:///a/b.png");
    });
  });

  describe("absolute path without basePath", () => {
    it("converts unix absolute path to local-file URL", () => {
      expect(resolveMarkdownAssetSrc("/a/b/c.png")).toBe("local-file:///a/b/c.png");
    });

    it("converts Windows absolute path to local-file URL", () => {
      const result = resolveMarkdownAssetSrc("C:/Users/img.png");
      expect(result).toMatch(/^local-file:\/\//);
      expect(result).toContain("C%3A");
    });
  });

  describe("relative path with basePath (file basePath)", () => {
    it("resolves relative to basePath directory", () => {
      const result = resolveMarkdownAssetSrc("images/photo.jpg", "/project/docs/readme.md");
      expect(result).toBe("local-file:///project/docs/images/photo.jpg");
    });

    it("resolves with query suffix preserved", () => {
      const result = resolveMarkdownAssetSrc("image.png?v=2", "/project/readme.md");
      expect(result).toBe("local-file:///project/image.png?v=2");
    });

    it("resolves with fragment suffix preserved", () => {
      const result = resolveMarkdownAssetSrc("image.png#section", "/project/readme.md");
      expect(result).toBe("local-file:///project/image.png#section");
    });

    it("resolves with both query and fragment", () => {
      const result = resolveMarkdownAssetSrc("img.png?v=1#top", "/project/readme.md");
      expect(result).toBe("local-file:///project/img.png?v=1#top");
    });
  });

  describe("relative path with basePath (directory basePath)", () => {
    it("uses basePath as-is when it has no extension", () => {
      const result = resolveMarkdownAssetSrc("photo.jpg", "/project/assets");
      expect(result).toBe("local-file:///project/assets/photo.jpg");
    });
  });

  describe("relative path without basePath", () => {
    it("returns original src when no basePath and not absolute", () => {
      expect(resolveMarkdownAssetSrc("images/photo.jpg")).toBe("images/photo.jpg");
    });

    it("returns original src for empty basePath", () => {
      expect(resolveMarkdownAssetSrc("images/photo.jpg", "")).toBe("images/photo.jpg");
    });
  });

  describe("percent-encoded paths", () => {
    it("decodes before resolving", () => {
      const result = resolveMarkdownAssetSrc("my%20file.png", "/project/readme.md");
      expect(result).toBe("local-file:///project/my%20file.png");
    });
  });
});

// ─── resolveMarkdownAssetPath ────────────────────────────────────────────────

describe("resolveMarkdownAssetPath", () => {
  it("returns empty string for empty input", () => {
    expect(resolveMarkdownAssetPath("")).toBe("");
  });

  it("returns empty string for whitespace-only", () => {
    expect(resolveMarkdownAssetPath("   ")).toBe("");
  });

  describe("remote schemes return empty", () => {
    it("returns empty for https", () => {
      expect(resolveMarkdownAssetPath("https://example.com/img.png")).toBe("");
    });

    it("returns empty for http", () => {
      expect(resolveMarkdownAssetPath("http://example.com/img.png")).toBe("");
    });

    it("returns empty for data URI", () => {
      expect(resolveMarkdownAssetPath("data:image/png;base64,abc")).toBe("");
    });

    it("returns empty for blob URI", () => {
      expect(resolveMarkdownAssetPath("blob:http://localhost/abc")).toBe("");
    });
  });

  describe("local-file and file URLs", () => {
    it("extracts path from local-file URL", () => {
      expect(resolveMarkdownAssetPath("local-file:///a/b/c.png")).toBe("/a/b/c.png");
    });

    it("extracts path from file URL", () => {
      expect(resolveMarkdownAssetPath("file:///a/b/c.png")).toBe("/a/b/c.png");
    });

    it("extracts Windows path from local-file URL", () => {
      expect(resolveMarkdownAssetPath("local-file://C:/Users/img.png")).toBe("C:/Users/img.png");
    });
  });

  describe("absolute paths", () => {
    it("returns unix absolute path as-is", () => {
      expect(resolveMarkdownAssetPath("/a/b/c.png")).toBe("/a/b/c.png");
    });

    it("returns Windows absolute path as-is", () => {
      expect(resolveMarkdownAssetPath("C:/Users/img.png")).toBe("C:/Users/img.png");
    });
  });

  describe("relative path with basePath (file)", () => {
    it("resolves relative to basePath directory", () => {
      // basePath "/project/readme.md" has extension, so baseFolder = pathDirName = "/project"
      expect(resolveMarkdownAssetPath("images/photo.jpg", "/project/readme.md")).toBe(
        "/project/images/photo.jpg"
      );
    });
  });

  describe("relative path with basePath (directory)", () => {
    it("resolves relative to directory basePath", () => {
      expect(resolveMarkdownAssetPath("photo.jpg", "/project/assets")).toBe("/project/assets/photo.jpg");
    });
  });

  describe("relative path without basePath", () => {
    it("returns empty string for relative path with no basePath", () => {
      expect(resolveMarkdownAssetPath("images/photo.jpg")).toBe("");
    });

    it("returns empty string for relative path with empty basePath", () => {
      expect(resolveMarkdownAssetPath("images/photo.jpg", "")).toBe("");
    });
  });

  describe("percent-encoded paths", () => {
    it("decodes percent-encoded path", () => {
      expect(resolveMarkdownAssetPath("/my%20file.png")).toBe("/my file.png");
    });
  });

  describe("query and fragment stripping", () => {
    it("strips query string from path", () => {
      expect(resolveMarkdownAssetPath("/a/b.png?v=1")).toBe("/a/b.png");
    });

    it("strips fragment from path", () => {
      expect(resolveMarkdownAssetPath("/a/b.png#sec")).toBe("/a/b.png");
    });
  });
});

// ─── loadLocalAssetObjectUrl ─────────────────────────────────────────────────

// loadLocalAssetObjectUrl requires browser APIs (window.informio, URL.createObjectURL)
// These tests run in Node.js where window is not available by default.
describe("loadLocalAssetObjectUrl", () => {
  it.skip("creates object URL from loaded asset", () => {});
  it.skip("passes Blob with correct data and mimeType", () => {});
});
