import { useState, useEffect } from "react";
import type { JSONContent, Editor } from "@tiptap/core";
import type { ReactNodeViewProps } from "@tiptap/react";
import { TextSelection } from "@tiptap/pm/state";
import type {
  MarkdownHelperLike,
  HorizontalCellAlign,
  ProseMirrorNodeLike,
  ProseMirrorSchemaLike,
  MarkdownTextBlock,
  MarkdownAutoBlockMatch,
  DocumentLookupIndex,
  WikiTargetBucket,
  WikiSuggestionItem,
  IndexedDocument,
  NodeViewPositionGetter,
  NodeViewNode,
  InformioDocument,
} from "../types";
import { common, createLowlight } from "lowlight";
import { calloutTypes } from "../constants";
import { escapeHtml, plainText, normalizeLinkTitle, markdownTitle, wikilinkLabel } from "./markdown";
import { pathDirName } from "./path";
import type { LowlightNode } from "../types";

export { calloutTypes };

export const lowlight = createLowlight(common);
lowlight.registerAlias({
  javascript: ["js", "jsx"],
  typescript: ["ts", "tsx"],
  markdown: ["md"],
  shell: ["sh", "zsh"],
  xml: ["html"]
});

export const hastToHtml = (node: LowlightNode): string => {
  if (node.type === "text") return escapeHtml(node.value ?? "");
  const tag = node.tagName ?? "span";
  const className = Array.isArray(node.properties?.className) ? ` class="${node.properties.className.join(" ")}"` : "";
  return `<${tag}${className}>${(node.children ?? []).map(hastToHtml).join("")}</${tag}>`;
};

export const highlightedCodeHtml = (language: string, code: string) => {
  const normalizedLanguage = normalizeCodeLanguage(language);
  if (normalizedLanguage === "plaintext") return escapeHtml(code);
  try {
    const tree = lowlight.highlight(normalizedLanguage, code);
    return tree.children.map((child) => hastToHtml(child as LowlightNode)).join("");
  } catch {
    return escapeHtml(code);
  }
};

// ─── Source / JSON helpers ───

export const sourceText = (node: ReactNodeViewProps["node"]) => {
  return node.textContent !== "" ? node.textContent : nodeSourceAttr(node as { attrs?: { source?: string } }, node.type.name);
};

export const sourceContent = (source: string, h: MarkdownHelperLike) => [h.createTextNode(source)];

export const nodeSourceAttr = (node: { attrs?: Record<string, unknown> }, fallbackType: string) => {
  const source = node.attrs?.source;
  return typeof source === "string" ? source : defaultBlockSource(fallbackType);
};

export const jsonSourceText = (node: JSONContent, fallbackType: string) =>
  jsonTextContent(node) !== ""
    ? jsonTextContent(node)
    : nodeSourceAttr(node as { attrs?: { source?: string } }, fallbackType);

export const jsonTextContent = (node?: JSONContent): string =>
  node?.text ?? node?.content?.map((child) => jsonTextContent(child)).join("") ?? "";

export const defaultBlockSource = (name: string) => {
  if (name === "mathInline") return "$x$";
  if (name === "mathBlock") return "$$\nE = mc^2\n$$";
  if (name === "chartBlock") return "```mermaid\nflowchart TD\n  A[Start] --> B[End]\n```";
  if (name === "footnoteBlock") return "[^1]: Footnote";
  if (name === "detailsBlock") return "> [!note]- Summary\n> Content";
  return "> [!NOTE]\n> Important note";
};

export const sourceBackedBlockContent = (source: string) => [{ type: "text", text: source }];

export const sourceBackedBlockJson = (type: string, source: string, focus = false): JSONContent => ({
  type,
  attrs: { source, focusKey: focus ? String(Date.now()) : "" },
  content: sourceBackedBlockContent(source)
});

// ─── Chart helpers ───

export const chartLabels = (text: string) => Array.from(text.matchAll(/\b[A-Za-z0-9_]+\[([^\]]+)\]/g)).map((match) => match[1]);

// ─── ProseMirror node helpers ───

export const textContentNode = (schema: ProseMirrorSchemaLike, text: string) => (text ? schema.text(text) : undefined);

export const sourceBackedNode = (
  schema: ProseMirrorSchemaLike,
  typeName: "mathBlock" | "chartBlock" | "footnoteBlock" | "detailsBlock" | "calloutBlock",
  source: string,
  attrs: Record<string, unknown> = {}
) => schema.nodes[typeName].create({ source, ...attrs }, textContentNode(schema, source));

// ─── Markdown table parsing ───

export const parseMarkdownTableRow = (line: string) => {
  const trimmed = line.trim();
  if (!trimmed.includes("|")) return null;
  const body = trimmed.replace(/^\|/, "").replace(/\|$/, "");
  const cells = body.split("|").map((cell) => cell.trim());
  return cells.length >= 2 ? cells : null;
};

export const isExplicitMarkdownTableRow = (line: string) => /^\|.*\|$/.test(line.trim());

export const isMarkdownTableSeparator = (line: string, expectedCells: number) => {
  const cells = parseMarkdownTableRow(line);
  return Boolean(cells && cells.length === expectedCells && cells.every((cell) => /^:?-{3,}:?$/.test(cell)));
};

export const markdownTableAlign = (separatorCell: string): HorizontalCellAlign => {
  const trimmed = separatorCell.trim();
  if (trimmed.startsWith(":") && trimmed.endsWith(":")) return "center";
  if (trimmed.endsWith(":")) return "right";
  return "left";
};

export const createTableFromMarkdown = (schema: ProseMirrorSchemaLike, lines: string[]) => {
  const header = parseMarkdownTableRow(lines[0]);
  if (!header || !isMarkdownTableSeparator(lines[1], header.length)) return null;
  const separator = parseMarkdownTableRow(lines[1]) ?? header.map(() => "---");
  const dataRows = lines.slice(2).map(parseMarkdownTableRow).filter((row): row is string[] => Boolean(row && row.length === header.length));
  const rows = [header, ...(dataRows.length ? dataRows : [header.map(() => "")])];

  return schema.nodes.table.create(
    null,
    rows.map((cells, rowIndex) =>
      schema.nodes.tableRow.create(
        null,
        cells.map((cell, columnIndex) => {
          const cellType = rowIndex === 0 ? schema.nodes.tableHeader : schema.nodes.tableCell;
          return cellType.create({ align: markdownTableAlign(separator[columnIndex] ?? "---") }, schema.nodes.paragraph.create(null, textContentNode(schema, cell)));
        })
      )
    )
  );
};

// ─── Code block helpers ───

export const codeBlockFromFence = (schema: ProseMirrorSchemaLike, language: string, lines: string[]) =>
  schema.nodes.codeBlock.create({ language: language.trim() || "plaintext" }, textContentNode(schema, lines.join("\n")));

export const isPlainParagraph = (block: MarkdownTextBlock) => block.node.type.name === "paragraph";

export const topLevelTextBlocks = (doc: ProseMirrorNodeLike): MarkdownTextBlock[] => {
  const blocks: MarkdownTextBlock[] = [];
  doc.forEach((node, offset) => {
    if (node.isTextblock) {
      blocks.push({ node, pos: offset, text: node.textContent });
    }
  });
  return blocks;
};

export const markdownAutoBlockMatch = (schema: ProseMirrorSchemaLike, doc: ProseMirrorNodeLike): MarkdownAutoBlockMatch | null => {
  const blocks = topLevelTextBlocks(doc);

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    const text = block.text.trim();
    if (!text) continue;

    if (!isPlainParagraph(block)) continue;

    const singleLineMath = text.match(/^\$\$([\s\S]+?)\$\$$/);
    if (singleLineMath) {
      return {
        from: block.pos,
        to: block.pos + block.node.nodeSize,
        node: sourceBackedNode(schema, "mathBlock", text, { text: singleLineMath[1].trim() }),
        selectionOffset: text.length
      };
    }

    const footnote = text.match(/^\[\^([^\]]+)]:\s*([\s\S]*)$/);
    if (footnote) {
      return {
        from: block.pos,
        to: block.pos + block.node.nodeSize,
        node: sourceBackedNode(schema, "footnoteBlock", text, { index: footnote[1], text: footnote[2].trim() }),
        selectionOffset: text.length
      };
    }

    const singleLineDetails = text.match(/^<details(?:\s[^>]*)?>[\s\S]*<\/details>$/i);
    if (singleLineDetails) {
      const details = detailsFromSource(text);
      return {
        from: block.pos,
        to: block.pos + block.node.nodeSize,
        node: sourceBackedNode(schema, "detailsBlock", text, details),
        selectionOffset: text.length
      };
    }

    const headerCells = parseMarkdownTableRow(text);
    if (headerCells && blocks[index + 1] && isPlainParagraph(blocks[index + 1]) && isMarkdownTableSeparator(blocks[index + 1].text, headerCells.length)) {
      const tableLines = [text, blocks[index + 1].text.trim()];
      let endIndex = index + 1;
      while (blocks[endIndex + 1] && isPlainParagraph(blocks[endIndex + 1])) {
        const row = parseMarkdownTableRow(blocks[endIndex + 1].text);
        if (!row || row.length !== headerCells.length) break;
        tableLines.push(blocks[endIndex + 1].text.trim());
        endIndex += 1;
      }
      const table = createTableFromMarkdown(schema, tableLines);
      if (table) {
        return {
          from: block.pos,
          to: blocks[endIndex].pos + blocks[endIndex].node.nodeSize,
          node: table,
          selectionOffset: 4
        };
      }
    }

    const fence = text.match(/^```([A-Za-z0-9_-]*)\s*$/);
    if (fence) {
      const closingIndex = blocks.findIndex((candidate, candidateIndex) => candidateIndex > index && isPlainParagraph(candidate) && candidate.text.trim() === "```");
      if (closingIndex > index) {
        const language = fence[1] || "plaintext";
        const bodyLines = blocks.slice(index + 1, closingIndex).map((candidate) => candidate.text);
        const source = [text, ...bodyLines, "```"].join("\n");
        return {
          from: block.pos,
          to: blocks[closingIndex].pos + blocks[closingIndex].node.nodeSize,
          node:
            language.toLowerCase() === "mermaid"
              ? sourceBackedNode(schema, "chartBlock", source, { text: bodyLines.join("\n") })
              : codeBlockFromFence(schema, language, bodyLines),
          selectionOffset: language.toLowerCase() === "mermaid" ? source.length : bodyLines.join("\n").length
        };
      }
    }

    if (text === "$$") {
      const closingIndex = blocks.findIndex((candidate, candidateIndex) => candidateIndex > index && isPlainParagraph(candidate) && candidate.text.trim() === "$$");
      if (closingIndex > index) {
        const bodyLines = blocks.slice(index + 1, closingIndex).map((candidate) => candidate.text);
        const source = ["$$", ...bodyLines, "$$"].join("\n");
        return {
          from: block.pos,
          to: blocks[closingIndex].pos + blocks[closingIndex].node.nodeSize,
          node: sourceBackedNode(schema, "mathBlock", source, { text: bodyLines.join("\n").trim() }),
          selectionOffset: source.length
        };
      }
    }

    if (/^<details\b/i.test(text)) {
      const closingIndex = blocks.findIndex(
        (candidate, candidateIndex) => candidateIndex >= index && isPlainParagraph(candidate) && /<\/details>/i.test(candidate.text)
      );
      if (closingIndex >= index) {
        const source = blocks.slice(index, closingIndex + 1).map((candidate) => candidate.text).join("\n");
        const details = detailsFromSource(source);
        return {
          from: block.pos,
          to: blocks[closingIndex].pos + blocks[closingIndex].node.nodeSize,
          node: sourceBackedNode(schema, "detailsBlock", source, details),
          selectionOffset: source.length
        };
      }
    }
  }

  return null;
};

// ─── Code block raw markdown ───

export const codeBlockRawMarkdown = (language: string, code: string) => {
  const languageSuffix = language === "plaintext" ? "" : language;
  return `\`\`\`${languageSuffix}\n${code}\n\`\`\``;
};

export const parseCodeBlockRawMarkdown = (value: string) => {
  const match = value.match(/^```([^\n`]*)\n([\s\S]*?)\n```$/);
  if (!match) return null;
  return {
    language: normalizeCodeLanguage(match[1] ?? "plaintext"),
    code: match[2] ?? ""
  };
};

export const codeBlockEditableRange = (value: string) => {
  const firstLineEnd = value.indexOf("\n");
  const closingFenceStart = value.lastIndexOf("\n```");
  if (firstLineEnd < 0 || closingFenceStart <= firstLineEnd) return null;
  return {
    from: firstLineEnd + 1,
    to: closingFenceStart
  };
};

// ─── Editor node manipulation ───

export const replaceNodeWithPlainText = (editor: Editor, getPos: NodeViewPositionGetter, node: NodeViewNode, text: string) => {
  const position = getPos();
  if (typeof position !== "number") return;
  const paragraph = editor.schema.nodes.paragraph;
  if (!paragraph) return;
  const paragraphs = text.split("\n").map((line) => paragraph.create(null, line ? editor.schema.text(line) : undefined));
  const tr = editor.state.tr.replaceWith(position, position + node.nodeSize, paragraphs);
  tr.setSelection(TextSelection.create(tr.doc, Math.min(position + Math.max(1, text.length), tr.doc.content.size)));
  editor.view.dispatch(tr);
};

export const replaceSourceBlockWithParagraph = (editor: Editor, getPos: NodeViewPositionGetter, node: NodeViewNode) => {
  const position = getPos();
  if (typeof position !== "number") return false;
  const paragraph = editor.schema.nodes.paragraph?.create();
  if (!paragraph) return false;
  const tr = editor.state.tr.replaceWith(position, position + node.nodeSize, paragraph);
  tr.setSelection(TextSelection.create(tr.doc, Math.min(position + 1, tr.doc.content.size)));
  editor.view.dispatch(tr);
  return true;
};

export const isDiscardableSourceRemainder = (typeName: string, source: string) =>
  source.trim() === "" || (typeName === "chartBlock" && isDiscardableMermaidSource(source));

// ─── Markdown offset helpers ───

export const markdownOffsetForLine = (markdown: string, line: number) => {
  if (line <= 1) return 0;
  const lines = markdown.split("\n");
  let offset = 0;
  for (let index = 0; index < Math.min(line - 1, lines.length); index += 1) {
    offset += lines[index].length + 1;
  }
  return offset;
};

// ─── Wiki link resolution ───

export const resolveWikiLink = (target: string, documentLookupIndex: DocumentLookupIndex, currentDocument?: InformioDocument) => {
  const normalizedTarget = normalizeLinkTitle(target);
  if (!normalizedTarget) return undefined;
  const bucket = documentLookupIndex.byWikiTarget.get(normalizedTarget);
  if (!bucket?.candidates.length) return undefined;
  const exact = bucket.candidates.find((candidate) => candidate.normalizedTitle === normalizedTarget)?.document;
  if (exact) return exact;
  const currentFolder = currentDocument?.filePath ? pathDirName(currentDocument.filePath) : "";
  const sameFolder = bucket.candidates.find((candidate) => candidate.folderPath && currentFolder && candidate.folderPath === currentFolder)?.document;
  if (sameFolder) return sameFolder;
  return bucket.latest?.document;
};

export const buildDocumentLookupIndex = (documents: InformioDocument[], excludedSuggestionDocumentId?: string): DocumentLookupIndex => {
  const byWikiTarget = new Map<string, WikiTargetBucket>();
  const byMarkdownTitleLower = new Map<string, InformioDocument>();
  const byMarkdownTitleExact = new Map<string, InformioDocument>();
  const byExactTitle = new Map<string, InformioDocument>();
  const byFilePath = new Map<string, InformioDocument>();
  const wikiSuggestions: WikiSuggestionItem[] = [];

  documents.forEach((document) => {
    if (document.filePath && !byFilePath.has(document.filePath)) byFilePath.set(document.filePath, document);
    if (!byExactTitle.has(document.title)) byExactTitle.set(document.title, document);

    const markdownBaseTitle = markdownTitle(document.title);
    const markdownKey = markdownBaseTitle.toLowerCase();
    if (markdownKey && !byMarkdownTitleLower.has(markdownKey)) byMarkdownTitleLower.set(markdownKey, document);
    if (markdownBaseTitle && !byMarkdownTitleExact.has(markdownBaseTitle)) byMarkdownTitleExact.set(markdownBaseTitle, document);

    const candidate: IndexedDocument = {
      document,
      normalizedTitle: normalizeLinkTitle(document.title),
      normalizedFilePath: normalizeLinkTitle(document.filePath ?? ""),
      folderPath: document.filePath ? pathDirName(document.filePath) : ""
    };

    Array.from(new Set([candidate.normalizedTitle, candidate.normalizedFilePath].filter(Boolean))).forEach((key) => {
      const bucket = byWikiTarget.get(key) ?? { candidates: [], latest: null };
      bucket.candidates.push(candidate);
      if (!bucket.latest || candidate.document.updatedAt.localeCompare(bucket.latest.document.updatedAt) > 0) {
        bucket.latest = candidate;
      }
      byWikiTarget.set(key, bucket);
    });

    if (document.id !== excludedSuggestionDocumentId) {
      wikiSuggestions.push({
        document,
        lowerLabel: wikilinkLabel(document).toLowerCase()
      });
    }
  });

  wikiSuggestions.sort((left, right) => right.document.updatedAt.localeCompare(left.document.updatedAt));

  return { byWikiTarget, byMarkdownTitleLower, byMarkdownTitleExact, byExactTitle, byFilePath, wikiSuggestions };
};

// ─── Internal helpers (not exported) ───

const isDiscardableMermaidSource = (source: string) => {
  const trimmed = source.trim();
  return !trimmed || /^`{1,3}(?:\s*mermaid)?\s*`{0,3}$/i.test(trimmed) || /^mermaid\s*`{0,3}$/i.test(trimmed);
};

const detailsFromSource = (source: string) => {
  const trimmed = source.trim();
  const calloutMatch = trimmed.match(/^>\s*\[![A-Za-z0-9_-]+]-\s*(.*?)\s*\n?([\s\S]*)$/);
  if (calloutMatch) {
    const text = calloutMatch[2]
      .split("\n")
      .map((line) => line.replace(/^>\s?/, ""))
      .join("\n")
      .trim();
    return { summary: plainText(calloutMatch[1] || "Summary"), text };
  }
  const match = trimmed.match(/^<details(?:\s[^>]*)?>\s*<summary>([\s\S]*?)<\/summary>\s*([\s\S]*?)\s*<\/details>$/i);
  return { summary: plainText(match?.[1] ?? "Summary"), text: plainText(match?.[2] ?? trimmed) };
};

const calloutFromSource = (source: string) => {
  const match = source.trim().match(/^>\s*\[!([A-Za-z0-9_-]+)]\s*(.*?)\s*\n?([\s\S]*)$/);
  const title = (match?.[1] ?? "NOTE").toUpperCase();
  const firstLine = match?.[2]?.trim();
  const body = match ? [firstLine, match[3]].filter(Boolean).join("\n") : source;
  const text = body
    .split("\n")
    .map((line) => line.replace(/^>\s?/, ""))
    .join("\n")
    .trim();
  return { title, text };
};

export const normalizeCodeLanguage = (value: string) => {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return "plaintext";
  return codeLanguageAliases[normalized] ?? normalized;
};

export const codeLanguageAliases: Record<string, string> = {
  text: "plaintext",
  txt: "plaintext",
  plain: "plaintext",
  plaintext: "plaintext",
  js: "javascript",
  jsx: "jsx",
  ts: "typescript",
  py: "python",
  sh: "bash",
  yml: "yaml"
};

export const resolveReferencedDocuments = (message: string, documentLookupIndex: DocumentLookupIndex) => {
  const names = Array.from(message.matchAll(/\[\[([^\]\n|]+)(?:\|[^\]\n]+)?\]\]/g)).map((match) => match[1].trim().toLowerCase());
  const uniqueNames = Array.from(new Set(names));
  return uniqueNames
    .map((name) => documentLookupIndex.byMarkdownTitleLower.get(name))
    .filter((document): document is InformioDocument => Boolean(document));
};

export const findDocumentForActionPath = (path: string, documentLookupIndex: DocumentLookupIndex) =>
  documentLookupIndex.byFilePath.get(path)
  ?? documentLookupIndex.byExactTitle.get(path)
  ?? documentLookupIndex.byMarkdownTitleExact.get(markdownTitle(path));

export const collectWikiSuggestions = (documentLookupIndex: DocumentLookupIndex, query: string) => {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return documentLookupIndex.wikiSuggestions.slice(0, 8).map((item) => item.document);

  const startsWith: InformioDocument[] = [];
  const contains: InformioDocument[] = [];
  documentLookupIndex.wikiSuggestions.forEach((item) => {
    if (!item.lowerLabel.includes(normalizedQuery)) return;
    if (item.lowerLabel.startsWith(normalizedQuery)) {
      if (startsWith.length < 8) startsWith.push(item.document);
      return;
    }
    contains.push(item.document);
  });
  return [...startsWith, ...contains].slice(0, 8);
};

// ─── NodeView helpers ───

export const isSelectionInsideNode = (editor: Editor, getPos: NodeViewPositionGetter, node: NodeViewNode) => {
  const position = getPos();
  if (typeof position !== "number") return false;
  const from = position;
  const to = position + node.nodeSize;
  const selection = editor.state.selection;
  return selection.from > from && selection.to < to;
};

export const useNodeLivePreviewState = (editor: Editor, getPos: NodeViewPositionGetter, node: NodeViewNode, selected: boolean) => {
  const getActive = () => editor.isFocused && (selected || isSelectionInsideNode(editor, getPos, node));
  const [active, setActive] = useState(getActive);

  useEffect(() => {
    const update = () => setActive(getActive());
    editor.on("selectionUpdate", update);
    editor.on("update", update);
    editor.on("focus", update);
    editor.on("blur", update);
    update();
    return () => {
      editor.off("selectionUpdate", update);
      editor.off("update", update);
      editor.off("focus", update);
      editor.off("blur", update);
    };
  }, [editor, getPos, node, selected]);

  return active;
};

export const focusNodeSource = (editor: Editor, getPos: NodeViewPositionGetter) => {
  const position = getPos();
  if (typeof position !== "number") return;
  editor.chain().focus().setTextSelection(position + 1).run();
};
