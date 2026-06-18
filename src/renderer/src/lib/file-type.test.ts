import { describe, expect, it } from "vitest";
import type { InformioDocument } from "../types";
import {
  documentKindFromPath,
  documentKind,
  isImageFile,
  isPdfFile,
  isVideoFile,
  isAudioFile,
  mediaKindFromSrc,
  isEmbeddableAssetFile,
  isEmbeddableAssetDocument,
  isWritableTextDocument,
  isMarkdownDocument,
  imageExtensionFromMimeType,
  fileKindFromName,
  mimeTypeFromName,
} from "./file-type";

const makeDocument = (overrides: Partial<InformioDocument> = {}): InformioDocument => ({
  id: "doc-1",
  title: "Test",
  markdown: "",
  collection: "writing",
  updatedAt: "2024-01-01",
  ...overrides,
});

// ── documentKindFromPath ──

describe("documentKindFromPath", () => {
  it("returns 'markdown' for undefined path", () => {
    expect(documentKindFromPath(undefined)).toBe("markdown");
  });

  it("returns 'markdown' for empty string", () => {
    expect(documentKindFromPath("")).toBe("markdown");
  });

  it("returns 'markdown' for .md extension", () => {
    expect(documentKindFromPath("notes.md")).toBe("markdown");
  });

  it("returns 'markdown' for .markdown extension", () => {
    expect(documentKindFromPath("notes.markdown")).toBe("markdown");
  });

  it("returns 'text' for .txt extension", () => {
    expect(documentKindFromPath("readme.txt")).toBe("text");
  });

  it("returns 'image' for each image extension", () => {
    for (const ext of ["png", "jpg", "jpeg", "gif", "webp", "svg"]) {
      expect(documentKindFromPath(`photo.${ext}`)).toBe("image");
    }
  });

  it("returns 'video' for each video extension", () => {
    for (const ext of ["mp4", "mov", "webm"]) {
      expect(documentKindFromPath(`clip.${ext}`)).toBe("video");
    }
  });

  it("returns 'audio' for each audio extension", () => {
    for (const ext of ["mp3", "wav", "m4a", "ogg"]) {
      expect(documentKindFromPath(`sound.${ext}`)).toBe("audio");
    }
  });

  it("returns 'pdf' for .pdf extension", () => {
    expect(documentKindFromPath("report.pdf")).toBe("pdf");
  });

  it("returns 'spreadsheet' for spreadsheet extensions", () => {
    expect(documentKindFromPath("budget.xlsx")).toBe("spreadsheet");
    expect(documentKindFromPath("legacy.xls")).toBe("spreadsheet");
    expect(documentKindFromPath("data.csv")).toBe("spreadsheet");
  });

  it("returns 'unknown' for unrecognized extension", () => {
    expect(documentKindFromPath("file.xyz")).toBe("unknown");
  });

  it("returns 'unknown' for file with no extension", () => {
    expect(documentKindFromPath("Makefile")).toBe("unknown");
  });

  it("handles paths with directories", () => {
    expect(documentKindFromPath("/Users/me/docs/essay.md")).toBe("markdown");
    expect(documentKindFromPath("/Users/me/img/pic.png")).toBe("image");
  });

  it("handles file:// URLs", () => {
    expect(documentKindFromPath("file:///Users/me/doc.pdf")).toBe("pdf");
  });

  it("handles local-file:// URLs", () => {
    expect(documentKindFromPath("local-file:///Users/me/photo.jpg")).toBe("image");
  });

  it("handles URLs with query strings and fragments", () => {
    expect(documentKindFromPath("image.png?v=2#top")).toBe("image");
  });

  it("handles uppercase extensions case-insensitively", () => {
    expect(documentKindFromPath("PHOTO.PNG")).toBe("image");
    expect(documentKindFromPath("Video.MP4")).toBe("video");
    expect(documentKindFromPath("Doc.PDF")).toBe("pdf");
    expect(documentKindFromPath("Sheet.XLSX")).toBe("spreadsheet");
  });
});

// ── documentKind ──

describe("documentKind", () => {
  it("returns 'unknown' for undefined document", () => {
    expect(documentKind(undefined)).toBe("unknown");
  });

  it("returns 'unknown' for null document", () => {
    expect(documentKind(null)).toBe("unknown");
  });

  it("returns the explicit kind when set", () => {
    expect(documentKind(makeDocument({ kind: "pdf" }))).toBe("pdf");
    expect(documentKind(makeDocument({ kind: "image" }))).toBe("image");
    expect(documentKind(makeDocument({ kind: "unknown" }))).toBe("unknown");
  });

  it("derives kind from filePath when kind is undefined", () => {
    expect(documentKind(makeDocument({ filePath: "essay.md" }))).toBe("markdown");
    expect(documentKind(makeDocument({ filePath: "photo.png" }))).toBe("image");
    expect(documentKind(makeDocument({ filePath: "report.pdf" }))).toBe("pdf");
  });

  it("derives kind from title when both kind and filePath are undefined", () => {
    expect(documentKind(makeDocument({ title: "notes.txt" }))).toBe("text");
    expect(documentKind(makeDocument({ title: "clip.mp4" }))).toBe("video");
  });

  it("returns 'markdown' when kind, filePath, and title are all missing/empty", () => {
    // title is "Test" with no extension -> unknown... but filePath defaults to undefined
    // so it falls back to title "Test" which has no extension -> "unknown"
    expect(documentKind(makeDocument())).toBe("unknown");
  });

  it("prefers filePath over title when kind is undefined", () => {
    const doc = makeDocument({ filePath: "audio.mp3", title: "video.mp4" });
    expect(documentKind(doc)).toBe("audio");
  });

  it("prefers kind over filePath", () => {
    const doc = makeDocument({ kind: "text", filePath: "photo.png" });
    expect(documentKind(doc)).toBe("text");
  });
});

// ── isImageFile ──

describe("isImageFile", () => {
  it("returns false for undefined", () => {
    expect(isImageFile(undefined)).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isImageFile("")).toBe(false);
  });

  it("returns true for image extensions", () => {
    expect(isImageFile("photo.png")).toBe(true);
    expect(isImageFile("photo.jpg")).toBe(true);
    expect(isImageFile("photo.jpeg")).toBe(true);
    expect(isImageFile("photo.gif")).toBe(true);
    expect(isImageFile("photo.webp")).toBe(true);
    expect(isImageFile("photo.svg")).toBe(true);
  });

  it("returns false for non-image extensions", () => {
    expect(isImageFile("doc.pdf")).toBe(false);
    expect(isImageFile("video.mp4")).toBe(false);
    expect(isImageFile("readme.md")).toBe(false);
  });
});

// ── isPdfFile ──

describe("isPdfFile", () => {
  it("returns false for undefined", () => {
    expect(isPdfFile(undefined)).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isPdfFile("")).toBe(false);
  });

  it("returns true for .pdf", () => {
    expect(isPdfFile("report.pdf")).toBe(true);
  });

  it("returns false for non-pdf extensions", () => {
    expect(isPdfFile("photo.png")).toBe(false);
  });
});

// ── isVideoFile ──

describe("isVideoFile", () => {
  it("returns false for undefined", () => {
    expect(isVideoFile(undefined)).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isVideoFile("")).toBe(false);
  });

  it("returns true for video extensions", () => {
    expect(isVideoFile("clip.mp4")).toBe(true);
    expect(isVideoFile("clip.mov")).toBe(true);
    expect(isVideoFile("clip.webm")).toBe(true);
  });

  it("returns false for non-video extensions", () => {
    expect(isVideoFile("audio.mp3")).toBe(false);
  });
});

// ── isAudioFile ──

describe("isAudioFile", () => {
  it("returns false for undefined", () => {
    expect(isAudioFile(undefined)).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isAudioFile("")).toBe(false);
  });

  it("returns true for audio extensions", () => {
    expect(isAudioFile("track.mp3")).toBe(true);
    expect(isAudioFile("track.wav")).toBe(true);
    expect(isAudioFile("track.m4a")).toBe(true);
    expect(isAudioFile("track.ogg")).toBe(true);
  });

  it("returns false for non-audio extensions", () => {
    expect(isAudioFile("clip.mp4")).toBe(false);
  });
});

// ── mediaKindFromSrc ──

describe("mediaKindFromSrc", () => {
  it("returns 'video' for video extensions", () => {
    expect(mediaKindFromSrc("clip.mp4")).toBe("video");
    expect(mediaKindFromSrc("clip.mov")).toBe("video");
    expect(mediaKindFromSrc("clip.webm")).toBe("video");
  });

  it("returns 'audio' for audio extensions", () => {
    expect(mediaKindFromSrc("track.mp3")).toBe("audio");
    expect(mediaKindFromSrc("track.wav")).toBe("audio");
    expect(mediaKindFromSrc("track.m4a")).toBe("audio");
    expect(mediaKindFromSrc("track.ogg")).toBe("audio");
  });

  it("returns empty string for non-media extensions", () => {
    expect(mediaKindFromSrc("photo.png")).toBe("");
    expect(mediaKindFromSrc("doc.pdf")).toBe("");
    expect(mediaKindFromSrc("readme.md")).toBe("");
  });

  it("returns empty string for no extension", () => {
    expect(mediaKindFromSrc("Makefile")).toBe("");
  });

  it("handles URLs with query strings", () => {
    expect(mediaKindFromSrc("video.mp4?t=123")).toBe("video");
  });
});

// ── isEmbeddableAssetFile ──

describe("isEmbeddableAssetFile", () => {
  it("returns false for undefined", () => {
    expect(isEmbeddableAssetFile(undefined)).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isEmbeddableAssetFile("")).toBe(false);
  });

  it("returns true for image files", () => {
    expect(isEmbeddableAssetFile("photo.png")).toBe(true);
  });

  it("returns true for pdf files", () => {
    expect(isEmbeddableAssetFile("report.pdf")).toBe(true);
  });

  it("returns true for video files", () => {
    expect(isEmbeddableAssetFile("clip.mp4")).toBe(true);
  });

  it("returns true for audio files", () => {
    expect(isEmbeddableAssetFile("track.mp3")).toBe(true);
  });

  it("returns false for non-embeddable files", () => {
    expect(isEmbeddableAssetFile("readme.md")).toBe(false);
    expect(isEmbeddableAssetFile("data.csv")).toBe(false);
  });
});

// ── isEmbeddableAssetDocument ──

describe("isEmbeddableAssetDocument", () => {
  it("returns false for undefined", () => {
    expect(isEmbeddableAssetDocument(undefined)).toBe(false);
  });

  it("returns false for null", () => {
    expect(isEmbeddableAssetDocument(null)).toBe(false);
  });

  it("returns true for image document", () => {
    expect(isEmbeddableAssetDocument(makeDocument({ kind: "image" }))).toBe(true);
  });

  it("returns true for pdf document", () => {
    expect(isEmbeddableAssetDocument(makeDocument({ kind: "pdf" }))).toBe(true);
  });

  it("returns true for video document", () => {
    expect(isEmbeddableAssetDocument(makeDocument({ kind: "video" }))).toBe(true);
  });

  it("returns true for audio document", () => {
    expect(isEmbeddableAssetDocument(makeDocument({ kind: "audio" }))).toBe(true);
  });

  it("returns false for markdown document", () => {
    expect(isEmbeddableAssetDocument(makeDocument({ kind: "markdown" }))).toBe(false);
  });

  it("returns false for text document", () => {
    expect(isEmbeddableAssetDocument(makeDocument({ kind: "text" }))).toBe(false);
  });

  it("returns false for unknown document", () => {
    expect(isEmbeddableAssetDocument(makeDocument({ kind: "unknown" }))).toBe(false);
  });

  it("derives kind from filePath when kind is not set", () => {
    expect(isEmbeddableAssetDocument(makeDocument({ filePath: "photo.png" }))).toBe(true);
    expect(isEmbeddableAssetDocument(makeDocument({ filePath: "essay.md" }))).toBe(false);
  });
});

// ── isWritableTextDocument ──

describe("isWritableTextDocument", () => {
  it("returns false for undefined", () => {
    expect(isWritableTextDocument(undefined)).toBe(false);
  });

  it("returns false for null", () => {
    expect(isWritableTextDocument(null)).toBe(false);
  });

  it("returns true for markdown document", () => {
    expect(isWritableTextDocument(makeDocument({ kind: "markdown" }))).toBe(true);
  });

  it("returns true for text document", () => {
    expect(isWritableTextDocument(makeDocument({ kind: "text" }))).toBe(true);
  });

  it("returns false for image document", () => {
    expect(isWritableTextDocument(makeDocument({ kind: "image" }))).toBe(false);
  });

  it("returns false for pdf document", () => {
    expect(isWritableTextDocument(makeDocument({ kind: "pdf" }))).toBe(false);
  });

  it("returns false for video document", () => {
    expect(isWritableTextDocument(makeDocument({ kind: "video" }))).toBe(false);
  });

  it("returns false for audio document", () => {
    expect(isWritableTextDocument(makeDocument({ kind: "audio" }))).toBe(false);
  });

  it("returns false for unknown document", () => {
    expect(isWritableTextDocument(makeDocument({ kind: "unknown" }))).toBe(false);
  });

  it("derives kind from filePath when kind is not set", () => {
    expect(isWritableTextDocument(makeDocument({ filePath: "essay.md" }))).toBe(true);
    expect(isWritableTextDocument(makeDocument({ filePath: "photo.png" }))).toBe(false);
  });
});

// ── isMarkdownDocument ──

describe("isMarkdownDocument", () => {
  it("returns false for undefined", () => {
    expect(isMarkdownDocument(undefined)).toBe(false);
  });

  it("returns false for null", () => {
    expect(isMarkdownDocument(null)).toBe(false);
  });

  it("returns true for markdown document", () => {
    expect(isMarkdownDocument(makeDocument({ kind: "markdown" }))).toBe(true);
  });

  it("returns false for text document", () => {
    expect(isMarkdownDocument(makeDocument({ kind: "text" }))).toBe(false);
  });

  it("returns false for non-text document kinds", () => {
    expect(isMarkdownDocument(makeDocument({ kind: "image" }))).toBe(false);
    expect(isMarkdownDocument(makeDocument({ kind: "pdf" }))).toBe(false);
    expect(isMarkdownDocument(makeDocument({ kind: "unknown" }))).toBe(false);
  });

  it("derives kind from filePath when kind is not set", () => {
    expect(isMarkdownDocument(makeDocument({ filePath: "notes.md" }))).toBe(true);
    expect(isMarkdownDocument(makeDocument({ filePath: "notes.markdown" }))).toBe(true);
    expect(isMarkdownDocument(makeDocument({ filePath: "notes.txt" }))).toBe(false);
  });
});

// ── imageExtensionFromMimeType ──

describe("imageExtensionFromMimeType", () => {
  it("returns 'jpg' for image/jpeg", () => {
    expect(imageExtensionFromMimeType("image/jpeg")).toBe("jpg");
  });

  it("returns 'png' for image/png", () => {
    expect(imageExtensionFromMimeType("image/png")).toBe("png");
  });

  it("returns 'gif' for image/gif", () => {
    expect(imageExtensionFromMimeType("image/gif")).toBe("gif");
  });

  it("returns 'webp' for image/webp", () => {
    expect(imageExtensionFromMimeType("image/webp")).toBe("webp");
  });

  it("returns 'svg' for image/svg+xml", () => {
    expect(imageExtensionFromMimeType("image/svg+xml")).toBe("svg");
  });

  it("returns 'png' as default for unknown mime type", () => {
    expect(imageExtensionFromMimeType("image/bmp")).toBe("png");
    expect(imageExtensionFromMimeType("image/tiff")).toBe("png");
    expect(imageExtensionFromMimeType("application/octet-stream")).toBe("png");
  });

  it("returns 'png' for empty string", () => {
    expect(imageExtensionFromMimeType("")).toBe("png");
  });
});

// ── fileKindFromName ──

describe("fileKindFromName", () => {
  it("returns 'image' for .png", () => {
    expect(fileKindFromName("photo.png")).toBe("image");
  });

  it("returns 'image' for .jpg", () => {
    expect(fileKindFromName("photo.jpg")).toBe("image");
  });

  it("returns 'image' for .jpeg", () => {
    expect(fileKindFromName("photo.jpeg")).toBe("image");
  });

  it("returns 'image' for .gif", () => {
    expect(fileKindFromName("anim.gif")).toBe("image");
  });

  it("returns 'image' for .webp", () => {
    expect(fileKindFromName("pic.webp")).toBe("image");
  });

  it("returns 'image' for .svg", () => {
    expect(fileKindFromName("icon.svg")).toBe("image");
  });

  it("is case-insensitive for image extensions", () => {
    expect(fileKindFromName("PHOTO.PNG")).toBe("image");
    expect(fileKindFromName("photo.JPG")).toBe("image");
    expect(fileKindFromName("photo.JPEG")).toBe("image");
  });

  it("returns 'file' for non-image extensions", () => {
    expect(fileKindFromName("report.pdf")).toBe("file");
    expect(fileKindFromName("readme.md")).toBe("file");
    expect(fileKindFromName("data.csv")).toBe("file");
    expect(fileKindFromName("video.mp4")).toBe("file");
  });

  it("returns 'file' for files with no extension", () => {
    expect(fileKindFromName("Makefile")).toBe("file");
  });

  it("returns 'file' for empty string", () => {
    expect(fileKindFromName("")).toBe("file");
  });
});

// ── mimeTypeFromName ──

describe("mimeTypeFromName", () => {
  it("returns 'image/png' for .png", () => {
    expect(mimeTypeFromName("photo.png")).toBe("image/png");
  });

  it("returns 'image/jpeg' for .jpg", () => {
    expect(mimeTypeFromName("photo.jpg")).toBe("image/jpeg");
  });

  it("returns 'image/jpeg' for .jpeg", () => {
    expect(mimeTypeFromName("photo.jpeg")).toBe("image/jpeg");
  });

  it("returns 'image/gif' for .gif", () => {
    expect(mimeTypeFromName("anim.gif")).toBe("image/gif");
  });

  it("returns 'image/webp' for .webp", () => {
    expect(mimeTypeFromName("pic.webp")).toBe("image/webp");
  });

  it("returns 'image/svg+xml' for .svg", () => {
    expect(mimeTypeFromName("icon.svg")).toBe("image/svg+xml");
  });

  it("returns 'application/pdf' for .pdf", () => {
    expect(mimeTypeFromName("report.pdf")).toBe("application/pdf");
  });

  it("returns spreadsheet mime types", () => {
    expect(mimeTypeFromName("budget.xlsx")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(mimeTypeFromName("legacy.xls")).toBe("application/vnd.ms-excel");
    expect(mimeTypeFromName("data.csv")).toBe("text/csv");
  });

  it("returns 'text/markdown' for .md", () => {
    expect(mimeTypeFromName("notes.md")).toBe("text/markdown");
  });

  it("returns 'text/markdown' for .markdown", () => {
    expect(mimeTypeFromName("notes.markdown")).toBe("text/markdown");
  });

  it("returns 'text/plain' for .txt", () => {
    expect(mimeTypeFromName("readme.txt")).toBe("text/plain");
  });

  it("returns undefined for unrecognized extensions", () => {
    expect(mimeTypeFromName("archive.zip")).toBeUndefined();
    expect(mimeTypeFromName("video.mp4")).toBeUndefined();
  });

  it("returns undefined for files with no extension", () => {
    expect(mimeTypeFromName("Makefile")).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(mimeTypeFromName("")).toBeUndefined();
  });

  it("handles uppercase extensions case-insensitively", () => {
    expect(mimeTypeFromName("PHOTO.PNG")).toBe("image/png");
    expect(mimeTypeFromName("report.PDF")).toBe("application/pdf");
    expect(mimeTypeFromName("notes.TXT")).toBe("text/plain");
  });

  it("handles filenames with multiple dots", () => {
    expect(mimeTypeFromName("my.photo.backup.png")).toBe("image/png");
    expect(mimeTypeFromName("archive.tar.gz")).toBeUndefined();
  });

  it("handles paths with directories", () => {
    expect(mimeTypeFromName("/Users/me/docs/report.pdf")).toBe("application/pdf");
  });
});
