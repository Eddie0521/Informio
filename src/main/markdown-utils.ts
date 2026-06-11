import { existsSync } from "node:fs";
import { cp, mkdir, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, relative } from "node:path";
import type { InformioDocument } from "../shared/types.js";

const ATTACHMENTS_DIR = "attachments";

// ---------------------------------------------------------------------------
// String helpers
// ---------------------------------------------------------------------------

export const markdownTitle = (title: string) => title.replace(/\.(md|markdown|txt)$/i, "");

export const normalizeLinkTitle = (value: string) =>
  decodeURIComponent(value)
    .replace(/\\/g, "/")
    .split("#")[0]
    .split("/")
    .filter(Boolean)
    .at(-1)
    ?.replace(/\.(md|markdown|txt)$/i, "")
    .trim()
    .toLowerCase() ?? "";

export const replaceWikiLinkTargets = (markdown: string, oldTitle: string, newTitle: string) =>
  markdown.replace(/\[\[([^\]\n]+)\]\]/g, (match, body: string) => {
    const [rawTarget, ...aliasParts] = body.split("|");
    const target = rawTarget.trim();
    const alias = aliasParts.join("|").trim();
    return normalizeLinkTitle(target) === normalizeLinkTitle(oldTitle) ? `[[${newTitle}${alias ? `|${alias}` : ""}]]` : match;
  });

export const parseHtmlAttr = (attributes: string, name: string) => {
  const pattern = new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
  const match = attributes.match(pattern);
  return (match?.[1] ?? match?.[2] ?? match?.[3] ?? "").trim();
};

export const decodeHtmlEntities = (value: string) =>
  value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number.parseInt(dec, 10)));

export const stripHtml = (value: string) => decodeHtmlEntities(value.replace(/<[^>]+>/g, "")).trim();

export const escapeHtmlAttr = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

export const markdownLink = (label: string, href: string) => `[${label.replace(/[\[\]\n]/g, " ").trim() || basename(href)}](${href})`;

export const markdownImage = (alt: string, href: string) => `![${alt.replace(/[\[\]\n]/g, " ").trim()}](${href})`;

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

export const markdownPathForFile = (documentFolder: string, filePath: string) => {
  const relativePath = relative(documentFolder, filePath).replace(/\\/g, "/");
  return encodeURI(relativePath.startsWith(".") ? relativePath : relativePath || basename(filePath));
};

const normalizeForCompare = (path: string) => {
  const normalized = path.replace(/\\/g, "/").replace(/\/+$/, "");
  return process.platform === "darwin" ? normalized.toLowerCase() : normalized;
};

const isWindows = process.platform === "win32";

export const normalizeLocalFileCandidate = (path: string) => {
  const normalizedHomePath = path.startsWith("/users/") ? `/Users/${path.slice("/users/".length)}` : path;
  if (isWindows && /^\/[A-Za-z]:\//.test(normalizedHomePath)) return normalizedHomePath.slice(1);
  return normalizedHomePath;
};

export const localFilePathCandidates = (url: string) => {
  try {
    const parsed = new URL(url);
    const host = decodeURIComponent(parsed.host);
    const pathname = decodeURIComponent(parsed.pathname);
    const candidates = [];
    if (isWindows && /^[A-Za-z]:?$/.test(host)) {
      candidates.push(`${host.replace(/:$/, "")}:${pathname}`);
    }
    candidates.push(parsed.host ? `/${host}${pathname}` : pathname);
    return Array.from(new Set(candidates.map(normalizeLocalFileCandidate)));
  } catch {
    const pathname = decodeURIComponent(url.slice("local-file://".length));
    return [normalizeLocalFileCandidate(pathname.startsWith("/") ? pathname : `/${pathname}`)];
  }
};

export const replaceLocalFileUrls = (markdown: string, documentFolder: string | undefined, resolveNextPath: (path: string) => string | null) =>
  markdown.replace(/local-file:\/\/[^\s)"'>]+/g, (value) => {
    for (const candidate of localFilePathCandidates(value)) {
      const nextPath = resolveNextPath(candidate);
      if (!nextPath || normalizeForCompare(nextPath) === normalizeForCompare(candidate)) continue;
      return documentFolder ? markdownPathForFile(documentFolder, nextPath) : encodeURI(basename(nextPath));
    }
    return value;
  });

export const withUpdatedLocalFileUrls = (document: InformioDocument, resolveNextPath: (path: string) => string | null) => {
  const markdown = replaceLocalFileUrls(document.markdown, document.filePath ? dirname(document.filePath) : undefined, resolveNextPath);
  return markdown === document.markdown
    ? document
    : { ...document, markdown, updatedAt: new Date().toISOString() };
};

// ---------------------------------------------------------------------------
// File operations
// ---------------------------------------------------------------------------

export const saveMarkdownFile = async (path: string, markdown: string) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, markdown, "utf8");
};

export const uniquePath = async (folder: string, baseName: string, extension = ".md") => {
  const cleanName = baseName.replace(/[\\/:*?"<>|]/g, "-").trim() || "Untitled";
  for (let index = 0; index < 999; index += 1) {
    const name = index === 0 ? `${cleanName}${extension}` : `${cleanName} ${index + 1}${extension}`;
    const path = join(folder, name);
    try {
      await stat(path);
    } catch {
      return path;
    }
  }
  return join(folder, `${cleanName}-${Date.now()}${extension}`);
};

export const backupMarkdownFile = async (path: string) => {
  const backupPath = await uniquePath(dirname(path), `${basename(path)}.informio-clean-backup`, "");
  await cp(path, backupPath);
};

export const cleanAttachmentName = (filePath: string) => {
  const extension = extname(filePath);
  const baseName =
    basename(filePath, extension)
      .replace(/[\\/:*?"<>|]/g, "-")
      .replace(/\s+/g, "_")
      .replace(/_+/g, "_")
      .trim()
      .replace(/^_+|_+$/g, "")
    || `attachment-${Date.now()}`;
  return { baseName, extension: extension || ".bin" };
};

export const ensureAttachmentReference = async (documentFolder: string | undefined, source: string, fallbackName = "Attachment") => {
  if (!source.trim()) return encodeURI(fallbackName);
  if (!source.startsWith("local-file://")) return source;
  if (!documentFolder) return encodeURI(basename(localFilePathCandidates(source)[0] ?? fallbackName));

  const existingPath = localFilePathCandidates(source).find((candidate) => existsSync(candidate));
  if (!existingPath) return encodeURI(basename(localFilePathCandidates(source)[0] ?? fallbackName));

  const attachmentFolder = join(documentFolder, ATTACHMENTS_DIR);
  await mkdir(attachmentFolder, { recursive: true });
  const { baseName, extension } = cleanAttachmentName(existingPath);
  const targetPath = await uniquePath(attachmentFolder, baseName, extension);
  if (normalizeForCompare(existingPath) !== normalizeForCompare(targetPath)) await cp(existingPath, targetPath);
  return markdownPathForFile(documentFolder, targetPath);
};

// ---------------------------------------------------------------------------
// Markdown cleaning
// ---------------------------------------------------------------------------

export const cleanMarkdownStorage = async (markdown: string, documentFolder?: string) => {
  let cleaned = markdown;
  cleaned = cleaned.replace(/<span\b(?=[^>]*\bdata-text-color=)[^>]*>([\s\S]*?)<\/span>/gi, (_, content: string) => decodeHtmlEntities(content));
  cleaned = cleaned.replace(/<span\b(?=[^>]*\bstyle=["'][^"']*\bcolor\s*:)[^>]*>([\s\S]*?)<\/span>/gi, (_, content: string) => decodeHtmlEntities(content));

  const replaceAsync = async (input: string, pattern: RegExp, replacer: (...args: string[]) => Promise<string>) => {
    const matches = Array.from(input.matchAll(pattern));
    if (!matches.length) return input;
    let output = "";
    let cursor = 0;
    for (const match of matches) {
      output += input.slice(cursor, match.index);
      output += await replacer(...(match as unknown as string[]));
      cursor = (match.index ?? 0) + match[0].length;
    }
    return output + input.slice(cursor);
  };

  cleaned = await replaceAsync(cleaned, /<iframe\b([^>]*)><\/iframe>/gi, async (raw, attrs) => {
    if (parseHtmlAttr(attrs, "data-type") !== "pdf") return raw;
    const src = await ensureAttachmentReference(documentFolder, parseHtmlAttr(attrs, "src"), parseHtmlAttr(attrs, "title") || "PDF");
    return markdownLink(stripHtml(parseHtmlAttr(attrs, "title") || "PDF"), src);
  });

  cleaned = await replaceAsync(cleaned, /<(video|audio)\b([^>]*)><\/\1>/gi, async (raw, kind, attrs) => {
    const src = await ensureAttachmentReference(documentFolder, parseHtmlAttr(attrs, "src"), parseHtmlAttr(attrs, "title") || kind);
    const title = stripHtml(parseHtmlAttr(attrs, "title") || parseHtmlAttr(attrs, "aria-label") || kind);
    return `<${kind.toLowerCase()} controls src="${escapeHtmlAttr(src)}" title="${escapeHtmlAttr(title)}"></${kind.toLowerCase()}>`;
  });

  cleaned = await replaceAsync(cleaned, /<img\b([^>]*?)\/?>/gi, async (raw, attrs) => {
    const src = await ensureAttachmentReference(documentFolder, parseHtmlAttr(attrs, "src"), parseHtmlAttr(attrs, "alt") || "image");
    return markdownImage(stripHtml(parseHtmlAttr(attrs, "alt") || parseHtmlAttr(attrs, "title") || ""), src);
  });

  cleaned = await replaceAsync(cleaned, /local-file:\/\/[^\s)"'>]+/g, async (raw) => ensureAttachmentReference(documentFolder, raw));
  cleaned = cleaned.replace(/<aside\b(?=[^>]*data-type=["']callout-block["'])[^>]*>\s*<strong[^>]*>([\s\S]*?)<\/strong>\s*<p[^>]*>([\s\S]*?)<\/p>\s*<\/aside>/gi, (_, title: string, body: string) => {
    const lines = stripHtml(body).split("\n").map((line) => `> ${line}`.trimEnd()).join("\n");
    return `> [!${stripHtml(title).toUpperCase() || "NOTE"}]\n${lines}`;
  });
  cleaned = cleaned.replace(/<section\b(?=[^>]*data-type=["']footnote-block["'])[^>]*>\s*<sup[^>]*>([\s\S]*?)<\/sup>\s*<span[^>]*>([\s\S]*?)<\/span>\s*<\/section>/gi, (_, index: string, body: string) => {
    return `[^${stripHtml(index) || "1"}]: ${stripHtml(body)}`;
  });
  cleaned = cleaned.replace(/^<details(?:\s[^>]*)?>\s*<summary>([\s\S]*?)<\/summary>\s*([\s\S]*?)\s*<\/details>\s*$/gim, (_, summary: string, body: string) => {
    const lines = stripHtml(body).split("\n").map((line) => `> ${line}`.trimEnd()).join("\n");
    return `> [!note]- ${stripHtml(summary) || "Summary"}\n${lines}`;
  });

  return cleaned;
};
