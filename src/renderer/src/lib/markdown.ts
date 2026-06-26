import type { JSONContent, MarkdownRendererHelpers } from "@tiptap/core";
import type { HorizontalCellAlign, InformioDocument } from "../types";
import { horizontalAlignToSeparatorCell } from "./markdown-block-parser";

export const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

export const normalizeTableText = (value: string) => value.replace(/\s+/g, " ").trim();

export const renderImageMarkdown = (attrs: { src?: string | null; alt?: string | null; title?: string | null; width?: number | string | null }) => {
  const src = attrs.src ?? "";
  const alt = attrs.alt ?? "";
  const title = attrs.title ?? "";
  return title ? `![${alt}](${src} "${title}")` : `![${alt}](${src})`;
};

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

export const wikilinkLabel = (doc: InformioDocument) => markdownTitle(doc.title);

export const parseWikiLinkBody = (value: string) => {
  const [rawTarget, ...aliasParts] = value.split("|");
  const target = rawTarget.trim();
  const alias = aliasParts.join("|").trim();
  return { target, alias: alias || undefined };
};

export const wikiLinkText = (target: string, alias?: string) => `[[${target}${alias ? `|${alias}` : ""}]]`;

export const replaceWikiLinkTargets = (markdown: string, oldTitle: string, newTitle: string) =>
  markdown.replace(/\[\[([^\]\n]+)\]\]/g, (match, body: string) => {
    const parsed = parseWikiLinkBody(body);
    return normalizeLinkTitle(parsed.target) === normalizeLinkTitle(oldTitle) ? wikiLinkText(newTitle, parsed.alias) : match;
  });

export const plainText = (value: string) =>
  value
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .trim();

export const parseHtmlAttr = (html: string, name: string) => {
  const match = new RegExp(`${name}=["']([^"']*)["']`, "i").exec(html);
  return match?.[1] ?? "";
};

export const renderTableToGfm = (node: JSONContent, h: MarkdownRendererHelpers) => {
  const rows = (node.content ?? []).map((row) => {
    const cells = (row.content ?? []).map((cell) => {
      const text = (cell.content ?? []).map((child) => h.renderChildren(child)).join("");
      return normalizeTableText(text);
    });
    return cells;
  });
  if (!rows.length) return "";
  const columnCount = Math.max(...rows.map((row) => row.length));
  const aligned = rows.map((row) =>
    Array.from({ length: columnCount }, (_, index) => row[index] ?? "")
  );
  const header = aligned[0];
  const firstRowCells = node.content?.[0]?.content ?? [];
  const separator = Array.from({ length: columnCount }, (_, index) => {
    const cell = firstRowCells[index];
    const align = (cell?.attrs?.align as HorizontalCellAlign | undefined) ?? "center";
    return horizontalAlignToSeparatorCell(align);
  });
  const body = aligned.slice(1);
  const lines = [
    `| ${header.join(" | ")} |`,
    `| ${separator.join(" | ")} |`,
    ...body.map((row) => `| ${row.join(" | ")} |`)
  ];
  return `\n${lines.join("\n")}\n`;
};

export const renderJsonNodeToHtml = (node: JSONContent): string => {
  if (node.type === "text") {
    const text = node.text ?? "";
    let result = escapeHtml(text);
    if (node.marks) {
      for (const mark of node.marks) {
        if (mark.type === "bold") result = `<strong>${result}</strong>`;
        else if (mark.type === "italic") result = `<em>${result}</em>`;
        else if (mark.type === "code") result = `<code>${result}</code>`;
        else if (mark.type === "link") result = `<a href="${escapeHtml(String(mark.attrs?.href ?? ""))}">${result}</a>`;
      }
    }
    return result;
  }
  const children = (node.content ?? []).map(renderJsonNodeToHtml).join("");
  if (node.type === "paragraph") return `<p>${children}</p>`;
  if (node.type === "heading") {
    const level = Number(node.attrs?.level ?? 1);
    return `<h${level}>${children}</h${level}>`;
  }
  if (node.type === "bulletList") return `<ul>${children}</ul>`;
  if (node.type === "orderedList") return `<ol>${children}</ol>`;
  if (node.type === "listItem") return `<li>${children}</li>`;
  if (node.type === "blockquote") return `<blockquote>${children}</blockquote>`;
  if (node.type === "codeBlock") {
    const language = String(node.attrs?.language ?? "");
    const code = escapeHtml(node.content?.map((child) => child.text ?? "").join("") ?? "");
    return `<pre><code class="language-${escapeHtml(language)}">${code}</code></pre>`;
  }
  if (node.type === "hardBreak") return "<br>";
  if (node.type === "horizontalRule") return "<hr>";
  return children;
};

