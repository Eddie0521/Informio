import { useEffect, useMemo, useRef, useState, lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore, useDocumentStore, useAgentStore } from "../stores";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from "react";
import type { Editor, JSONContent } from "@tiptap/core";
import { useEditor, EditorContent, ReactNodeViewRenderer } from "@tiptap/react";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { TableMap } from "@tiptap/pm/tables";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Markdown } from "@tiptap/markdown";
import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight";
import Highlight from "@tiptap/extension-highlight";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import {
  Bold,
  ChevronDown,
  ChevronRight,
  Highlighter,
  Italic,
  Link2,
  Replace,
  Search,
  Strikethrough,
  Subscript as SubscriptIcon,
  Superscript as SuperscriptIcon,
  Underline as UnderlineIcon,
  X
} from "lucide-react";
import type {
  AppSettings,
  InformioDocument,
  EditorPaneState,
  EditorViewMode,
  OutlineJumpRequest,
  OutlineItem,
  OutlineTreeItem,
  AgentSelection,
  EditorTextSearchIndex,
  FindMatch,
  FrontmatterParseResult,
  SelectionToolbarAction,
  InsertToolbarAction,
  LinkRequest,
  ImageRequest,
  SecretPromptRequest,
  PendingSecretAction,
  SecretDecryptRequest,
  DocumentLookupIndex,
  MenuCommand,
  PdfSelectionRect,
  TableColumnWidthInfo,
  UnifiedToolbarTranslateState,
  ProseMirrorSchemaLike,
  ProseMirrorNodeLike,
  MarkdownAutoBlockMatch,
  MarkdownTextBlock,
  EncryptedTextOptions,
  WikiLinkOptions
} from "../types";
import {
  selectionToolbarSafeAreaSelector,
  EDITOR_CONTENT_MIN_WIDTH,
  EDITOR_CONTENT_MAX_WIDTH,
  TABLE_CELL_MIN_WIDTH,
  TABLE_EDGE_COMPRESS_MIN_WIDTH
} from "../constants";
import { cn } from "../lib/utils";
import { pathBaseName } from "../lib/path";
import { markdownToStatusText, countWords, countCharacters, countLines } from "../lib/text-stats";
import { getDocumentOutline, buildOutlineTree } from "../lib/outline";
import { normalizeEditorPanes, formatRelative, clamp, sameAgentSelection, samePdfSelectionRects, buildEditorTextSearchIndex, findNextTextMatch } from "../lib/editor-utils";
import { isInternalDocumentDrag, documentStructureKey } from "../lib/file-tree";
import {
  documentKind,
  isEmbeddableAssetDocument,
  isWritableTextDocument,
  imageExtensionFromMimeType
} from "../lib/file-type";
import {
  documentSecretPassphraseCache,
  secretAttrsAreValid,
  encryptSecretMarkdown,
  decryptSecretMarkdown,
  serializeSelectionFragmentToMarkdown,
  parseInlineMarkdownContent,
  selectionShouldUseBlockSecret,
  selectionContainsSecretNode,
  findFirstValidSecretInDocument,
  documentContainsSecretNode
} from "../lib/encryption";
import { wikilinkLabel, plainText } from "../lib/markdown";
import {
  parseFrontmatter,
  composeMarkdownWithFrontmatter
} from "../lib/frontmatter";
import {
  defaultBlockSource,
  sourceBackedBlockJson,
  markdownOffsetForLine,
  buildDocumentLookupIndex,
  collectWikiSuggestions,
  lowlight,
  sourceBackedNode,
  textContentNode,
  parseMarkdownTableRow,
  isMarkdownTableSeparator,
  createTableFromMarkdown
} from "../lib/markdown-block-parser";
import {
  clipboardPlainTextForPaste,
  insertTextIntoTextarea,
  stripClipboardFragmentMarkers
} from "../lib/clipboardPaste";
import { ResizableImage } from "../extensions/image";
import { ResizableTableRow, AlignableTableHeader, AlignableTableCell, RichTable, TableStructureKeymap } from "../extensions/table";
import { EncryptedInline, EncryptedBlock } from "../extensions/encrypted";
import { WikiLink } from "../extensions/wiki-link";
import { MarkdownLink } from "../extensions/markdown-link";
import { SubscriptMark, SuperscriptMark } from "../extensions/script-marks";
import { UnderlineMark } from "../extensions/underline-mark";
import { MathInline, MathBlock } from "../extensions/math";
import { ChartBlock } from "../extensions/chart";
import { MediaBlock } from "../extensions/media";
import { PdfBlock } from "../extensions/pdf";
import { DetailsBlock } from "../extensions/details";
import { CalloutBlock } from "../extensions/callout";
import { FootnoteBlock } from "../extensions/footnote";
import { TyporaMarkdownInput } from "../extensions/typora-markdown-input";
import { SelectionToolbar } from "./SelectionToolbar";
import { SelectionTranslateSection } from "./SelectionTranslateSection";
import { InsertToolbar, markSelectionToolbarInteraction, isSelectionToolbarInteractionActive } from "./InsertToolbar";
import { CodeBlockView } from "./CodeBlockView";
import { AssetViewerSurface } from "./AssetViewerSurface";
import { TableControls } from "./TableControls";
import { LinkDialog } from "./LinkDialog";
import { ImageDialog } from "./ImageDialog";
import { SecretPassphraseDialog } from "./SecretPassphraseDialog";
import { PropertiesPanel } from "./PropertiesPanel";
import { PdfEditorContext as UnifiedPdfEditorContext, PdfViewerSurface as UnifiedPdfViewerSurface } from "../pdfSurface";
import type { UnifiedPdfEditorContextValue } from "../types";

const SpreadsheetViewerSurface = lazy(() =>
  import("../spreadsheetSurface").then((module) => ({ default: module.SpreadsheetViewerSurface }))
);

const mathTextFromSource = (source: string) => {
  const trimmed = source.trim();
  const match =
    trimmed.match(/^\$\$\s*\n?([\s\S]*?)\n?\$\$$/) ??
    trimmed.match(/^\$(?!\$)([^\n$]+?)\$(?!\$)/);
  return (match?.[1] ?? source).trim();
};

const INLINE_MATH_BOUNDARY = String.raw`(?=$|[\s,.;:!?，。；：！？、)\]）】」』》])`;
const INLINE_MATH_AUTO_REGEX = new RegExp(String.raw`(^|[^\$])\$([^\n$]+?)\$(?!\$)` + INLINE_MATH_BOUNDARY, "g");
const isSkippableInlineMathContent = (content: string) => !content || /^\d+(?:\.\d+)?$/.test(content);

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

const footnoteFromSource = (source: string) => {
  const match = source.trim().match(/^\[\^([^\]]+)]:\s*([\s\S]*)$/);
  return { index: match?.[1] ?? "1", text: match?.[2]?.trim() ?? source.trim() };
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

const codeBlockFromFence = (schema: ProseMirrorSchemaLike, language: string, lines: string[]) =>
  schema.nodes.codeBlock.create({ language: language.trim() || "plaintext" }, textContentNode(schema, lines.join("\n")));

const isPlainParagraph = (block: MarkdownTextBlock) => block.node.type.name === "paragraph";

const topLevelTextBlocks = (doc: ProseMirrorNodeLike): MarkdownTextBlock[] => {
  const blocks: MarkdownTextBlock[] = [];
  doc.forEach((node, offset) => {
    if (node.isTextblock) {
      blocks.push({ node, pos: offset, text: node.textContent });
    }
  });
  return blocks;
};

const getSelectionToolbarActions = (t: (key: string) => string): SelectionToolbarAction[] => [
  { id: "bold", label: t("editorpane.bold"), icon: Bold },
  { id: "italic", label: t("editorpane.italic"), icon: Italic },
  { id: "underline", label: t("editorpane.underline"), icon: UnderlineIcon },
  { id: "strike", label: t("editorpane.strikethrough"), icon: Strikethrough },
  { id: "subscript", label: t("editorpane.subscript"), icon: SubscriptIcon },
  { id: "superscript", label: t("editorpane.superscript"), icon: SuperscriptIcon },
  { id: "highlight", label: t("editorpane.highlight"), icon: Highlighter },
  { id: "link", label: t("editorpane.addLink"), icon: Link2 }
];

const InformioCodeBlock = CodeBlockLowlight.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView);
  }
});

const INVALID_AUTO_LINK_CHAR_PATTERN = /[\u3400-\u9fff\uf900-\ufaff，。！？；：、（）【】《》“”‘’]/;

const applyMarkdownAutoBlock = (editor: Editor) => {
  const schema = editor.state.schema as unknown as ProseMirrorSchemaLike;
  const doc = editor.state.doc as unknown as ProseMirrorNodeLike;
  const match = markdownAutoBlockMatch(schema, doc) ?? markdownAutoInlineMathMatch(schema, doc);
  if (!match) return false;

  const transaction = editor.state.tr.replaceWith(match.from, match.to, match.node as never);
  transaction.setMeta("addToHistory", true);
  editor.view.dispatch(transaction);

  const insertedTo = match.from + match.node.nodeSize;
  const wantedSelection = match.selectAfterNode
    ? insertedTo
    : match.selectionOffset === undefined
      ? insertedTo
      : match.from + 1 + match.selectionOffset;
  const selectionPosition = match.selectAfterNode
    ? insertedTo
    : clamp(wantedSelection, match.from + 1, Math.max(match.from + 1, insertedTo - 1));
  window.setTimeout(() => {
    if (!editor.isDestroyed) editor.commands.setTextSelection(selectionPosition);
  }, 0);
  return true;
};

const documentLookupKey = (documents: InformioDocument[], excludedSuggestionDocumentId?: string) =>
  `${excludedSuggestionDocumentId ?? ""}::${documentStructureKey(documents)}`;

const tablePosFromDom = (editor: Editor, table: HTMLTableElement) => {
  const firstCell = table.querySelector("th, td");
  if (firstCell instanceof HTMLTableCellElement) {
    let cellPos: number | null = null;
    try {
      const contentPos = editor.view.posAtDOM(firstCell, 0);
      const nextCellPos = Math.max(0, contentPos - 1);
      const node = editor.state.doc.nodeAt(nextCellPos);
      if (node?.type.name === "tableCell" || node?.type.name === "tableHeader") cellPos = nextCellPos;
    } catch (error) {
      console.warn("Failed to resolve table cell position:", error);
      cellPos = null;
    }
    if (cellPos !== null) {
      const $cell = editor.state.doc.resolve(cellPos);
      for (let depth = $cell.depth; depth > 0; depth -= 1) {
        if ($cell.node(depth).type.name === "table") return $cell.before(depth);
      }
    }
  }
  return null;
};

const measureNaturalTableColumnWidthInfo = (
  editor: Editor,
  table: HTMLTableElement,
  tablePos: number,
  columns: HTMLElement[]
): TableColumnWidthInfo[] => {
  const previousInlineFit = table.dataset.inlineFit;
  const previousTableWidth = table.style.width;
  const previousColumnWidths = columns.map((column) => column.style.width);

  try {
    delete table.dataset.inlineFit;
    table.style.width = "";
    columns.forEach((column) => {
      column.style.width = "";
    });
    return tableColumnWidthInfo(editor, table, tablePos);
  } finally {
    if (previousInlineFit === undefined) delete table.dataset.inlineFit;
    else table.dataset.inlineFit = previousInlineFit;
    table.style.width = previousTableWidth;
    columns.forEach((column, index) => {
      column.style.width = previousColumnWidths[index] ?? "";
    });
  }
};


const markdownAutoBlockMatch = (schema: ProseMirrorSchemaLike, doc: ProseMirrorNodeLike): MarkdownAutoBlockMatch | null => {
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

const markdownAutoInlineMathMatch = (schema: ProseMirrorSchemaLike, doc: ProseMirrorNodeLike): MarkdownAutoBlockMatch | null => {
  let found: MarkdownAutoBlockMatch | null = null;
  doc.descendants?.((node, pos, parent) => {
    if (found) return false;
    if (!node.isText || !node.text) return;
    const parentName = parent?.type.name ?? "";
    if (!["paragraph", "heading", "listItem", "tableCell", "tableHeader"].includes(parentName)) return;

    const matches = Array.from(node.text.matchAll(INLINE_MATH_AUTO_REGEX));
    for (const match of matches) {
      const content = match[2]?.trim() ?? "";
      if (isSkippableInlineMathContent(content)) continue;
      const prefix = match[1] ?? "";
      const source = `$${match[2]}$`;
      const from = pos + (match.index ?? 0) + prefix.length;
      found = {
        from,
        to: from + source.length,
        node: schema.nodes.mathInline.create({ source }, textContentNode(schema, source)),
        selectAfterNode: true
      };
      return false;
    }
  });
  return found;
};

const tableCellPosAt = (tableNode: ProseMirrorNode, tablePos: number, rowIndex: number, columnIndex: number): number | null => {
  const map = TableMap.get(tableNode);
  const index = rowIndex * map.width + columnIndex;
  if (index >= map.map.length) return null;
  return tablePos + 1 + map.map[index];
};

const tableColumnWidthInfo = (editor: Editor, table: HTMLTableElement, tablePos: number): TableColumnWidthInfo[] => {
  const tableNode = editor.state.doc.nodeAt(tablePos);
  if (tableNode?.type.name !== "table") return [];

  const map = TableMap.get(tableNode);
  const fallbackWidths = Array.from(table.querySelectorAll("colgroup col")).map((column) => {
    const width = Number.parseFloat(window.getComputedStyle(column).width);
    return Number.isFinite(width) && width > 0 ? width : TABLE_CELL_MIN_WIDTH;
  });

  const widths = Array.from({ length: map.width }, (_, index) => ({
    width: fallbackWidths[index] ?? TABLE_CELL_MIN_WIDTH,
    fixed: false
  }));

  const tableStart = tablePos + 1;
  for (let rowIndex = 0; rowIndex < map.height; rowIndex += 1) {
    for (let columnIndex = 0; columnIndex < map.width; columnIndex += 1) {
      if (widths[columnIndex].fixed) continue;
      const cellPos = tableCellPosAt(tableNode, tablePos, rowIndex, columnIndex);
      if (cellPos === null) continue;

      const cellNode = editor.state.doc.nodeAt(cellPos);
      if (!cellNode) continue;

      const rect = map.findCell(cellPos - tableStart);
      const colwidth = Array.isArray(cellNode.attrs.colwidth) ? cellNode.attrs.colwidth : [];
      const width = Number(colwidth[columnIndex - rect.left] ?? 0);
      if (!Number.isFinite(width) || width <= 0) continue;

      widths[columnIndex] = { width, fixed: true };
    }
  }

  return widths;
};


function EditorPane({
  paneId,
  documentId,
  onOutlineJumpHandled,
  onChange,
  onOpenInternalLink,
  onCreateInternalLink,
  onSelection,
  onCompositionChange,
  onDirtyChange,
  toolbarEnabled,
  onTranslateSelection,
  onClearToolbarTranslate
}: {
  paneId: EditorPaneState["id"];
  documentId: string;
  onOutlineJumpHandled: (request: OutlineJumpRequest) => void;
  onChange: (documentId: string, markdown: string, options?: { composing?: boolean }) => void;
  onOpenInternalLink: (documentId: string, sourcePaneId: EditorPaneState["id"]) => void;
  onCreateInternalLink: (title: string) => void;
  onSelection: (selection: AgentSelection | null) => void;
  onCompositionChange: (documentId: string, composing: boolean) => void;
  onDirtyChange: (documentId: string, dirty: boolean) => void;
  toolbarEnabled: boolean;
  onTranslateSelection: (selection: AgentSelection) => void;
  onClearToolbarTranslate: () => void;
}) {
  const { t } = useTranslation();
  const { data } = useAppStore();
  const { editorViewModes, outlineJumpRequest } = useDocumentStore();
  const { toolbarTranslate } = useAgentStore();
  const documents = data?.documents ?? [];
  const settings = data?.settings!;
  const document = documents.find((d) => d.id === documentId) ?? documents[0];
  const viewMode = editorViewModes[paneId] ?? "rich-text";
  const composingRef = useRef(false);
  const applyingMarkdownAutoBlockRef = useRef(false);
  const markdownAutoBlockTimerRef = useRef<number | null>(null);
  const sourceTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const editorScrollTimerRef = useRef<number | null>(null);
  const editorInstanceRef = useRef<Editor | null>(null);
  const findQueryInputRef = useRef<HTMLInputElement | null>(null);
  const shellRef = useRef<HTMLElement | null>(null);
  const contentColumnRef = useRef<HTMLDivElement | null>(null);
  const syncedDocumentIdRef = useRef<string | null>(null);
  const markdownToolbarRef = useRef<AgentSelection | null>(null);
  const pendingSecretActionRef = useRef<PendingSecretAction | null>(null);
  const requestDecryptSecretRef = useRef<(request: SecretDecryptRequest) => void>(() => undefined);
  const [linkRequest, setLinkRequest] = useState<LinkRequest | null>(null);
  const [imageRequest, setImageRequest] = useState<ImageRequest | null>(null);
  const [secretPromptRequest, setSecretPromptRequest] = useState<SecretPromptRequest | null>(null);
  const [markdownToolbar, setMarkdownToolbar] = useState<AgentSelection | null>(null);
  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const [wikiSuggest, setWikiSuggest] = useState<{ query: string; from: number; to: number; left: number; top: number } | null>(null);
  const [wikiIndex, setWikiIndex] = useState(0);
  const [findOpen, setFindOpen] = useState(false);
  const [showReplace, setShowReplace] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [replaceQuery, setReplaceQuery] = useState("");
  const [findMatch, setFindMatch] = useState<FindMatch | null>(null);
  const [findStatus, setFindStatus] = useState<string | null>(null);
  const [editorScrolling, setEditorScrolling] = useState(false);
  const frontmatter = useMemo(() => parseFrontmatter(document.markdown), [document.markdown]);
  const editorMarkdown = frontmatter.body;
  const activeDocumentKind = documentKind(document);
  const isPdfDocument = activeDocumentKind === "pdf";
  const isSpreadsheetDocument = activeDocumentKind === "spreadsheet";
  const isAssetDocument = isEmbeddableAssetDocument(document);
  const isReadOnlyDocument = !isWritableTextDocument(document);
  const isSourceMode = !isReadOnlyDocument && viewMode === "source";
  const documentLinkIndexKey = useMemo(
    () => documentLookupKey(documents, document.id),
    [documents]
  );
  const documentLookupIndex = useMemo(() => buildDocumentLookupIndex(documents, document.id), [documentLinkIndexKey]);
  const closeSecretPrompt = () => {
    pendingSecretActionRef.current = null;
    setSecretPromptRequest(null);
  };
  const cachedSecretPassphrase = () => documentSecretPassphraseCache.get(document.id) ?? null;
  const cacheSecretPassphrase = (passphrase: string) => {
    documentSecretPassphraseCache.set(document.id, passphrase);
  };
  const clearSecretPassphrase = () => {
    documentSecretPassphraseCache.delete(document.id);
  };
  const applyEncryptedSelection = async (currentEditor: Editor, action: Extract<PendingSecretAction, { type: "encrypt" }>, passphrase: string) => {
    if (selectionContainsSecretNode(currentEditor, action.from, action.to)) {
      window.alert(t("editorpane.encryptedInSelection"));
      return;
    }

    const markdown = serializeSelectionFragmentToMarkdown(currentEditor, action.from, action.to, action.kind);
    const attrs = await encryptSecretMarkdown(markdown, passphrase, action.kind);
    currentEditor
      .chain()
      .focus()
      .insertContentAt(
        { from: action.from, to: action.to },
        action.kind === "inline"
          ? { type: "encryptedInline", attrs }
          : { type: "encryptedBlock", attrs }
      )
      .run();
  };
  const applyDecryptedSecret = async (currentEditor: Editor, request: SecretDecryptRequest, passphrase: string) => {
    const node = currentEditor.state.doc.nodeAt(request.pos);
    if (!node) return;
    const range = { from: request.pos, to: request.pos + node.nodeSize };
    const markdown = await decryptSecretMarkdown(request.attrs, passphrase);

    if (request.kind === "inline") {
      currentEditor.chain().focus().insertContentAt(range, parseInlineMarkdownContent(currentEditor, markdown)).run();
      return;
    }

    currentEditor.chain().focus().insertContentAt(range, markdown, { contentType: "markdown" }).run();
  };
  const beginEncryptSelection = async () => {
    const currentEditor = editorInstanceRef.current;
    if (!currentEditor || currentEditor.isDestroyed || isReadOnlyDocument || isSourceMode) return;
    const { from, to, empty } = currentEditor.state.selection;
    if (empty) return;
    if (selectionContainsSecretNode(currentEditor, from, to)) {
      window.alert(t("editorpane.encryptedInSelection"));
      return;
    }

    const action: Extract<PendingSecretAction, { type: "encrypt" }> = {
      type: "encrypt",
      from,
      to,
      kind: selectionShouldUseBlockSecret(currentEditor) ? "block" : "inline"
    };

    const cachedPassphrase = cachedSecretPassphrase();
    if (cachedPassphrase) {
      await applyEncryptedSelection(currentEditor, action, cachedPassphrase);
      return;
    }

    if (documentContainsSecretNode(currentEditor)) {
      const verifyAttrs = findFirstValidSecretInDocument(currentEditor);
      if (!verifyAttrs) {
        window.alert(t("editorpane.corruptedEncryption"));
        return;
      }
      pendingSecretActionRef.current = { ...action, verifyAttrs };
      setSecretPromptRequest({ mode: "unlock-passphrase", intent: "encrypt" });
      return;
    }

    pendingSecretActionRef.current = action;
    setSecretPromptRequest({ mode: "set-passphrase" });
  };
  const beginDecryptSecret = async (request: SecretDecryptRequest) => {
    const currentEditor = editorInstanceRef.current;
    if (!currentEditor || currentEditor.isDestroyed || !secretAttrsAreValid(request.attrs)) return;
    pendingSecretActionRef.current = { type: "decrypt", request };
    setSecretPromptRequest({ mode: "unlock-passphrase", intent: "decrypt" });
  };
  requestDecryptSecretRef.current = (request) => {
    void beginDecryptSecret(request);
  };
  const confirmSecretPrompt = async ({ passphrase, confirmPassphrase }: { passphrase: string; confirmPassphrase?: string }) => {
    const currentEditor = editorInstanceRef.current;
    const pendingAction = pendingSecretActionRef.current;
    if (!currentEditor || currentEditor.isDestroyed || !pendingAction) {
      closeSecretPrompt();
      return;
    }

    if (secretPromptRequest?.mode === "set-passphrase") {
      if (!confirmPassphrase || passphrase !== confirmPassphrase) {
        setSecretPromptRequest({ mode: "set-passphrase", error: t("editorpane.passphraseMismatch") });
        return;
      }
      try {
        cacheSecretPassphrase(passphrase);
        await applyEncryptedSelection(currentEditor, pendingAction as Extract<PendingSecretAction, { type: "encrypt" }>, passphrase);
        closeSecretPrompt();
      } catch (error) {
        clearSecretPassphrase();
        setSecretPromptRequest({ mode: "set-passphrase", error: error instanceof Error ? error.message : t("editorpane.encryptionFailed") });
      }
      return;
    }

    if (pendingAction.type === "encrypt") {
      try {
        if (pendingAction.verifyAttrs) await decryptSecretMarkdown(pendingAction.verifyAttrs, passphrase);
        cacheSecretPassphrase(passphrase);
        await applyEncryptedSelection(currentEditor, pendingAction, passphrase);
        closeSecretPrompt();
      } catch (error) {
        console.warn("Secret encryption verification failed:", error);
        clearSecretPassphrase();
        setSecretPromptRequest({ mode: "unlock-passphrase", intent: "encrypt", error: t("editorpane.passphraseIncorrectVerify") });
      }
      return;
    }

    try {
      cacheSecretPassphrase(passphrase);
      await applyDecryptedSecret(currentEditor, pendingAction.request, passphrase);
      closeSecretPrompt();
    } catch (error) {
      console.warn("Secret decryption failed:", error);
      clearSecretPassphrase();
      setSecretPromptRequest({ mode: "unlock-passphrase", intent: "decrypt", error: t("editorpane.passphraseIncorrectDecrypt") });
    }
  };
  const updateWikiSuggestion = (currentEditor: Editor) => {
    const { from, to } = currentEditor.state.selection;
    if (from !== to) {
      setWikiSuggest(null);
      return;
    }
    const before = currentEditor.state.doc.textBetween(Math.max(0, from - 80), from, "\n");
    const match = before.match(/\[\[([^\]\n]*)$/);
    if (!match) {
      setWikiSuggest(null);
      return;
    }
    const start = from - match[0].length;
    const coords = currentEditor.view.coordsAtPos(from);
    setWikiSuggest({ query: match[1].toLowerCase(), from: start, to: from, left: coords.left, top: coords.bottom + 8 });
    setWikiIndex(0);
  };
  const emitMarkdownSelection = (currentEditor: Editor) => {
    if (isReadOnlyDocument) return;
    const domSelection = typeof window !== "undefined" ? window.getSelection() : null;
    const editorDom = currentEditor.view.dom;
    if (!domSelection || domSelection.rangeCount === 0 || domSelection.isCollapsed) {
      if (isSelectionToolbarInteractionActive()) return;
      setMarkdownToolbar(null);
      onSelection(null);
      return;
    }
    const anchorNode = domSelection.anchorNode;
    const focusNode = domSelection.focusNode;
    if ((!anchorNode || !editorDom.contains(anchorNode)) && (!focusNode || !editorDom.contains(focusNode))) return;

    const { from, to } = currentEditor.state.selection;
    const text = from === to ? "" : domSelection.toString().trim();
    if (!text) {
      if (isSelectionToolbarInteractionActive()) return;
      setMarkdownToolbar(null);
      onSelection(null);
      return;
    }

    const markdown = composeMarkdownWithFrontmatter(frontmatter, currentEditor.getMarkdown());
    const markdownIndex = markdown.indexOf(text);
    const rangeRect = domSelection.getRangeAt(0).getBoundingClientRect();
    const nextSelection: AgentSelection = {
      kind: "markdown",
      documentId: document.id,
      from: markdownIndex,
      to: markdownIndex >= 0 ? markdownIndex + text.length : -1,
      text,
      markdown,
      overlayLeft: clamp(rangeRect.left + rangeRect.width / 2 - 72, 12, window.innerWidth - 220),
      overlayTop: Math.max(12, rangeRect.top - 52)
    };
    setMarkdownToolbar((current) => (sameAgentSelection(current, nextSelection) ? current : nextSelection));
    onSelection(nextSelection);
  };
  const scheduleMarkdownSelectionCapture = (currentEditor: Editor) => {
    window.setTimeout(() => {
      if (currentEditor.isDestroyed) return;
      emitMarkdownSelection(currentEditor);
    }, 0);
  };
  const clearMarkdownToolbarState = (options: { preserveDomSelection?: boolean } = {}) => {
    setMarkdownToolbar(null);
    onClearToolbarTranslate();
    onSelection(null);
    if (!options.preserveDomSelection) window.getSelection()?.removeAllRanges();
  };
  const editorExtensions = useMemo(
    () => [
      StarterKit.configure({
        codeBlock: false,
        link: false,
        underline: false
      }),
      InformioCodeBlock.configure({
        lowlight,
        defaultLanguage: "plaintext",
        enableTabIndentation: true,
        tabSize: settings.markdown.tabSize
      }),
      Highlight,
      TyporaMarkdownInput,
      ResizableImage.configure({
        assetBasePath: document.filePath || settings.shortcuts.quickFolder,
        HTMLAttributes: { class: "informio-image" },
        resize: {
          enabled: true,
          directions: ["bottom-right"],
          minWidth: 120,
          minHeight: 80,
          alwaysPreserveAspectRatio: true
        }
      } as never),
      MarkdownLink.configure({
        autolink: true,
        defaultProtocol: "https",
        enableClickSelection: true,
        isAllowedUri: (url, context) => !INVALID_AUTO_LINK_CHAR_PATTERN.test(url) && context.defaultValidate(url),
        openOnClick: false
      }),
      EncryptedInline.configure({ onRequestDecrypt: (request) => requestDecryptSecretRef.current(request) }),
      EncryptedBlock.configure({ onRequestDecrypt: (request) => requestDecryptSecretRef.current(request) }),
      RichTable.configure({
        resizable: false,
        renderWrapper: true,
        cellMinWidth: TABLE_CELL_MIN_WIDTH,
        allowTableNodeSelection: true,
        HTMLAttributes: { class: "informio-table" }
      }),
      ResizableTableRow,
      AlignableTableHeader,
      AlignableTableCell,
      TableStructureKeymap,
      TaskList,
      TaskItem.configure({ nested: true }),
      SubscriptMark,
      SuperscriptMark,
      UnderlineMark,
      WikiLink.configure({
        documentLookupIndex,
        currentDocument: document,
        onOpen: (documentId: string) => onOpenInternalLink(documentId, paneId),
        onCreate: onCreateInternalLink
      }),
      MathInline,
      MathBlock,
      ChartBlock,
      MediaBlock.configure({ assetBasePath: document.filePath || settings.shortcuts.quickFolder }),
      PdfBlock,
      DetailsBlock,
      CalloutBlock,
      FootnoteBlock,
      Markdown.configure({ indentation: { style: "space", size: settings.markdown.tabSize } }),
      Placeholder.configure({ placeholder: t("editorpane.placeholder") })
    ],
    [document, documentLookupIndex, onCreateInternalLink, onOpenInternalLink, paneId, settings.markdown.tabSize, t]
  );
  const editor = useEditor(
    {
      extensions: editorExtensions,
      content: editorMarkdown,
      contentType: "markdown",
      editable: !isReadOnlyDocument,
      editorProps: {
        clipboardTextSerializer: (slice) => slice.content.textBetween(0, slice.content.size, "\n"),
        attributes: {
          class: "informio-editor prose prose-slate max-w-none focus:outline-none",
          spellcheck: String(settings.editor.spellcheck)
        },
        handleDOMEvents: {
          dragover: (_view, event) => {
            if (!isInternalDocumentDrag(event.dataTransfer)) return false;
            event.preventDefault();
            event.stopPropagation();
            return true;
          },
          drop: (_view, event) => {
            if (!isInternalDocumentDrag(event.dataTransfer)) return false;
            event.preventDefault();
            event.stopPropagation();
            return true;
          },
          mouseup: () => {
            if (isReadOnlyDocument) return false;
            const instance = editorInstanceRef.current;
            if (!instance || instance.isDestroyed) return false;
            scheduleMarkdownSelectionCapture(instance);
            return false;
          },
          keydown: (view, event) => {
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return false;
            const selection = view.state.selection;
            if (!selection.empty) return false;
            const resolved = selection.$from;
            for (let depth = resolved.depth; depth > 0; depth -= 1) {
              const node = resolved.node(depth);
              if (node.type.name !== "mathInline") continue;
              const start = resolved.before(depth);
              const offset = selection.from - start - 1;
              const atStart = offset <= 0;
              const atEnd = offset >= node.textContent.length;
              if ((event.key === "ArrowLeft" && !atStart) || (event.key === "ArrowRight" && !atEnd)) return false;
              event.preventDefault();
              editorInstanceRef.current?.commands.setTextSelection(event.key === "ArrowLeft" ? start : start + node.nodeSize);
              return true;
            }
            return false;
          },
          compositionstart: () => {
            composingRef.current = true;
            onCompositionChange(document.id, true);
            return false;
          },
          compositionend: () => {
            composingRef.current = false;
            onCompositionChange(document.id, false);
            return false;
          },
          paste: (view, event) => {
            const files = Array.from(event.clipboardData?.files ?? []).filter((file) => file.type.startsWith("image/"));
            if (!files.length) return false;

            event.preventDefault();
            files.forEach(async (file, index) => {
              const extension = imageExtensionFromMimeType(file.type);
              const fileName = file.name || `pasted-image-${Date.now()}-${index + 1}.${extension}`;
              const result = await window.informio.saveAttachment({
                documentId: document.id,
                fileName,
                mimeType: file.type,
                data: await file.arrayBuffer()
              });
              editor
                ?.chain()
                .focus()
                .setImage({ src: result.markdownPath, alt: result.fileName, title: result.fileName })
                .createParagraphNear()
                .run();
            });

            return true;
          },
          click: (_view, event) => {
            const target = event.target as HTMLElement;
            const anchor = target.closest("a");
            if (!anchor) return false;
            if (event.metaKey || event.ctrlKey) {
              event.preventDefault();
              const href = anchor.getAttribute("href");
              if (href?.startsWith("informio://pdf-annotation/")) {
                return true;
              } else if (href) {
                window.informio.openExternal(href);
              }
              return true;
            }
            return false;
          },
          dblclick: (view, event) => {
            if (isReadOnlyDocument) return false;
            const target = event.target as HTMLElement;
            const image = target.closest("img.informio-image");
            if (!image) return false;

            let imagePos: number | null = null;
            try {
              const domPos = view.posAtDOM(image, 0);
              for (const candidate of [domPos, domPos - 1, domPos + 1]) {
                const node = candidate >= 0 ? view.state.doc.nodeAt(candidate) : null;
                if (node?.type.name === "image") {
                  imagePos = candidate;
                  break;
                }
              }
            } catch (error) {
              console.warn("Failed to resolve image position from DOM:", error);
              imagePos = null;
            }
            if (imagePos === null) return false;

            const node = view.state.doc.nodeAt(imagePos);
            if (node?.type.name !== "image") return false;
            event.preventDefault();
            editorInstanceRef.current?.chain().focus().setNodeSelection(imagePos).run();
            setImageRequest({
              pos: imagePos,
              alt: String(node.attrs.alt ?? ""),
              src: String(node.attrs.src ?? ""),
              title: String(node.attrs.title ?? "")
            });
            return true;
          },
          keyup: () => {
            if (isReadOnlyDocument) return false;
            const instance = editorInstanceRef.current;
            if (!instance || instance.isDestroyed) return false;
            scheduleMarkdownSelectionCapture(instance);
            return false;
          }
        }
      },
      onUpdate: ({ editor }) => {
        if (isReadOnlyDocument) return;
        const composing = composingRef.current || editor.view.composing;
        if (!composing && !applyingMarkdownAutoBlockRef.current) {
          if (markdownAutoBlockTimerRef.current !== null) window.clearTimeout(markdownAutoBlockTimerRef.current);
          markdownAutoBlockTimerRef.current = window.setTimeout(() => {
            markdownAutoBlockTimerRef.current = null;
            if (editor.isDestroyed || composingRef.current || editor.view.composing || applyingMarkdownAutoBlockRef.current) return;
            applyingMarkdownAutoBlockRef.current = true;
            applyMarkdownAutoBlock(editor);
            applyingMarkdownAutoBlockRef.current = false;
          }, 0);
        }
        updateWikiSuggestion(editor);
        onChange(document.id, composeMarkdownWithFrontmatter(frontmatter, editor.getMarkdown()), { composing });
      },
      onSelectionUpdate: ({ editor }) => {
        updateWikiSuggestion(editor);
        if (editor.state.selection.empty) {
          if (isSelectionToolbarInteractionActive()) return;
          setMarkdownToolbar(null);
          onSelection(null);
          return;
        }
      }
    },
    [document.id, documentLinkIndexKey, isReadOnlyDocument, settings.markdown.tabSize]
  );
  useEffect(() => {
    editorInstanceRef.current = editor;
    return () => {
      if (editorInstanceRef.current === editor) editorInstanceRef.current = null;
      if (editorScrollTimerRef.current !== null) {
        window.clearTimeout(editorScrollTimerRef.current);
        editorScrollTimerRef.current = null;
      }
    };
  }, [editor]);

  useEffect(() => {
    if (!editor || isReadOnlyDocument || isSourceMode) return;

    let frameId = 0;
    const fitTableWithinContentWidth = (table: HTMLTableElement) => {
      const wrapper = table.closest(".tableWrapper");
      if (!(wrapper instanceof HTMLElement)) return;
      const contentColumn = contentColumnRef.current;
      if (!contentColumn) return;

      const tablePos = tablePosFromDom(editor, table);
      if (tablePos === null) return;

      const columns = Array.from(table.querySelectorAll<HTMLElement>("colgroup col"));
      if (!columns.length) return;

      const contentColumnStyle = window.getComputedStyle(contentColumn);
      const contentColumnWidth =
        contentColumn.clientWidth
        - Number.parseFloat(contentColumnStyle.paddingLeft || "0")
        - Number.parseFloat(contentColumnStyle.paddingRight || "0");
      const wrapperStyle = window.getComputedStyle(wrapper);
      const availableWidth =
        Math.min(wrapper.clientWidth, contentColumnWidth)
        - Number.parseFloat(wrapperStyle.paddingLeft || "0")
        - Number.parseFloat(wrapperStyle.paddingRight || "0");
      if (!Number.isFinite(availableWidth) || availableWidth <= 0) return;

      const baseWidths = measureNaturalTableColumnWidthInfo(editor, table, tablePos, columns);
      if (baseWidths.length !== columns.length) return;

      const adjustedWidths = baseWidths.map((item) => item.width);
      let overflow = adjustedWidths.reduce((total, width) => total + width, 0) - availableWidth;
      if (overflow > 0) {
        for (let index = adjustedWidths.length - 1; index >= 0 && overflow > 0; index -= 1) {
          const minWidth = index === adjustedWidths.length - 1 ? TABLE_EDGE_COMPRESS_MIN_WIDTH : TABLE_CELL_MIN_WIDTH;
          const reducible = Math.max(0, adjustedWidths[index] - minWidth);
          if (reducible <= 0) continue;
          const reduction = Math.min(reducible, overflow);
          adjustedWidths[index] -= reduction;
          overflow -= reduction;
        }
      }

      const clamped = overflow > 0 || adjustedWidths.some((width, index) => width < baseWidths[index].width);
      table.dataset.inlineFit = clamped ? "true" : "false";
      table.style.width = clamped ? `${availableWidth}px` : "";

      columns.forEach((column, index) => {
        const nextWidth = Math.max(0, adjustedWidths[index]);
        if (clamped || baseWidths[index].fixed) {
          (column as HTMLElement).style.width = `${nextWidth}px`;
        } else {
          (column as HTMLElement).style.width = "";
        }
      });
    };

    const fitAllTables = () => {
      frameId = 0;
      const root = editor.view.dom as HTMLElement;
      root.querySelectorAll("table").forEach((table) => fitTableWithinContentWidth(table as HTMLTableElement));
    };

    const scheduleFit = () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(fitAllTables);
    };

    const resizeObserver = new ResizeObserver(() => scheduleFit());
    if (shellRef.current) resizeObserver.observe(shellRef.current);
    if (contentColumnRef.current) resizeObserver.observe(contentColumnRef.current);

    editor.on("update", scheduleFit);
    scheduleFit();

    return () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      editor.off("update", scheduleFit);
    };
  }, [editor, isReadOnlyDocument, isSourceMode, settings.editor.contentWidth]);

  const focusFindInput = () => {
    window.requestAnimationFrame(() => {
      findQueryInputRef.current?.focus();
      findQueryInputRef.current?.select();
    });
  };

  const selectRichTextFindMatch = (match: { start: number; end: number }) => {
    const currentEditor = editorInstanceRef.current;
    if (!currentEditor || currentEditor.isDestroyed) return null;
    const index = buildEditorTextSearchIndex(currentEditor.state.doc);
    const from = index.positions[match.start];
    const to = index.positions[match.end - 1];
    if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
    currentEditor.chain().focus().setTextSelection({ from, to: to + 1 }).run();
    currentEditor.view.dispatch(currentEditor.state.tr.scrollIntoView());
    const next = { ...match, from, to: to + 1 };
    setFindMatch(next);
    setFindStatus(null);
    return next;
  };

  const findNextInRichText = (query: string, fromIndex?: number) => {
    const currentEditor = editorInstanceRef.current;
    if (!currentEditor || currentEditor.isDestroyed) return null;
    const index = buildEditorTextSearchIndex(currentEditor.state.doc);
    const currentSelectionBoundary = Math.max(0, currentEditor.state.selection.to);
    const selectionIndex = index.positions.findIndex((position) => position >= currentSelectionBoundary);
    const startIndex = fromIndex ?? Math.max(0, selectionIndex + 1);
    const match = findNextTextMatch(index.text, query, startIndex);
    if (!match) return null;
    return selectRichTextFindMatch(match);
  };

  const findNextInSource = (query: string, fromIndex?: number) => {
    const textarea = sourceTextareaRef.current;
    if (!textarea || !query) return null;
    const startIndex = fromIndex ?? textarea.selectionEnd;
    const match = findNextTextMatch(document.markdown, query, startIndex);
    if (!match) return null;
    textarea.focus();
    textarea.setSelectionRange(match.start, match.end);
    textarea.scrollTop = Math.max(0, textarea.scrollHeight * (match.start / Math.max(1, textarea.value.length)) - textarea.clientHeight / 2);
    const next = { ...match, from: match.start, to: match.end };
    setFindMatch(next);
    setFindStatus(null);
    return next;
  };

  const runFindNext = (query = findQuery, options?: { fromIndex?: number }) => {
    if (!query.trim()) {
      setFindStatus(t("editorpane.find.inputRequired"));
      return null;
    }
    const match = isSourceMode ? findNextInSource(query, options?.fromIndex) : findNextInRichText(query, options?.fromIndex);
    if (!match) {
      setFindMatch(null);
      setFindStatus(t("editorpane.find.noMatch"));
      return null;
    }
    return match;
  };

  const openFindPanel = (seed?: string) => {
    const nextQuery = seed?.trim() ? seed : findQuery;
    setFindOpen(true);
    setFindStatus(null);
    if (seed?.trim()) setFindQuery(seed.trim());
    focusFindInput();
    if (nextQuery.trim()) {
      window.setTimeout(() => {
        runFindNext(nextQuery, { fromIndex: 0 });
      }, 0);
    }
  };

  const replaceCurrentFindMatch = () => {
    if (!findQuery.trim() || !findMatch) {
      setFindStatus(t("editorpane.find.matchRequiredForReplace"));
      return;
    }

    if (isSourceMode) {
      const textarea = sourceTextareaRef.current;
      if (!textarea) return;
      const nextMarkdown = `${document.markdown.slice(0, findMatch.start)}${replaceQuery}${document.markdown.slice(findMatch.end)}`;
      onChange(document.id, nextMarkdown);
      window.setTimeout(() => {
        const nextStart = findMatch.start;
        textarea.focus();
        textarea.setSelectionRange(nextStart, nextStart + replaceQuery.length);
      }, 0);
      setFindStatus(null);
      setFindMatch(null);
      return;
    }

    const currentEditor = editorInstanceRef.current;
    if (!currentEditor || currentEditor.isDestroyed) return;
    currentEditor.chain().focus().insertContentAt({ from: findMatch.from, to: findMatch.to }, replaceQuery).run();
    setFindStatus(null);
    setFindMatch(null);
  };

  useEffect(() => {
    if (!outlineJumpRequest || outlineJumpRequest.documentId !== document.id) return;

    if (isSourceMode) {
      const textarea = sourceTextareaRef.current;
      if (!textarea) {
        onOutlineJumpHandled(outlineJumpRequest);
        return;
      }
      const offset = markdownOffsetForLine(document.markdown, outlineJumpRequest.line);
      textarea.focus();
      textarea.setSelectionRange(offset, offset);
      textarea.scrollTop = Math.max(0, textarea.scrollHeight * (offset / Math.max(1, document.markdown.length)) - textarea.clientHeight / 2);
      onOutlineJumpHandled(outlineJumpRequest);
      return;
    }

    if (!editor || editor.isDestroyed || isReadOnlyDocument) {
      onOutlineJumpHandled(outlineJumpRequest);
      return;
    }

    const headingPositions: Array<{ pos: number; text: string }> = [];
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "heading") headingPositions.push({ pos, text: node.textContent.trim() });
      return true;
    });

    const target =
      headingPositions[outlineJumpRequest.order]
      ?? headingPositions.find((item) => item.text === outlineJumpRequest.title);
    if (!target) {
      onOutlineJumpHandled(outlineJumpRequest);
      return;
    }

    editor.chain().focus().setTextSelection(target.pos + 1).run();
    window.requestAnimationFrame(() => {
      const headingDom = editor.view.nodeDOM(target.pos);
      if (headingDom instanceof HTMLElement) {
        headingDom.scrollIntoView({ block: "center", behavior: "smooth" });
      } else {
        editor.view.dispatch(editor.state.tr.scrollIntoView());
      }
    });
    onOutlineJumpHandled(outlineJumpRequest);
  }, [document.id, document.markdown, editor, isReadOnlyDocument, isSourceMode, onOutlineJumpHandled, outlineJumpRequest]);

  useEffect(
    () => () => {
      if (markdownAutoBlockTimerRef.current !== null) window.clearTimeout(markdownAutoBlockTimerRef.current);
    },
    []
  );
  const wikiSuggestions = useMemo(() => {
    if (!wikiSuggest) return [];
    return collectWikiSuggestions(documentLookupIndex, wikiSuggest.query);
  }, [documentLookupIndex, wikiSuggest]);

  const insertWikiLink = (target: string) => {
    if (!editor || !wikiSuggest) return;
    editor
      .chain()
      .focus()
      .deleteRange({ from: wikiSuggest.from, to: wikiSuggest.to })
      .insertContent({ type: "wikiLink", attrs: { target, alias: "" } })
      .run();
    setWikiSuggest(null);
  };

  const updateFrontmatterRaw = (raw: string) => {
    const body = editor?.getMarkdown() ?? editorMarkdown;
    onChange(document.id, `---\n${raw.trimEnd()}\n---\n${body.replace(/^\n+/, "")}`);
  };

  useEffect(() => {
    if (!editor) return;
    if (editor.isDestroyed) return;
    if (composingRef.current || editor.view.composing) return;
    if (syncedDocumentIdRef.current === null) {
      syncedDocumentIdRef.current = document.id;
      return;
    }
    const current = composeMarkdownWithFrontmatter(frontmatter, editor.getMarkdown());
    if (current !== document.markdown) {
      editor.commands.setContent(editorMarkdown, { contentType: "markdown", emitUpdate: false } as never);
    }
    syncedDocumentIdRef.current = document.id;
  }, [document.id, document.markdown, editor, editorMarkdown, frontmatter]);

  useEffect(() => {
    markdownToolbarRef.current = markdownToolbar;
  }, [markdownToolbar]);

  useEffect(() => {
    if (isReadOnlyDocument || !markdownToolbar?.text) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest(selectionToolbarSafeAreaSelector)) return;
      clearMarkdownToolbarState({ preserveDomSelection: true });
    };
    window.addEventListener("pointerdown", handlePointerDown, true);
    return () => window.removeEventListener("pointerdown", handlePointerDown, true);
  }, [isReadOnlyDocument, markdownToolbar?.text]);

  useEffect(() => {
    setMarkdownToolbar(null);
    onClearToolbarTranslate();
    onSelection(null);
    setFindMatch(null);
    setFindStatus(null);
    setShowReplace(false);
    setImageRequest(null);
  }, [document.id]);

  useEffect(() => {
    setWikiSuggest(null);
    setLinkRequest(null);
    setImageRequest(null);
    setFindMatch(null);
    setFindStatus(null);
    if (isSourceMode) {
      clearMarkdownToolbarState();
    }
  }, [isSourceMode]);

  useEffect(() => {
    if (findOpen) focusFindInput();
  }, [findOpen]);

  useEffect(() => {
    if (!wikiSuggest) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setWikiSuggest(null);
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setWikiIndex((index) => Math.min(index + 1, Math.max(0, wikiSuggestions.length - 1)));
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setWikiIndex((index) => Math.max(0, index - 1));
      }
      if (event.key === "Enter" && wikiSuggestions[wikiIndex]) {
        event.preventDefault();
        insertWikiLink(wikilinkLabel(wikiSuggestions[wikiIndex]));
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [wikiIndex, wikiSuggest, wikiSuggestions]);

  useEffect(() => {
    if (!findOpen) return;
    if (!findQuery.trim()) {
      setFindMatch(null);
      setFindStatus(null);
      return;
    }
    const timer = window.setTimeout(() => {
      runFindNext(findQuery, { fromIndex: 0 });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [findOpen, findQuery, document.markdown, isSourceMode]);

  useEffect(() => {
    if (!editor) return;
    if (editor.isDestroyed) return;
    editor.setEditable(!isReadOnlyDocument);
  }, [editor, isReadOnlyDocument]);

  useEffect(() => {
    if (!editor) return;
    if (editor.isDestroyed) return;
    editor.view.dom.setAttribute("spellcheck", String(settings.editor.spellcheck));
  }, [editor, settings.editor.spellcheck]);

  useEffect(() => {
    if (!editor) return;
    if (editor.isDestroyed) return;

    const selectedText = () => {
      if (isSourceMode) {
        const textarea = sourceTextareaRef.current;
        if (!textarea) return "";
        return textarea.value.slice(textarea.selectionStart, textarea.selectionEnd);
      }
      const { from, to } = editor.state.selection;
      return from === to ? "" : editor.state.doc.textBetween(from, to, "\n");
    };
    const selectedRange = () => {
      if (isSourceMode) {
        const textarea = sourceTextareaRef.current;
        return { from: textarea?.selectionStart ?? 0, to: textarea?.selectionEnd ?? 0 };
      }
      const { from, to } = editor.state.selection;
      return { from, to };
    };
    const insertText = (text: string) => editor.chain().focus().insertContent(text).run();
    const wrapSelection = (before: string, after: string, placeholder: string) => {
      const text = selectedText() || placeholder;
      insertText(`${before}${text}${after}`);
    };
    const transformSelection = (transform: (text: string) => string) => {
      const text = selectedText();
      if (!text) return;
      insertText(transform(text));
    };
    const toggleExclusiveScript = (script: "subscript" | "superscript") => {
      const targetActive = editor.isActive(script);
      const opposite = script === "subscript" ? "superscript" : "subscript";
      const oppositeActive = editor.isActive(opposite);
      const chain = editor.chain().focus();

      if (targetActive && !oppositeActive) {
        if (script === "subscript") chain.unsetSubscript().run();
        else chain.unsetSuperscript().run();
        return;
      }

      if (script === "subscript") {
        chain.unsetSuperscript().setSubscript().run();
      } else {
        chain.unsetSubscript().setSuperscript().run();
      }
    };
    const currentBlockRange = () => {
      const { $from } = editor.state.selection;
      const depth = Math.max(1, $from.depth);
      return { from: $from.start(depth), to: $from.end(depth) };
    };
    const currentBlockText = () => {
      const range = currentBlockRange();
      return editor.state.doc.textBetween(range.from, range.to, "\n").trim();
    };
    const replaceCurrentEmptyBlock = (content: Record<string, unknown>) => {
      const range = currentBlockRange();
      editor.chain().focus().deleteRange(range).insertContent(content).run();
    };

    const runEditorCommand = (command: MenuCommand, payload?: unknown) => {
      if (isReadOnlyDocument && command !== "edit:find" && command !== "edit:find-next") return;
      switch (command) {
        case "edit:find":
          openFindPanel(selectedText() || findQuery);
          return;
        case "edit:find-next":
          if (!findOpen || !findQuery.trim()) {
            openFindPanel(selectedText() || findQuery);
            return;
          }
          runFindNext();
          return;
        case "edit:select-block": {
          const range = currentBlockRange();
          editor.chain().focus().setTextSelection(range).run();
          return;
        }
        case "edit:duplicate-line": {
          const range = currentBlockRange();
          const text = editor.state.doc.textBetween(range.from, range.to, "\n");
          editor.chain().focus().setTextSelection(range.to).insertContent(`\n${text}`).run();
          return;
        }
        case "edit:delete-line": {
          const range = currentBlockRange();
          editor.chain().focus().deleteRange(range).run();
          return;
        }
        case "edit:hard-break":
          editor.chain().focus().setHardBreak().run();
          return;
        case "insert:paragraph":
          insertText("\n\n");
          return;
        case "autofill:date":
          insertText(new Date().toLocaleDateString());
          return;
        case "autofill:title":
          insertText(document.title.replace(/\.[^.]+$/, ""));
          return;
        case "autofill:previous-block": {
          const before = editor.state.doc.textBetween(0, editor.state.selection.from, "\n");
          const previous = before.split("\n").map((line) => line.trim()).filter(Boolean).at(-1);
          if (previous) insertText(previous);
          return;
        }
        case "format:paragraph":
          editor.chain().focus().setParagraph().run();
          return;
        case "format:heading":
          editor.chain().focus().toggleHeading({ level: payload as 1 | 2 | 3 }).run();
          return;
        case "format:bold":
          editor.chain().focus().toggleBold().run();
          return;
        case "format:italic":
          editor.chain().focus().toggleItalic().run();
          return;
        case "format:underline":
          editor.chain().focus().toggleUnderline().run();
          return;
        case "format:strike":
          editor.chain().focus().toggleStrike().run();
          return;
        case "format:inline-code":
          editor.chain().focus().toggleCode().run();
          return;
        case "format:highlight":
          editor.chain().focus().toggleHighlight().run();
          return;
        case "format:encrypt-text":
          void beginEncryptSelection();
          return;
        case "format:subscript":
          toggleExclusiveScript("subscript");
          return;
        case "format:superscript":
          toggleExclusiveScript("superscript");
          return;
        case "format:bullet-list":
          if (!selectedText() && !currentBlockText()) {
            replaceCurrentEmptyBlock({
              type: "bulletList",
              content: [
                {
                  type: "listItem",
                  content: [{ type: "paragraph", content: [{ type: "text", text: "List item" }] }]
                }
              ]
            });
            return;
          }
          editor.chain().focus().toggleBulletList().run();
          return;
        case "format:ordered-list":
          if (!selectedText() && !currentBlockText()) {
            replaceCurrentEmptyBlock({
              type: "orderedList",
              content: [
                {
                  type: "listItem",
                  content: [{ type: "paragraph", content: [{ type: "text", text: "List item" }] }]
                }
              ]
            });
            return;
          }
          editor.chain().focus().toggleOrderedList().run();
          return;
        case "format:blockquote":
          if (!selectedText() && !currentBlockText()) {
            replaceCurrentEmptyBlock({
              type: "blockquote",
              content: [{ type: "paragraph" }]
            });
            return;
          }
          editor.chain().focus().toggleBlockquote().run();
          return;
        case "format:code-block":
          editor.chain().focus().toggleCodeBlock({ language: "plaintext" }).run();
          return;
        case "convert:uppercase":
          transformSelection((text) => text.toUpperCase());
          return;
        case "convert:lowercase":
          transformSelection((text) => text.toLowerCase());
          return;
        case "convert:plain-text":
          transformSelection((text) => text.replace(/[*_`#>~=\[\]()]/g, ""));
          return;
        case "insert:link": {
          const range = selectedRange();
          setLinkRequest({
            ...range,
            text: selectedText(),
            url: String(editor.getAttributes("link").href ?? "")
          });
          return;
        }
        case "insert:asset": {
          const asset = payload as { kind?: string; path?: string; name?: string };
          if (!asset.path) return;
          const name = asset.name ?? asset.path.split(/[\\/]/).at(-1) ?? asset.kind ?? "asset";
          const src = asset.path;
          if (asset.kind === "image") {
            editor.chain().focus().setImage({ src, alt: name, title: name }).createParagraphNear().run();
          }
          if (asset.kind === "video" || asset.kind === "audio") {
            editor
              .chain()
              .focus()
              .insertContent({ type: "mediaBlock", attrs: { kind: asset.kind, src, title: name } })
              .createParagraphNear()
              .run();
          }
          if (asset.kind === "pdf") {
            editor.chain().focus().insertContent(`[${name}](${src})`).createParagraphNear().run();
          }
          return;
        }
        case "insert:table":
          editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
          return;
        case "format:task-list":
        case "insert:task-list":
          if (!selectedText() && !currentBlockText()) {
            replaceCurrentEmptyBlock({
              type: "taskList",
              content: [
                {
                  type: "taskItem",
                  attrs: { checked: false },
                  content: [{ type: "paragraph" }]
                }
              ]
            });
            return;
          }
          editor.chain().focus().toggleTaskList().run();
          return;
        case "insert:math":
          {
            const source = defaultBlockSource("mathBlock");
            editor
              .chain()
              .focus()
              .insertContent({ type: "mathBlock", attrs: { source, focusKey: String(Date.now()) }, content: [{ type: "text", text: source }] })
              .createParagraphNear()
              .run();
          }
          return;
        case "insert:chart":
          {
            const source = defaultBlockSource("chartBlock");
            editor
              .chain()
              .focus()
              .insertContent({ type: "chartBlock", attrs: { source, focusKey: String(Date.now()) }, content: [{ type: "text", text: source }] })
              .createParagraphNear()
              .run();
          }
          return;
        case "insert:horizontal-rule":
          editor.chain().focus().setHorizontalRule().run();
          return;
        case "insert:footnote":
          {
            const source = defaultBlockSource("footnoteBlock");
            editor
              .chain()
              .focus()
              .insertContent(sourceBackedBlockJson("footnoteBlock", source))
              .createParagraphNear()
              .run();
          }
          return;
        case "insert:details":
          {
            const source = defaultBlockSource("detailsBlock");
            editor
              .chain()
              .focus()
              .insertContent(sourceBackedBlockJson("detailsBlock", source))
              .createParagraphNear()
              .run();
          }
          return;
        case "insert:callout":
          {
            const source = defaultBlockSource("calloutBlock");
            editor
              .chain()
              .focus()
              .insertContent(sourceBackedBlockJson("calloutBlock", source))
              .createParagraphNear()
              .run();
          }
          return;
        case "insert:legacy-math":
          editor
            .chain()
            .focus()
            .insertContent(sourceBackedBlockJson("mathBlock", defaultBlockSource("mathBlock"), true))
            .createParagraphNear()
            .run();
          return;
        case "insert:legacy-chart":
          editor
            .chain()
            .focus()
            .insertContent(sourceBackedBlockJson("chartBlock", defaultBlockSource("chartBlock"), true))
            .createParagraphNear()
            .run();
          return;
        case "insert:legacy-footnote":
          editor
            .chain()
            .focus()
            .insertContent(sourceBackedBlockJson("footnoteBlock", defaultBlockSource("footnoteBlock"), true))
            .createParagraphNear()
            .run();
          return;
        case "insert:legacy-details":
          editor
            .chain()
            .focus()
            .insertContent(sourceBackedBlockJson("detailsBlock", defaultBlockSource("detailsBlock"), true))
            .createParagraphNear()
            .run();
          return;
        case "insert:legacy-callout":
          editor
            .chain()
            .focus()
            .insertContent(sourceBackedBlockJson("calloutBlock", defaultBlockSource("calloutBlock"), true))
            .createParagraphNear()
            .run();
          return;
      }
    };

    const removeMenuListener = window.informio.onMenuCommand(runEditorCommand);
    const onLocalCommand = (event: Event) => {
      const detail = (event as CustomEvent<{ command: MenuCommand; payload?: unknown }>).detail;
      if (detail?.command) runEditorCommand(detail.command, detail.payload);
    };
    window.addEventListener("informio:command", onLocalCommand);
    return () => {
      removeMenuListener();
      window.removeEventListener("informio:command", onLocalCommand);
    };
  }, [document.title, editor, isReadOnlyDocument, isSourceMode]);

  const normalizeLinkHref = (value: string) => (/^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`);

  const applyLink = (input: { text: string; url: string; title?: string }) => {
    if (!editor || !linkRequest) return;
    const href = normalizeLinkHref(input.url.trim());
    editor
      .chain()
      .focus()
      .insertContentAt(
        { from: linkRequest.from, to: linkRequest.to },
        {
          type: "text",
          text: input.text.trim(),
          marks: [{ type: "link", attrs: { href, title: input.title || null } }]
        }
      )
      .run();
    setLinkRequest(null);
  };
  const applyImage = (input: { alt: string; src: string; title: string }) => {
    if (!editor || !imageRequest) return;
    editor
      .chain()
      .focus()
      .setNodeSelection(imageRequest.pos)
      .updateAttributes("image", {
        alt: input.alt,
        src: input.src,
        title: input.title || null
      })
      .run();
    setImageRequest(null);
  };
  const closeMarkdownToolbar = () => {
    clearMarkdownToolbarState();
  };
  const canUndo = Boolean(editor?.can().chain().focus().undo().run());
  const canRedo = Boolean(editor?.can().chain().focus().redo().run());
  const handleUndo = () => {
    if (!editor || editor.isDestroyed || isReadOnlyDocument || isSourceMode) return;
    editor.chain().focus().undo().run();
  };
  const handleRedo = () => {
    if (!editor || editor.isDestroyed || isReadOnlyDocument || isSourceMode) return;
    editor.chain().focus().redo().run();
  };
  const linkRangeAtSelection = () => {
    if (!editor?.isActive("link")) return null;
    const { $from } = editor.state.selection;
    const linkType = editor.state.schema.marks.link;
    const linkMark = $from.marks().find((mark) => mark.type === linkType);
    if (!linkMark) return null;
    let from = $from.pos;
    let to = $from.pos;

    const parentStart = $from.start();
    const parent = $from.parent;
    parent.forEach((node, offset) => {
      const start = parentStart + offset;
      const end = start + node.nodeSize;
      if (end < $from.pos || start > $from.pos) return;
      if (linkMark.isInSet(node.marks)) {
        from = start;
        to = end;
      }
    });

    for (let index = $from.index() - 1, pos = from; index >= 0; index -= 1) {
      const node = parent.child(index);
      pos -= node.nodeSize;
      if (!linkMark.isInSet(node.marks)) break;
      from = pos;
    }
    for (let index = $from.indexAfter(), pos = to; index < parent.childCount; index += 1) {
      const node = parent.child(index);
      if (!linkMark.isInSet(node.marks)) break;
      to = pos + node.nodeSize;
      pos = to;
    }
    return { from, to, attrs: linkMark.attrs };
  };
  const openLinkDialogFromSelection = () => {
    if (!editor || editor.isDestroyed || isReadOnlyDocument || isSourceMode) return;
    const linkRange = linkRangeAtSelection();
    const { from, to } = linkRange ?? editor.state.selection;
    setLinkRequest({
      from,
      to,
      text: from === to ? "" : editor.state.doc.textBetween(from, to, "\n"),
      url: String((linkRange?.attrs.href ?? editor.getAttributes("link").href) ?? ""),
      title: String((linkRange?.attrs.title ?? editor.getAttributes("link").title) ?? "")
    });
  };
  const runSelectionToolbarAction = (actionId: SelectionToolbarAction["id"]) => {
    if (!editor || editor.isDestroyed || isReadOnlyDocument || isSourceMode) return;
    switch (actionId) {
      case "bold":
        editor.chain().focus().toggleBold().run();
        return;
      case "italic":
        editor.chain().focus().toggleItalic().run();
        return;
      case "underline":
        editor.chain().focus().toggleUnderline().run();
        return;
      case "strike":
        editor.chain().focus().toggleStrike().run();
        return;
      case "subscript":
        editor.chain().focus().unsetSuperscript().toggleSubscript().run();
        return;
      case "superscript":
        editor.chain().focus().unsetSubscript().toggleSuperscript().run();
        return;
      case "highlight":
        editor.chain().focus().toggleHighlight().run();
        return;
      case "link":
        if (editor.isActive("link")) {
          openLinkDialogFromSelection();
          return;
        }
        openLinkDialogFromSelection();
        return;
    }
  };
  const isSelectionToolbarActionActive = (actionId: SelectionToolbarAction["id"]) => {
    if (!editor) return false;
    switch (actionId) {
      case "bold":
        return editor.isActive("bold");
      case "italic":
        return editor.isActive("italic");
      case "underline":
        return editor.isActive("underline");
      case "strike":
        return editor.isActive("strike");
      case "subscript":
        return editor.isActive("subscript");
      case "superscript":
        return editor.isActive("superscript");
      case "highlight":
        return editor.isActive("highlight");
      case "link":
        return editor.isActive("link");
      default:
        return false;
    }
  };
  const selectionLabelMap: Record<string, string> = {
    bold: "editorpane.bold",
    italic: "editorpane.italic",
    underline: "editorpane.underline",
    strike: "editorpane.strikethrough",
    subscript: "editorpane.subscript",
    superscript: "editorpane.superscript",
    highlight: "editorpane.highlight",
    link: "editorpane.addLink"
  };
  const selectionToolbarFormatItems = getSelectionToolbarActions(t).map((action) => ({
    ...action,
    pressed: isSelectionToolbarActionActive(action.id),
    label: action.id === "link" && editor?.isActive("link") ? t("editorpane.goToLink") : t(selectionLabelMap[action.id]),
    onClick: () => runSelectionToolbarAction(action.id)
  }));
  const selectedText = () => {
    if (!editor || editor.isDestroyed) return "";
    const { from, to } = editor.state.selection;
    return from === to ? "" : editor.state.doc.textBetween(from, to, "\n");
  };
  const currentBlockRange = () => {
    if (!editor || editor.isDestroyed) return { from: 0, to: 0 };
    const { $from } = editor.state.selection;
    const depth = Math.max(1, $from.depth);
    return { from: $from.start(depth), to: $from.end(depth) };
  };
  const currentBlockText = () => {
    if (!editor || editor.isDestroyed) return "";
    const range = currentBlockRange();
    return editor.state.doc.textBetween(range.from, range.to, "\n").trim();
  };
  const replaceCurrentEmptyBlock = (content: Record<string, unknown>) => {
    if (!editor || editor.isDestroyed) return;
    const range = currentBlockRange();
    editor.chain().focus().deleteRange(range).insertContent(content).run();
  };
  const runInsertToolbarCommand = (
    command:
      | "insert:table"
      | "format:bullet-list"
      | "format:ordered-list"
      | "format:task-list"
      | "format:blockquote"
      | "format:code-block"
      | "insert:math"
      | "insert:chart"
      | "insert:callout"
      | "insert:footnote"
      | "insert:details"
      | "insert:horizontal-rule"
  ) => {
    if (!editor || editor.isDestroyed || isReadOnlyDocument || isSourceMode) return;
    switch (command) {
      case "insert:table":
        editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
        return;
      case "format:bullet-list":
        if (!selectedText() && !currentBlockText()) {
          replaceCurrentEmptyBlock({
            type: "bulletList",
            content: [
              {
                type: "listItem",
                content: [{ type: "paragraph", content: [{ type: "text", text: "List item" }] }]
              }
            ]
          });
          return;
        }
        editor.chain().focus().toggleBulletList().run();
        return;
      case "format:ordered-list":
        if (!selectedText() && !currentBlockText()) {
          replaceCurrentEmptyBlock({
            type: "orderedList",
            content: [
              {
                type: "listItem",
                content: [{ type: "paragraph", content: [{ type: "text", text: "List item" }] }]
              }
            ]
          });
          return;
        }
        editor.chain().focus().toggleOrderedList().run();
        return;
      case "format:task-list":
        if (!selectedText() && !currentBlockText()) {
          replaceCurrentEmptyBlock({
            type: "taskList",
            content: [
              {
                type: "taskItem",
                attrs: { checked: false },
                content: [{ type: "paragraph" }]
              }
            ]
          });
          return;
        }
        editor.chain().focus().toggleTaskList().run();
        return;
      case "format:blockquote":
        if (!selectedText() && !currentBlockText()) {
          replaceCurrentEmptyBlock({
            type: "blockquote",
            content: [{ type: "paragraph" }]
          });
          return;
        }
        editor.chain().focus().toggleBlockquote().run();
        return;
      case "format:code-block":
        editor.chain().focus().toggleCodeBlock({ language: "plaintext" }).run();
        return;
      case "insert:math": {
        const source = defaultBlockSource("mathBlock");
        editor
          .chain()
          .focus()
          .insertContent({ type: "mathBlock", attrs: { source, focusKey: String(Date.now()) }, content: [{ type: "text", text: source }] })
          .createParagraphNear()
          .run();
        return;
      }
      case "insert:chart": {
        const source = defaultBlockSource("chartBlock");
        editor
          .chain()
          .focus()
          .insertContent({ type: "chartBlock", attrs: { source, focusKey: String(Date.now()) }, content: [{ type: "text", text: source }] })
          .createParagraphNear()
          .run();
        return;
      }
      case "insert:callout": {
        const source = defaultBlockSource("calloutBlock");
        editor
          .chain()
          .focus()
          .insertContent(sourceBackedBlockJson("calloutBlock", source))
          .createParagraphNear()
          .run();
        return;
      }
      case "insert:footnote": {
        const source = defaultBlockSource("footnoteBlock");
        editor
          .chain()
          .focus()
          .insertContent(sourceBackedBlockJson("footnoteBlock", source))
          .createParagraphNear()
          .run();
        return;
      }
      case "insert:details": {
        const source = defaultBlockSource("detailsBlock");
        editor
          .chain()
          .focus()
          .insertContent(sourceBackedBlockJson("detailsBlock", source))
          .createParagraphNear()
          .run();
        return;
      }
      case "insert:horizontal-rule":
        editor.chain().focus().setHorizontalRule().run();
        return;
    }
  };
  const handleInsertToolbarAction = (action: InsertToolbarAction) => {
    if (action.kind === "asset") {
      void window.informio.insertAsset(action.assetKind);
      return;
    }
    runInsertToolbarCommand(action.command);
  };

  const pdfContext = useMemo<UnifiedPdfEditorContextValue>(
    () => ({
      paneId,
      document,
      settings,
      toolbarTranslate,
      onTranslateSelection,
      onClearToolbarTranslate
    }),
    [document, onClearToolbarTranslate, onTranslateSelection, paneId, settings, toolbarTranslate]
  );
  const editorContentMaxWidth = isReadOnlyDocument ? undefined : clamp(settings.editor.contentWidth, EDITOR_CONTENT_MIN_WIDTH, EDITOR_CONTENT_MAX_WIDTH);
  const showPinnedInsertToolbar = !isReadOnlyDocument && !isSourceMode;
  const showPdfTranslatePanel =
    isReadOnlyDocument && (toolbarTranslate.status === "loading" || Boolean(toolbarTranslate.response || toolbarTranslate.error));
  const pdfTranslatePanelStyle = useMemo<React.CSSProperties | undefined>(() => {
    if (!showPdfTranslatePanel) return undefined;
    const width = 320;
    const viewportWidth = typeof window === "undefined" ? width + 32 : window.innerWidth;
    const viewportHeight = typeof window === "undefined" ? 720 : window.innerHeight;
    const left = clamp(toolbarTranslate.anchor?.left ?? 24, 16, Math.max(16, viewportWidth - width - 16));
    const top = clamp(toolbarTranslate.anchor?.top ?? 96, 16, Math.max(16, viewportHeight - 140));
    const maxHeight = Math.max(120, viewportHeight - top - 16);
    return {
      left,
      top,
      width: "min(320px, calc(100vw - 32px))",
      maxHeight
    };
  }, [showPdfTranslatePanel, toolbarTranslate.anchor?.left, toolbarTranslate.anchor?.top]);
  const handleEditorScroll = () => {
    setEditorScrolling(true);
    if (editorScrollTimerRef.current !== null) window.clearTimeout(editorScrollTimerRef.current);
    editorScrollTimerRef.current = window.setTimeout(() => {
      setEditorScrolling(false);
      editorScrollTimerRef.current = null;
    }, 900);
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {showPinnedInsertToolbar ? (
        <div className="informio-insert-toolbar-header flex shrink-0 justify-center">
          <div className="w-full" style={editorContentMaxWidth ? { maxWidth: editorContentMaxWidth } : undefined}>
            <div className="informio-insert-toolbar-shell px-12 pt-2 max-[780px]:px-5 max-[780px]:pt-2">
              <InsertToolbar
                onAction={handleInsertToolbarAction}
                onUndo={handleUndo}
                onRedo={handleRedo}
                canUndo={canUndo}
                canRedo={canRedo}
                propertiesOpen={propertiesOpen}
                onToggleProperties={() => setPropertiesOpen((current) => !current)}
              />
            </div>
          </div>
        </div>
      ) : null}
      <main
        ref={shellRef}
        className={cn(
          "informio-editor-shell relative flex min-w-0 flex-1",
          !isSpreadsheetDocument && "justify-center",
          editorScrolling && "is-scrolling",
          isSpreadsheetDocument
            ? "is-spreadsheet-document flex min-h-0 flex-1 flex-col overflow-hidden"
            : isPdfDocument
              ? "is-pdf-document overflow-y-auto overflow-x-hidden"
              : isReadOnlyDocument
                ? "is-asset-document overflow-hidden"
                : "overflow-y-auto"
        )}
        onScroll={handleEditorScroll}
        onMouseUp={(event) => {
          if ((event.target as HTMLElement).closest(selectionToolbarSafeAreaSelector)) return;
          if (editor && !isReadOnlyDocument && !isSourceMode) scheduleMarkdownSelectionCapture(editor);
        }}
        onKeyUp={() => {
          if (editor && !isReadOnlyDocument && !isSourceMode) scheduleMarkdownSelectionCapture(editor);
        }}
        style={
          {
            "--editor-font-size": `${settings.editor.fontSize}px`,
            "--editor-line-height": String(Math.max(settings.editor.lineHeight, 1.72))
          } as React.CSSProperties
        }
      >
        <div
          className={cn("w-full", isSpreadsheetDocument && "flex min-h-0 flex-1 flex-col")}
          style={editorContentMaxWidth ? { maxWidth: editorContentMaxWidth } : undefined}
        >
        <div
          ref={contentColumnRef}
          className={cn(
            "w-full",
            isSpreadsheetDocument
              ? "flex min-h-0 flex-1 flex-col"
              : isReadOnlyDocument
                ? "h-full"
                : "px-12 pb-24 max-[780px]:px-5",
            showPinnedInsertToolbar ? "informio-content-under-toolbar" : undefined,
            isSourceMode ? "pt-2 max-[780px]:pt-2" : undefined
          )}
        >
        {isReadOnlyDocument || isSourceMode || !propertiesOpen ? null : <PropertiesPanel frontmatter={frontmatter} onChange={updateFrontmatterRaw} />}
        <UnifiedPdfEditorContext.Provider value={pdfContext}>
          {isSourceMode ? (
            <textarea
              ref={sourceTextareaRef}
              value={document.markdown}
              spellCheck={false}
              onChange={(event) => onChange(document.id, event.target.value)}
              onPaste={(event) => {
                const clipboard = event.clipboardData;
                const html = clipboard.getData("text/html");
                const markdown = clipboard.getData("text/markdown");
                const text = markdown || clipboardPlainTextForPaste(clipboard.getData("text/plain"), html);
                if (!html && !markdown && text === clipboard.getData("text/plain")) return;
                if (!text) return;
                event.preventDefault();
                const nextMarkdown = insertTextIntoTextarea(event.currentTarget, stripClipboardFragmentMarkers(text));
                onChange(document.id, nextMarkdown);
              }}
              className="informio-editor informio-editor-source w-full resize-none border-0 bg-transparent p-0"
            />
          ) : isSpreadsheetDocument ? (
            <Suspense fallback={<div className="informio-spreadsheet-message">{t("editor.assetLoading")}</div>}>
              <SpreadsheetViewerSurface
                document={document}
                autoSave={settings.markdown.autoSave}
                onDirtyChange={onDirtyChange}
              />
            </Suspense>
          ) : isPdfDocument ? (
            <UnifiedPdfViewerSurface />
          ) : isReadOnlyDocument ? (
            <AssetViewerSurface document={document} />
          ) : (
            <EditorContent editor={editor} className={isReadOnlyDocument ? "h-full" : undefined} />
          )}
        </UnifiedPdfEditorContext.Provider>
        </div>
      </div>
      {!isReadOnlyDocument && findOpen ? (
        <div className="pointer-events-auto absolute right-5 top-4 z-40 w-[340px] rounded-xl border border-slate-200/80 bg-white/95 p-3 text-[13px] shadow-[0_20px_45px_rgba(15,23,42,0.16)] backdrop-blur" data-selection-toolbar-safe-area="true">
          <div className="grid gap-2">
            <div className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-2">
              <button
                type="button"
                aria-label={showReplace ? t("editorpane.find.collapseReplace") : t("editorpane.find.expandReplace")}
                onClick={() => setShowReplace((current) => !current)}
                className="grid h-8 w-8 place-items-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
              >
                {showReplace ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
              <input
                ref={findQueryInputRef}
                value={findQuery}
                onChange={(event) => setFindQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    runFindNext();
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setFindOpen(false);
                  }
                }}
                placeholder={t("editorpane.find.findText")}
                className="h-8 rounded-md border-0 bg-slate-50 px-3 text-[13px] text-[var(--text-main)] outline-none ring-1 ring-slate-200 focus:ring-2 focus:ring-emerald-500/45"
              />
              <button
                type="button"
                aria-label={t("editorpane.find.findNext")}
                onClick={() => runFindNext()}
                className="grid h-8 w-8 place-items-center rounded-md bg-slate-950 text-white transition-transform active:scale-95"
              >
                <Search size={14} />
              </button>
              <button
                type="button"
                aria-label={t("editorpane.find.closeFind")}
                onClick={() => setFindOpen(false)}
                className="grid h-8 w-8 place-items-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={14} />
              </button>
            </div>
            {showReplace ? (
              <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
                <div className="h-8 w-8" />
                <input
                  value={replaceQuery}
                  onChange={(event) => setReplaceQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      replaceCurrentFindMatch();
                    }
                    if (event.key === "Escape") {
                      event.preventDefault();
                      setFindOpen(false);
                    }
                  }}
                  placeholder={t("editorpane.find.replaceText")}
                  className="h-8 rounded-md border-0 bg-slate-50 px-3 text-[13px] text-[var(--text-main)] outline-none ring-1 ring-slate-200 focus:ring-2 focus:ring-emerald-500/45"
                />
                <button
                  type="button"
                  aria-label={t("editorpane.find.replaceCurrent")}
                  onClick={replaceCurrentFindMatch}
                  className="grid h-8 w-8 place-items-center rounded-md bg-emerald-50 text-emerald-700 transition-colors hover:bg-emerald-100"
                >
                  <Replace size={14} />
                </button>
              </div>
            ) : null}
          </div>
          {findStatus || findMatch ? (
            <div className="mt-2 min-h-[18px] pl-10 text-[13px] text-[var(--text-muted)]">{findStatus ?? t("editorpane.find.matchLocated")}</div>
          ) : null}
        </div>
      ) : null}
      {isReadOnlyDocument || isSourceMode ? null : <TableControls editor={editor} containerRef={shellRef} />}
      {isReadOnlyDocument || isSourceMode ? null : <LinkDialog request={linkRequest} onClose={() => setLinkRequest(null)} onConfirm={applyLink} />}
      {isReadOnlyDocument || isSourceMode ? null : <ImageDialog request={imageRequest} onClose={() => setImageRequest(null)} onConfirm={applyImage} />}
      {isReadOnlyDocument || isSourceMode ? null : (
        <SecretPassphraseDialog
          request={secretPromptRequest}
          onClose={closeSecretPrompt}
          onConfirm={(input) => {
            void confirmSecretPrompt(input);
          }}
        />
      )}
      {!isReadOnlyDocument && !isSourceMode && wikiSuggest ? (
        <div className="informio-wiki-suggest no-drag fixed z-50 max-h-72 w-72 overflow-hidden rounded-md bg-white py-1 text-[13px] shadow-[0_18px_45px_rgba(15,23,42,0.18),0_0_0_1px_rgba(15,23,42,0.08)]" style={{ left: wikiSuggest.left, top: wikiSuggest.top }}>
          {wikiSuggestions.length ? (
            wikiSuggestions.map((doc, index) => (
              <button
                key={doc.id}
                type="button"
                className={cn("flex w-full flex-col px-3 py-2 text-left transition-colors", index === wikiIndex ? "bg-emerald-50 text-emerald-800" : "text-slate-700 hover:bg-slate-50")}
                onMouseDown={(event) => {
                  event.preventDefault();
                  insertWikiLink(wikilinkLabel(doc));
                }}
              >
                <span className="truncate font-semibold">{wikilinkLabel(doc)}</span>
                <span className="truncate text-[11px] text-slate-400">{doc.filePath ?? doc.title}</span>
              </button>
            ))
          ) : (
            <button
              type="button"
              className="flex w-full flex-col px-3 py-2 text-left text-slate-600 hover:bg-slate-50"
              onMouseDown={(event) => {
                event.preventDefault();
                const title = wikiSuggest.query.trim() || t("editorpane.wiki.unnamed");
                insertWikiLink(title);
                onCreateInternalLink(title);
              }}
            >
              <span className="font-semibold">{t("editorpane.wiki.createNote", { name: wikiSuggest.query || t("editorpane.wiki.newNote") })}</span>
              <span className="text-[11px] text-slate-400">{t("editorpane.wiki.noMatch")}</span>
            </button>
          )}
        </div>
      ) : null}
      {showPdfTranslatePanel ? (
        <div
          className="pointer-events-auto fixed z-[90] overflow-hidden rounded-xl border border-slate-200/80 bg-white/95 p-3 text-[13px] shadow-[0_20px_45px_rgba(15,23,42,0.16)] backdrop-blur"
          style={pdfTranslatePanelStyle}
          data-selection-toolbar-safe-area="true"
          onMouseDownCapture={markSelectionToolbarInteraction}
        >
          <SelectionTranslateSection
            variant="pdf"
            enabled={toolbarEnabled}
            busy={toolbarTranslate.status === "loading"}
            response={toolbarTranslate.response}
            error={toolbarTranslate.error}
            onClose={onClearToolbarTranslate}
          />
        </div>
      ) : null}
      {!isReadOnlyDocument && !isSourceMode ? (
        <SelectionToolbar
          visible={Boolean(markdownToolbar?.text)}
          enabled={toolbarEnabled}
          busy={toolbarTranslate.status === "loading"}
          left={markdownToolbar?.overlayLeft ?? 0}
          top={markdownToolbar?.overlayTop ?? 0}
          formatActions={selectionToolbarFormatItems}
          response={toolbarTranslate.response}
          error={toolbarTranslate.error}
          onEncrypt={() => {
            void beginEncryptSelection();
          }}
          onTranslate={() => {
            if (!markdownToolbar) return;
            onTranslateSelection(markdownToolbar);
          }}
          onClose={closeMarkdownToolbar}
        />
      ) : null}
      </main>
    </div>
  );
}

export default EditorPane;
