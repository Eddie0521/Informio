import { readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname } from "node:path";
import type { BrowserWindow } from "electron";
import type { AssetDataResult, InformioDocument, SaveSpreadsheetResult, SpreadsheetDiskFingerprint } from "../shared/types.js";
import {
  markdownLink,
  markdownImage,
  markdownPathForFile,
  escapeHtmlAttr,
  localFilePathCandidates,
  normalizeLocalFileCandidate
} from "./markdown-utils.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".webm"]);
const AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".m4a", ".ogg"]);
const PDF_EXTENSIONS = new Set([".pdf"]);
const SPREADSHEET_EXTENSIONS = new Set([".xlsx", ".xls", ".csv"]);
const OPENABLE_EXTENSIONS = new Set([".md", ".markdown", ".txt", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".mp4", ".mov", ".webm", ".mp3", ".wav", ".m4a", ".ogg", ".pdf", ".xlsx", ".xls", ".csv"]);

const LOCAL_FILE_CONTENT_TYPES = new Map([
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".gif", "image/gif"],
  [".webp", "image/webp"],
  [".svg", "image/svg+xml"],
  [".mp4", "video/mp4"],
  [".mov", "video/quicktime"],
  [".webm", "video/webm"],
  [".mp3", "audio/mpeg"],
  [".wav", "audio/wav"],
  [".m4a", "audio/mp4"],
  [".ogg", "audio/ogg"],
  [".pdf", "application/pdf"],
  [".xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  [".xls", "application/vnd.ms-excel"],
  [".csv", "text/csv"],
  [".md", "text/markdown; charset=utf-8"],
  [".markdown", "text/markdown; charset=utf-8"],
  [".txt", "text/plain; charset=utf-8"]
]);

// ---------------------------------------------------------------------------
// Document kind helpers
// ---------------------------------------------------------------------------

export type InformioDocumentKind = "markdown" | "text" | "image" | "video" | "audio" | "pdf" | "spreadsheet" | "unknown";

export const documentKindFromPath = (path?: string): InformioDocumentKind => {
  if (!path) return "markdown";
  const ext = extname(path).toLowerCase();
  if (ext === ".md" || ext === ".markdown") return "markdown";
  if (ext === ".txt") return "text";
  if (IMAGE_EXTENSIONS.has(ext)) return "image";
  if (VIDEO_EXTENSIONS.has(ext)) return "video";
  if (AUDIO_EXTENSIONS.has(ext)) return "audio";
  if (PDF_EXTENSIONS.has(ext)) return "pdf";
  if (SPREADSHEET_EXTENSIONS.has(ext)) return "spreadsheet";
  return "unknown";
};

export const isExternalOpenablePath = (path: string) => OPENABLE_EXTENSIONS.has(extname(path).toLowerCase());

export const isWritableTextDocument = (document: InformioDocument) => {
  const kind = document.kind ?? documentKindFromPath(document.filePath);
  return kind === "markdown" || kind === "text";
};

export const normalizeDocumentKind = (document: InformioDocument): InformioDocumentKind =>
  document.kind ?? documentKindFromPath(document.filePath);

export const withDocumentKind = <T extends InformioDocument>(document: T): T => ({
  ...document,
  kind: document.kind ?? documentKindFromPath(document.filePath)
});

// ---------------------------------------------------------------------------
// Content type and local file helpers
// ---------------------------------------------------------------------------

export const localFileContentType = (path: string) => LOCAL_FILE_CONTENT_TYPES.get(extname(path).toLowerCase()) ?? "application/octet-stream";

export const parseRangeHeader = (rangeHeader: string | null, fileSize: number) => {
  if (!rangeHeader) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match) return "invalid" as const;
  const [, rawStart, rawEnd] = match;
  if (!rawStart && !rawEnd) return "invalid" as const;
  if (!rawStart) {
    const suffixLength = Number(rawEnd);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return "invalid" as const;
    return { start: Math.max(fileSize - suffixLength, 0), end: fileSize - 1 };
  }
  const start = Number(rawStart);
  const end = rawEnd ? Number(rawEnd) : fileSize - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= fileSize) {
    return "invalid" as const;
  }
  return { start, end: Math.min(end, fileSize - 1) };
};

export const localFileResponse = async (path: string, request: Request) => {
  const fileStats = await stat(path);
  if (!fileStats.isFile()) return null;
  const baseHeaders = new Headers({
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-store",
    "Content-Type": localFileContentType(path)
  });
  const range = parseRangeHeader(request.headers.get("Range"), fileStats.size);
  if (range === "invalid") {
    baseHeaders.set("Content-Range", `bytes */${fileStats.size}`);
    return new Response(null, { status: 416, headers: baseHeaders });
  }
  const file = await readFile(path);
  if (range) {
    const chunk = file.subarray(range.start, range.end + 1);
    baseHeaders.set("Content-Length", String(chunk.byteLength));
    baseHeaders.set("Content-Range", `bytes ${range.start}-${range.end}/${fileStats.size}`);
    return new Response(request.method === "HEAD" ? null : chunk, { status: 206, headers: baseHeaders });
  }
  baseHeaders.set("Content-Length", String(file.byteLength));
  return new Response(request.method === "HEAD" ? null : file, { status: 200, headers: baseHeaders });
};

// ---------------------------------------------------------------------------
// Asset helpers
// ---------------------------------------------------------------------------

export const loadAssetData = async (path: string): Promise<AssetDataResult> => {
  const kind = documentKindFromPath(path);
  if (kind !== "image" && kind !== "video" && kind !== "audio" && kind !== "pdf" && kind !== "spreadsheet") {
    throw new Error("Unsupported asset type");
  }
  const fileStats = await stat(path);
  if (!fileStats.isFile()) throw new Error("Asset file not found");
  const file = await readFile(path);
  const data = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
  return {
    data,
    mimeType: localFileContentType(path)
  };
};

export const savePdfFile = async (path: string, data: ArrayBuffer): Promise<void> => {
  if (documentKindFromPath(path) !== "pdf") throw new Error("Only PDF files can be saved this way");
  await writeFile(path, Buffer.from(data));
};

export const saveSpreadsheetFile = async (path: string, data: ArrayBuffer): Promise<SaveSpreadsheetResult> => {
  if (documentKindFromPath(path) !== "spreadsheet") throw new Error("Only spreadsheet files can be saved this way");
  await writeFile(path, Buffer.from(data));
  return { path };
};

export const documentFolderForPath = (path: string) => dirname(path);

export const markdownPathFromDocumentPath = (documentPath: string, assetPath: string) =>
  markdownPathForFile(documentFolderForPath(documentPath), assetPath);

export const pdfMarkdown = (path: string, documentPath = path) =>
  markdownLink(basename(path), markdownPathFromDocumentPath(documentPath, path));

export const getSpreadsheetFileStat = async (path: string): Promise<SpreadsheetDiskFingerprint> => {
  if (documentKindFromPath(path) !== "spreadsheet") throw new Error("Only spreadsheet files can be checked this way");
  const fileStats = await stat(path);
  if (!fileStats.isFile()) throw new Error("Spreadsheet file not found");
  return { mtimeMs: fileStats.mtimeMs, size: fileStats.size };
};

export const spreadsheetMarkdown = (path: string, documentPath = path) =>
  markdownLink(basename(path), markdownPathFromDocumentPath(documentPath, path));

export const generatedMarkdownForAssetPath = (path: string, documentPath = path) => {
  const ext = extname(path).toLowerCase();
  const href = markdownPathFromDocumentPath(documentPath, path);
  if (IMAGE_EXTENSIONS.has(ext)) return markdownImage(basename(path), href);
  if (VIDEO_EXTENSIONS.has(ext)) return `<video controls src="${escapeHtmlAttr(href)}" title="${escapeHtmlAttr(basename(path))}"></video>`;
  if (AUDIO_EXTENSIONS.has(ext)) return `<audio controls src="${escapeHtmlAttr(href)}" title="${escapeHtmlAttr(basename(path))}"></audio>`;
  if (PDF_EXTENSIONS.has(ext)) return markdownLink(basename(path), href);
  return null;
};

export const normalizeAssetDocumentMarkdown = (document: InformioDocument) => {
  if (!document.filePath) return document;
  const kind = normalizeDocumentKind(document);
  if (kind !== "image" && kind !== "video" && kind !== "audio" && kind !== "pdf") return withDocumentKind(document);
  const markdown = kind === "pdf" ? pdfMarkdown(document.filePath) : generatedMarkdownForAssetPath(document.filePath);
  if (!markdown || markdown === document.markdown) return withDocumentKind(document);
  return { ...document, kind, markdown };
};

// ---------------------------------------------------------------------------
// Export helpers
// ---------------------------------------------------------------------------

export const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const quoteCssFontFamily = (family: string) => `"${family.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

export const exportFontStack = (appearance: { englishFontFamily: string; chineseFontFamily: string }) => {
  return [
    appearance.englishFontFamily,
    appearance.chineseFontFamily,
    "PingFang SC",
    "Hiragino Sans GB",
    "Microsoft YaHei",
    "Noto Sans CJK SC",
    "Helvetica Neue",
    "Arial"
  ]
    .map((family) => family.trim())
    .filter(Boolean)
    .map((family) => quoteCssFontFamily(family))
    .concat(["-apple-system", "BlinkMacSystemFont", "\"Segoe UI\"", "sans-serif"])
    .filter((family, index, items) => items.indexOf(family) === index)
    .join(", ");
};

export const markdownToBasicHtml = (markdown: string, fontStack: string, title = "Informio Export") => {
  const blocks = markdown.split(/\n{2,}/);
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  :root {
    color-scheme: light;
    font-family: ${fontStack};
    line-height: 1.7;
    color: #0f172a;
    background: #ffffff;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0 auto;
    max-width: 780px;
    padding: 56px 40px 72px;
    font-size: 15px;
    background: #ffffff;
  }
  h1, h2, h3, h4, h5, h6 {
    line-height: 1.28;
    margin: 1.8em 0 0.72em;
  }
  h1:first-child, h2:first-child, h3:first-child, h4:first-child, h5:first-child, h6:first-child, p:first-child {
    margin-top: 0;
  }
  p {
    margin: 0 0 1em;
    white-space: normal;
    overflow-wrap: anywhere;
  }
  @page {
    margin: 18mm 16mm 20mm;
  }
</style>
</head>
<body>
${blocks
  .map((block) => {
    const heading = /^(#{1,6})\s+(.+)$/.exec(block.trim());
    if (heading) return `<h${heading[1].length}>${escapeHtml(heading[2])}</h${heading[1].length}>`;
    return `<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`;
  })
  .join("\n")}
</body>
</html>`;
};

export const exportHtmlToPdf = async (outputPath: string, html: string) => {
  const { BrowserWindow } = await import("electron");
  const exportWindow = new BrowserWindow({
    show: false,
    width: 900,
    height: 1200,
    backgroundColor: "#ffffff",
    webPreferences: {
      sandbox: false
    }
  });

  try {
    await exportWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    await exportWindow.webContents.executeJavaScript(
      "document.fonts?.ready ? document.fonts.ready.then(() => true) : Promise.resolve(true)",
      true
    );
    const pdf = await exportWindow.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true
    });
    await writeFile(outputPath, pdf);
  } finally {
    if (!exportWindow.isDestroyed()) exportWindow.destroy();
  }
};
