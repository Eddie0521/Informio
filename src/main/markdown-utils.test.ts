import { describe, expect, it, vi, beforeEach } from "vitest";
import { existsSync } from "node:fs";
import {
  markdownTitle,
  normalizeLinkTitle,
  replaceWikiLinkTargets,
  parseHtmlAttr,
  decodeHtmlEntities,
  stripHtml,
  escapeHtmlAttr,
  markdownLink,
  markdownImage,
  cleanAttachmentName,
  markdownPathForFile,
  replaceLocalFileUrls,
  withUpdatedLocalFileUrls,
  ensureAttachmentReference,
  cleanMarkdownStorage,
  normalizeLocalFileCandidate,
  localFilePathCandidates
} from "./markdown-utils";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, existsSync: vi.fn().mockReturnValue(false) };
});

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    mkdir: vi.fn().mockResolvedValue(undefined),
    cp: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    stat: vi.fn().mockRejectedValue(new Error("ENOENT"))
  };
});

describe("markdownTitle", () => {
  it("strips .md extension", () => {
    expect(markdownTitle("readme.md")).toBe("readme");
  });

  it("strips .markdown extension", () => {
    expect(markdownTitle("doc.markdown")).toBe("doc");
  });

  it("strips .txt extension", () => {
    expect(markdownTitle("notes.txt")).toBe("notes");
  });

  it("returns unchanged for other extensions", () => {
    expect(markdownTitle("image.png")).toBe("image.png");
  });
});

describe("normalizeLinkTitle", () => {
  it("extracts last path segment without extension", () => {
    expect(normalizeLinkTitle("path/to/doc.md")).toBe("doc");
  });

  it("handles URL encoding", () => {
    expect(normalizeLinkTitle("%E4%BD%A0%E5%A5%BD")).toBeTruthy();
  });

  it("strips hash fragments", () => {
    expect(normalizeLinkTitle("doc.md#section")).toBe("doc");
  });

  it("returns lowercase", () => {
    expect(normalizeLinkTitle("MyDoc.md")).toBe("mydoc");
  });
});

describe("replaceWikiLinkTargets", () => {
  it("replaces matching wiki link target", () => {
    expect(replaceWikiLinkTargets("[[old]]", "old", "new")).toBe("[[new]]");
  });

  it("preserves alias", () => {
    expect(replaceWikiLinkTargets("[[old|alias]]", "old", "new")).toBe("[[new|alias]]");
  });

  it("does not replace non-matching links", () => {
    expect(replaceWikiLinkTargets("[[other]]", "old", "new")).toBe("[[other]]");
  });
});

describe("parseHtmlAttr", () => {
  it("parses double-quoted attribute", () => {
    expect(parseHtmlAttr('src="value.png"', "src")).toBe("value.png");
  });

  it("parses single-quoted attribute", () => {
    expect(parseHtmlAttr("src='value.png'", "src")).toBe("value.png");
  });

  it("parses unquoted attribute", () => {
    expect(parseHtmlAttr("src=value.png", "src")).toBe("value.png");
  });

  it("returns empty for missing attribute", () => {
    expect(parseHtmlAttr("other='val'", "src")).toBe("");
  });
});

describe("decodeHtmlEntities", () => {
  it("decodes common entities", () => {
    expect(decodeHtmlEntities("&amp; &lt; &gt; &quot; &#39;")).toBe("& < > \" '");
  });

  it("decodes numeric entities", () => {
    expect(decodeHtmlEntities("&#65;")).toBe("A");
  });

  it("decodes hex entities", () => {
    expect(decodeHtmlEntities("&#x41;")).toBe("A");
  });
});

describe("stripHtml", () => {
  it("removes tags and decodes entities", () => {
    expect(stripHtml("<b>hello &amp; world</b>")).toBe("hello & world");
  });

  it("trims whitespace", () => {
    expect(stripHtml("  <p>text</p>  ")).toBe("text");
  });
});

describe("escapeHtmlAttr", () => {
  it("escapes special characters", () => {
    expect(escapeHtmlAttr('a&b"c<d>e')).toBe("a&amp;b&quot;c&lt;d&gt;e");
  });
});

describe("markdownLink", () => {
  it("creates markdown link", () => {
    expect(markdownLink("click", "https://example.com")).toBe("[click](https://example.com)");
  });

  it("uses filename as fallback label", () => {
    expect(markdownLink("", "/path/to/file.md")).toBe("[file.md](/path/to/file.md)");
  });

  it("sanitizes label", () => {
    expect(markdownLink("text\nwith\nnewlines", "url")).toBe("[text with newlines](url)");
  });
});

describe("markdownImage", () => {
  it("creates markdown image", () => {
    expect(markdownImage("alt text", "img.png")).toBe("![alt text](img.png)");
  });
});

describe("cleanAttachmentName", () => {
  it("extracts base name and extension", () => {
    expect(cleanAttachmentName("/path/to/my file.png")).toEqual({ baseName: "my_file", extension: ".png" });
  });

  it("handles no extension", () => {
    const result = cleanAttachmentName("/path/to/file");
    expect(result.extension).toBe(".bin");
  });

  it("sanitizes special characters", () => {
    expect(cleanAttachmentName("/path/a:b*c.png").baseName).toBe("a-b-c");
  });
});

describe("markdownPathForFile", () => {
  it("returns relative path", () => {
    const result = markdownPathForFile("/project", "/project/assets/img.png");
    expect(result).toBe("assets/img.png");
  });

  it("handles same directory", () => {
    const result = markdownPathForFile("/project", "/project/file.md");
    expect(result).toBe("file.md");
  });
});

describe("cleanAttachmentName edge cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("collapses consecutive underscores", () => {
    expect(cleanAttachmentName("/path/a___b.png").baseName).toBe("a_b");
  });

  it("trims leading and trailing underscores", () => {
    expect(cleanAttachmentName("/path/__test__.png").baseName).toBe("test");
  });

  it("replaces whitespace with underscores", () => {
    expect(cleanAttachmentName("/path/my  spaced   file.png").baseName).toBe("my_spaced_file");
  });

  it("falls back to attachment timestamp for empty sanitized name", () => {
    // "___" -> collapse to "_" -> strip leading/trailing underscores -> "" -> fallback
    const result = cleanAttachmentName("/path/___");
    expect(result.baseName).toMatch(/^attachment-\d+$/);
    expect(result.extension).toBe(".bin");
  });

  it("sanitizes angle brackets and pipe", () => {
    expect(cleanAttachmentName("/path/a<b|c>d.png").baseName).toBe("a-b-c-d");
  });
});

describe("normalizeLocalFileCandidate", () => {
  it("normalizes /users/ prefix to /Users/", () => {
    expect(normalizeLocalFileCandidate("/users/john/file.txt")).toBe("/Users/john/file.txt");
  });

  it("leaves /Users/ prefix unchanged", () => {
    expect(normalizeLocalFileCandidate("/Users/john/file.txt")).toBe("/Users/john/file.txt");
  });

  it("leaves non-user paths unchanged", () => {
    expect(normalizeLocalFileCandidate("/tmp/file.txt")).toBe("/tmp/file.txt");
  });
});

describe("localFilePathCandidates", () => {
  it("parses local-file:// URL into path candidates", () => {
    const candidates = localFilePathCandidates("local-file:///Users/test/file.png");
    expect(candidates.length).toBeGreaterThanOrEqual(1);
    expect(candidates.some((c) => c.includes("file.png"))).toBe(true);
  });

  it("handles URL-encoded characters", () => {
    const candidates = localFilePathCandidates("local-file:///Users/test/my%20file.png");
    expect(candidates.some((c) => c.includes("my file.png") || c.includes("my%20file.png"))).toBe(true);
  });

  it("handles malformed URL by slicing prefix", () => {
    // A string that starts with local-file:// but isn't a valid URL
    const candidates = localFilePathCandidates("local-file://not a valid url");
    expect(candidates.length).toBeGreaterThanOrEqual(1);
  });

  it("deduplicates candidates", () => {
    const candidates = localFilePathCandidates("local-file:///tmp/file.txt");
    const unique = new Set(candidates);
    expect(candidates.length).toBe(unique.size);
  });
});

describe("replaceLocalFileUrls", () => {
  it("replaces local-file URL when resolver returns a new path", () => {
    const markdown = "See [file](local-file:///old/path/file.png)";
    const result = replaceLocalFileUrls(markdown, "/project", (path) => {
      if (path.includes("file.png")) return "/project/assets/file.png";
      return null;
    });
    expect(result).not.toContain("local-file://");
    expect(result).toContain("assets/file.png");
  });

  it("keeps URL unchanged when resolver returns null", () => {
    const markdown = "See [file](local-file:///old/path/file.png)";
    const result = replaceLocalFileUrls(markdown, "/project", () => null);
    expect(result).toBe(markdown);
  });

  it("keeps URL unchanged when resolved path is the same as candidate", () => {
    const markdown = "See [file](local-file:///old/path/file.png)";
    const result = replaceLocalFileUrls(markdown, "/project", (path) => path);
    expect(result).toBe(markdown);
  });

  it("uses basename when documentFolder is undefined", () => {
    const markdown = "See [file](local-file:///some/path/file.png)";
    const result = replaceLocalFileUrls(markdown, undefined, (path) => "/new/dir/file.png");
    expect(result).toContain("file.png");
    expect(result).not.toContain("local-file://");
  });

  it("handles markdown without any local-file URLs", () => {
    const markdown = "No URLs here.";
    const result = replaceLocalFileUrls(markdown, "/project", () => "/new/path");
    expect(result).toBe(markdown);
  });

  it("handles multiple local-file URLs in the same text", () => {
    const markdown = "![a](local-file:///path/a.png) and ![b](local-file:///path/b.png)";
    const result = replaceLocalFileUrls(markdown, "/project", () => "/project/assets/img.png");
    expect(result.match(/local-file:\/\//g)).toBeNull();
  });
});

describe("withUpdatedLocalFileUrls", () => {
  it("returns same document when no URLs match", () => {
    const doc = { id: "1", title: "Test", markdown: "hello", collection: "writing" as const, updatedAt: "2024-01-01" };
    const result = withUpdatedLocalFileUrls(doc, () => null);
    expect(result).toBe(doc);
  });

  it("returns updated document when URLs are replaced", () => {
    const doc = {
      id: "1",
      title: "Test",
      markdown: "![img](local-file:///old/img.png)",
      collection: "writing" as const,
      updatedAt: "2024-01-01",
      filePath: "/project/doc.md"
    };
    const result = withUpdatedLocalFileUrls(doc, (path) => {
      if (path.includes("img.png")) return "/project/assets/img.png";
      return null;
    });
    expect(result).not.toBe(doc);
    expect(result.markdown).toContain("assets/img.png");
    expect(result.updatedAt).not.toBe("2024-01-01");
  });

  it("uses undefined documentFolder when filePath is missing", () => {
    const doc = {
      id: "1",
      title: "Test",
      markdown: "![img](local-file:///old/img.png)",
      collection: "writing" as const,
      updatedAt: "2024-01-01"
    };
    const result = withUpdatedLocalFileUrls(doc, () => "/new/img.png");
    expect(result.markdown).toContain("img.png");
  });
});

describe("ensureAttachmentReference", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(existsSync).mockReturnValue(false);
  });

  it("returns encoded fallback for empty source", async () => {
    const result = await ensureAttachmentReference("/project", "", "MyFile");
    expect(result).toBe("MyFile");
  });

  it("returns source unchanged when not a local-file URL", async () => {
    const result = await ensureAttachmentReference("/project", "https://example.com/img.png");
    expect(result).toBe("https://example.com/img.png");
  });

  it("returns encoded basename when no documentFolder", async () => {
    const result = await ensureAttachmentReference(undefined, "local-file:///path/to/photo.jpg");
    expect(result).toBe("photo.jpg");
  });

  it("returns encoded basename when file does not exist", async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const result = await ensureAttachmentReference("/project", "local-file:///nonexistent/file.png");
    expect(result).toBe("file.png");
  });

  it("copies file to attachments when file exists", async () => {
    vi.mocked(existsSync).mockImplementation((p) => {
      return typeof p === "string" && p.includes("photo");
    });
    const result = await ensureAttachmentReference("/project", "local-file:///Users/test/photo.jpg");
    // Should return a markdown path relative to documentFolder
    expect(result).toContain("attachments");
    expect(result).toContain("photo");
  });
});

describe("cleanMarkdownStorage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(existsSync).mockReturnValue(false);
  });

  it("strips data-text-color spans", async () => {
    const input = '<span data-text-color="red">hello</span>';
    const result = await cleanMarkdownStorage(input);
    expect(result).toBe("hello");
  });

  it("strips style color spans", async () => {
    const input = '<span style="color: red">hello</span>';
    const result = await cleanMarkdownStorage(input);
    expect(result).toBe("hello");
  });

  it("decodes entities inside stripped spans", async () => {
    const input = '<span data-text-color="blue">&amp; &lt;test&gt;</span>';
    const result = await cleanMarkdownStorage(input);
    expect(result).toBe("& <test>");
  });

  it("converts iframe pdf to markdown link", async () => {
    const input = '<iframe data-type="pdf" src="local-file:///path/doc.pdf" title="My PDF"></iframe>';
    const result = await cleanMarkdownStorage(input);
    expect(result).toContain("[My PDF]");
    expect(result).toContain("doc.pdf");
    expect(result).not.toContain("<iframe");
  });

  it("keeps non-pdf iframe unchanged", async () => {
    const input = '<iframe src="https://example.com/embed"></iframe>';
    const result = await cleanMarkdownStorage(input);
    expect(result).toBe(input);
  });

  it("converts video tag to simplified video element", async () => {
    const input = '<video src="local-file:///path/clip.mp4" title="Clip"></video>';
    const result = await cleanMarkdownStorage(input);
    expect(result).toContain("<video");
    expect(result).toContain("controls");
    expect(result).toContain("clip.mp4");
  });

  it("converts audio tag to simplified audio element", async () => {
    const input = '<audio src="local-file:///path/song.mp3" aria-label="Song"></audio>';
    const result = await cleanMarkdownStorage(input);
    expect(result).toContain("<audio");
    expect(result).toContain("controls");
  });

  it("converts img tag to markdown image", async () => {
    const input = '<img src="local-file:///path/photo.png" alt="Photo" />';
    const result = await cleanMarkdownStorage(input);
    expect(result).toContain("![Photo]");
    expect(result).toContain("photo.png");
    expect(result).not.toContain("<img");
  });

  it("converts callout aside to blockquote", async () => {
    const input = '<aside data-type="callout-block"><strong>Warning</strong><p>Be careful</p></aside>';
    const result = await cleanMarkdownStorage(input);
    expect(result).toContain("> [!WARNING]");
    expect(result).toContain("> Be careful");
  });

  it("converts footnote section to footnote syntax", async () => {
    const input = '<section data-type="footnote-block"><sup>1</sup><span>Footnote text</span></section>';
    const result = await cleanMarkdownStorage(input);
    expect(result).toBe("[^1]: Footnote text");
  });

  it("converts details/summary to callout", async () => {
    const input = "<details><summary>Click to expand</summary>\nMore info here\n</details>";
    const result = await cleanMarkdownStorage(input);
    expect(result).toContain("> [!note]- Click to expand");
    expect(result).toContain("> More info here");
  });

  it("handles markdown without any HTML to clean", async () => {
    const input = "Just plain **markdown** text.";
    const result = await cleanMarkdownStorage(input);
    expect(result).toBe(input);
  });
});
