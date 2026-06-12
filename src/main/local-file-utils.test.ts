import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  documentKindFromPath,
  isExternalOpenablePath,
  parseRangeHeader,
  escapeHtml,
  quoteCssFontFamily,
  exportFontStack,
  markdownToBasicHtml,
  generatedMarkdownForAssetPath,
  pdfMarkdown,
  normalizeAssetDocumentMarkdown,
  isWritableTextDocument,
  normalizeDocumentKind,
  withDocumentKind,
  localFileContentType,
  markdownPathFromDocumentPath,
  documentFolderForPath,
  loadAssetData
} from "./local-file-utils";

describe("documentKindFromPath", () => {
  it("returns markdown for .md", () => {
    expect(documentKindFromPath("file.md")).toBe("markdown");
  });

  it("returns text for .txt", () => {
    expect(documentKindFromPath("file.txt")).toBe("text");
  });

  it("returns image for image extensions", () => {
    expect(documentKindFromPath("photo.jpg")).toBe("image");
    expect(documentKindFromPath("icon.png")).toBe("image");
    expect(documentKindFromPath("anim.gif")).toBe("image");
  });

  it("returns video for video extensions", () => {
    expect(documentKindFromPath("clip.mp4")).toBe("video");
  });

  it("returns audio for audio extensions", () => {
    expect(documentKindFromPath("sound.mp3")).toBe("audio");
  });

  it("returns pdf for .pdf", () => {
    expect(documentKindFromPath("doc.pdf")).toBe("pdf");
  });

  it("returns unknown for unrecognized", () => {
    expect(documentKindFromPath("file.xyz")).toBe("unknown");
  });

  it("returns markdown for undefined path", () => {
    expect(documentKindFromPath(undefined)).toBe("markdown");
  });
});

describe("isExternalOpenablePath", () => {
  it("returns true for openable extensions", () => {
    expect(isExternalOpenablePath("file.md")).toBe(true);
    expect(isExternalOpenablePath("image.png")).toBe(true);
    expect(isExternalOpenablePath("doc.pdf")).toBe(true);
  });

  it("returns false for non-openable extensions", () => {
    expect(isExternalOpenablePath("file.exe")).toBe(false);
    expect(isExternalOpenablePath("data.json")).toBe(false);
  });
});

describe("parseRangeHeader", () => {
  it("returns null for no header", () => {
    expect(parseRangeHeader(null, 100)).toBeNull();
  });

  it("parses byte range", () => {
    expect(parseRangeHeader("bytes=0-49", 100)).toEqual({ start: 0, end: 49 });
  });

  it("parses suffix range", () => {
    expect(parseRangeHeader("bytes=-50", 100)).toEqual({ start: 50, end: 99 });
  });

  it("parses open-ended range", () => {
    expect(parseRangeHeader("bytes=50-", 100)).toEqual({ start: 50, end: 99 });
  });

  it("returns invalid for bad format", () => {
    expect(parseRangeHeader("invalid", 100)).toBe("invalid");
  });

  it("returns invalid for out-of-range", () => {
    expect(parseRangeHeader("bytes=200-300", 100)).toBe("invalid");
  });
});

describe("escapeHtml", () => {
  it("escapes HTML special characters", () => {
    expect(escapeHtml('<div class="test">a & b</div>')).toBe("&lt;div class=&quot;test&quot;&gt;a &amp; b&lt;/div&gt;");
  });
});

describe("quoteCssFontFamily", () => {
  it("quotes family name", () => {
    expect(quoteCssFontFamily("PingFang SC")).toBe('"PingFang SC"');
  });

  it("escapes backslashes and quotes", () => {
    expect(quoteCssFontFamily('a\\b"c')).toBe('"a\\\\b\\"c"');
  });
});

describe("exportFontStack", () => {
  it("builds font stack from appearance", () => {
    const stack = exportFontStack({ englishFontFamily: "Helvetica", chineseFontFamily: "PingFang SC" });
    expect(stack).toContain('"Helvetica"');
    expect(stack).toContain('"PingFang SC"');
    expect(stack).toContain("sans-serif");
  });

  it("deduplicates families", () => {
    const stack = exportFontStack({ englishFontFamily: "Arial", chineseFontFamily: "Arial" });
    const matches = stack.match(/"Arial"/g);
    expect(matches).toHaveLength(1);
  });
});

describe("markdownToBasicHtml", () => {
  it("generates valid HTML document", () => {
    const html = markdownToBasicHtml("# Hello", "sans-serif", "Test");
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("<title>Test</title>");
    expect(html).toContain("<h1>Hello</h1>");
  });

  it("converts paragraphs", () => {
    const html = markdownToBasicHtml("paragraph text", "sans-serif");
    expect(html).toContain("<p>paragraph text</p>");
  });

  it("escapes HTML in content", () => {
    const html = markdownToBasicHtml("<script>alert(1)</script>", "sans-serif");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("generatedMarkdownForAssetPath", () => {
  it("generates image markdown", () => {
    const md = generatedMarkdownForAssetPath("/project/photo.png", "/project/doc.md");
    expect(md).toContain("![");
    expect(md).toContain("photo.png");
  });

  it("generates video tag", () => {
    const md = generatedMarkdownForAssetPath("/project/clip.mp4", "/project/doc.md");
    expect(md).toContain("<video");
  });

  it("generates audio tag", () => {
    const md = generatedMarkdownForAssetPath("/project/sound.mp3", "/project/doc.md");
    expect(md).toContain("<audio");
  });

  it("generates link for PDF", () => {
    const md = generatedMarkdownForAssetPath("/project/doc.pdf", "/project/main.md");
    expect(md).toContain("[");
    expect(md).toContain("doc.pdf");
  });

  it("returns null for unknown extension", () => {
    expect(generatedMarkdownForAssetPath("/project/file.xyz")).toBeNull();
  });
});

describe("pdfMarkdown", () => {
  it("generates PDF link markdown", () => {
    const md = pdfMarkdown("/project/report.pdf", "/project/doc.md");
    expect(md).toContain("[report.pdf]");
  });
});

describe("normalizeAssetDocumentMarkdown", () => {
  const makeDoc = (overrides: Record<string, unknown>) => ({
    id: "test", title: "Test", markdown: "", collection: "writing" as const, updatedAt: new Date().toISOString(), ...overrides
  });

  it("returns unchanged for no filePath", () => {
    const doc = makeDoc({ filePath: undefined });
    expect(normalizeAssetDocumentMarkdown(doc as any)).toBe(doc);
  });

  it("returns unchanged for text document", () => {
    const doc = makeDoc({ filePath: "/a/file.txt", kind: "text" });
    const result = normalizeAssetDocumentMarkdown(doc as any);
    expect(result.kind).toBe("text");
  });

  it("generates image markdown", () => {
    const doc = makeDoc({ filePath: "/a/photo.png", markdown: "" });
    const result = normalizeAssetDocumentMarkdown(doc as any);
    expect(result.markdown).toContain("![");
  });

  it("generates video markdown", () => {
    const doc = makeDoc({ filePath: "/a/clip.mp4", markdown: "" });
    const result = normalizeAssetDocumentMarkdown(doc as any);
    expect(result.markdown).toContain("<video");
  });

  it("generates audio markdown", () => {
    const doc = makeDoc({ filePath: "/a/sound.mp3", markdown: "" });
    const result = normalizeAssetDocumentMarkdown(doc as any);
    expect(result.markdown).toContain("<audio");
  });

  it("generates pdf markdown", () => {
    const doc = makeDoc({ filePath: "/a/doc.pdf", markdown: "" });
    const result = normalizeAssetDocumentMarkdown(doc as any);
    expect(result.markdown).toContain("[doc.pdf]");
  });

  it("returns unchanged when markdown matches", () => {
    const doc = makeDoc({ filePath: "/a/photo.png", kind: "image", markdown: "![photo.png](photo.png)" });
    const result = normalizeAssetDocumentMarkdown(doc as any);
    expect(result.markdown).toBe("![photo.png](photo.png)");
  });
});

describe("isWritableTextDocument", () => {
  it("returns true for markdown", () => {
    expect(isWritableTextDocument({ kind: "markdown" } as any)).toBe(true);
  });
  it("returns true for text", () => {
    expect(isWritableTextDocument({ kind: "text" } as any)).toBe(true);
  });
  it("returns false for image", () => {
    expect(isWritableTextDocument({ kind: "image" } as any)).toBe(false);
  });
  it("returns false for pdf", () => {
    expect(isWritableTextDocument({ kind: "pdf" } as any)).toBe(false);
  });
});

describe("normalizeDocumentKind", () => {
  it("returns explicit kind", () => {
    expect(normalizeDocumentKind({ kind: "image" } as any)).toBe("image");
  });
  it("infers from filePath", () => {
    expect(normalizeDocumentKind({ filePath: "/a/photo.png" } as any)).toBe("image");
  });
  it("defaults to markdown", () => {
    expect(normalizeDocumentKind({} as any)).toBe("markdown");
  });
});

describe("withDocumentKind", () => {
  it("adds kind from filePath", () => {
    const result = withDocumentKind({ filePath: "/a/photo.png" } as any);
    expect(result.kind).toBe("image");
  });
  it("preserves existing kind", () => {
    const result = withDocumentKind({ kind: "video", filePath: "/a/photo.png" } as any);
    expect(result.kind).toBe("video");
  });
});

describe("localFileContentType", () => {
  it("returns correct MIME for known extensions", () => {
    expect(localFileContentType("file.png")).toBe("image/png");
    expect(localFileContentType("file.mp4")).toBe("video/mp4");
    expect(localFileContentType("file.md")).toBe("text/markdown; charset=utf-8");
  });
  it("returns default for unknown", () => {
    expect(localFileContentType("file.xyz")).toBe("application/octet-stream");
  });
});

describe("loadAssetData", () => {
  it("loads PDF data for the embedded PDF viewer", async () => {
    const folder = await mkdtemp(join(tmpdir(), "informio-pdf-asset-"));
    const filePath = join(folder, "sample.pdf");
    const bytes = Buffer.from("%PDF-1.7\n%%EOF\n");
    await writeFile(filePath, bytes);

    const result = await loadAssetData(filePath);

    expect(result.mimeType).toBe("application/pdf");
    expect(Buffer.from(result.data)).toEqual(bytes);
  });

  it("rejects unsupported asset types", async () => {
    const folder = await mkdtemp(join(tmpdir(), "informio-unsupported-asset-"));
    const filePath = join(folder, "data.json");
    await writeFile(filePath, "{}");

    await expect(loadAssetData(filePath)).rejects.toThrow("Unsupported asset type");
  });
});

describe("markdownPathFromDocumentPath", () => {
  it("returns relative path", () => {
    expect(markdownPathFromDocumentPath("/project/doc.md", "/project/assets/img.png")).toBe("assets/img.png");
  });
});

describe("documentFolderForPath", () => {
  it("returns directory", () => {
    expect(documentFolderForPath("/a/b/file.md")).toBe("/a/b");
  });
});
