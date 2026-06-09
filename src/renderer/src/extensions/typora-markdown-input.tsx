import { Extension, InputRule, markPasteRule } from "@tiptap/core";
import type { JSONContent, PasteRuleMatch } from "@tiptap/core";
import { DOMParser as ProseMirrorDOMParser } from "@tiptap/pm/model";
import { Plugin } from "@tiptap/pm/state";
import type { MarkdownParserEditor } from "../types";
import { normalizeCodeLanguage } from "../lib/markdown-block-parser";
import { clipboardPlainTextForPaste, htmlFragmentHasContent, sanitizeHtmlFragmentForPaste, stripClipboardFragmentMarkers } from "../lib/clipboardPaste";

const INVALID_AUTO_LINK_CHAR_PATTERN = /[㐀-鿿豈-﫿，。！？；：、（）【】《》""]'']/;
const URL_STOP_CHAR_PATTERN = /[㐀-鿿豈-﫿，。！？；：、（）：【】《》""]'']/;
const TRAILING_URL_PUNCTUATION_PATTERN = /[.,!?;:，。！？；：、]+$/;
const PASTED_HTTP_URL_PATTERN = /https?:\/\/[^\s<>"'`]+/gi;

const countUrlCharacters = (value: string, character: string) => value.split(character).length - 1;

const trimUnmatchedTrailingClosers = (value: string) => {
  let trimmed = value;
  const pairs: Array<[string, string]> = [
    ["(", ")"],
    ["[", "]"]
  ];

  let changed = true;
  while (changed) {
    changed = false;
    for (const [open, close] of pairs) {
      if (trimmed.endsWith(close) && countUrlCharacters(trimmed, close) > countUrlCharacters(trimmed, open)) {
        trimmed = trimmed.slice(0, -1);
        changed = true;
      }
    }
  }

  return trimmed;
};

const cleanPastedHttpUrl = (value: string) => {
  const stopIndex = value.search(URL_STOP_CHAR_PATTERN);
  let cleaned = stopIndex >= 0 ? value.slice(0, stopIndex) : value;
  cleaned = cleaned.replace(TRAILING_URL_PUNCTUATION_PATTERN, "");
  cleaned = trimUnmatchedTrailingClosers(cleaned);
  cleaned = cleaned.replace(TRAILING_URL_PUNCTUATION_PATTERN, "");

  try {
    const parsed = new URL(cleaned);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? cleaned : "";
  } catch {
    return "";
  }
};

const findPastedHttpUrlMatches = (text: string): PasteRuleMatch[] => {
  const matches: PasteRuleMatch[] = [];

  for (const match of text.matchAll(PASTED_HTTP_URL_PATTERN)) {
    const raw = match[0] ?? "";
    const cleaned = cleanPastedHttpUrl(raw);
    if (!cleaned) continue;
    matches.push({
      text: cleaned,
      data: { href: cleaned },
      index: match.index ?? 0
    });
  }

  return matches;
};

const MARKDOWN_PASTE_BLOCK_PATTERN =
  /(^|\n)(#{1,6}\s+\S|>\s+\S|[-*+]\s+\S|\d+\.\s+\S|-\s+\[[ xX]\]\s+\S|```|~~~|\|.+\|(?:\n\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?)?|\$\$|\[\^[^\]]+]:\s+\S)/;
const MARKDOWN_PASTE_INLINE_PATTERN =
  /(\*\*[^*\n][\s\S]*?[^*\n]\*\*|__[^_\n][\s\S]*?[^_\n]__|`[^`\n]+`|!\[[^\]\n]*]\([^) \n]+(?:\s+["'][^"'\n]*["'])?\)|\[[^\]\n]+]\([^) \n]+(?:\s+["'][^"'\n]*["'])?\)|\[\[[^\]\n]+]])/;

const looksLikeMarkdownPaste = (text: string) => {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return false;
  if (cleanPastedHttpUrl(normalized) === normalized) return false;
  return MARKDOWN_PASTE_BLOCK_PATTERN.test(normalized) || MARKDOWN_PASTE_INLINE_PATTERN.test(normalized);
};

const inlineMarkdownLinkPattern = /(^|[^!])\[([^\]\n]+)\]\((\S+?)(?:\s+["']([^"'\n]*)["'])?\)$/;
const imageMarkdownPattern = /!\[([^\]\n]*)]\((\S+?)(?:\s+["']([^"'\n]*)["'])?\)$/;

const currentPlainParagraph = (editor: any) => {
  const { selection } = editor.state;
  if (!selection.empty) return null;
  const parent = selection.$from.parent;
  if (parent.type.name !== "paragraph") return null;
  if (selection.$from.parentOffset !== parent.content.size) return null;
  const from = selection.$from.before();
  const to = selection.$from.after();
  return { from, to, text: parent.textContent.trim() };
};

const sourceBlockContent = (source: string) => [{ type: "text", text: source }];

const htmlFromSelection = (editor: any, from: number, to: number) => {
  const serializer = (editor as any).serializer || (editor as any).view?.state?.schema;
  // Fallback: use ProseMirror DOMSerializer
  const { DOMSerializer } = require("@tiptap/pm/model");
  const serializerInstance = DOMSerializer.fromSchema(editor.state.schema);
  const container = document.createElement("div");
  container.appendChild(serializerInstance.serializeFragment(editor.state.doc.slice(from, to).content));
  return container.innerHTML;
};

const markdownFromSelection = (editor: any, from: number, to: number) => {
  const blockLike = !editor.state.doc.resolve(from).sameParent(editor.state.doc.resolve(to));
  if (!editor.markdown) return editor.state.doc.textBetween(from, to, "\n");
  const fragment = editor.state.doc.slice(from, to).content.toJSON();
  return editor.markdown.serialize({ type: "doc", content: fragment });
};

// tableJsonFromHeaderRow is in lib/markdown-block-parser
const isExplicitMarkdownTableRow = (line: string) => /^\|.*\|$/.test(line.trim());
const parseMarkdownTableRow = (line: string) => {
  const trimmed = line.trim();
  if (!trimmed.includes("|")) return null;
  const body = trimmed.replace(/^\|/, "").replace(/\|$/, "");
  const cells = body.split("|").map((cell) => cell.trim());
  return cells.length >= 2 ? cells : null;
};

const tableJsonFromHeaderRow = (headerLine: string): JSONContent | null => {
  if (!isExplicitMarkdownTableRow(headerLine)) return null;
  const header = parseMarkdownTableRow(headerLine);
  if (!header) return null;
  const paragraph = (text?: string): JSONContent => (text ? { type: "paragraph", content: [{ type: "text", text }] } : { type: "paragraph" });
  return {
    type: "table",
    content: [
      {
        type: "tableRow",
        content: header.map((cell) => ({
          type: "tableHeader",
          content: [paragraph(cell)]
        }))
      },
      {
        type: "tableRow",
        content: header.map(() => ({
          type: "tableCell",
          content: [paragraph()]
        }))
      }
    ]
  };
};

export const TyporaMarkdownInput = Extension.create({
  name: "typoraMarkdownInput",
  addInputRules() {
    return [
      new InputRule({
        find: imageMarkdownPattern,
        handler: ({ match, range, chain }) => {
          const alt = match[1] ?? "";
          const src = match[2]?.trim() ?? "";
          const title = match[3]?.trim() || alt;
          if (!src) return;
          chain()
            .deleteRange(range)
            .insertContentAt(range.from, { type: "image", attrs: { src, alt, title } })
            .createParagraphNear()
            .run();
        }
      }),
      new InputRule({
        find: inlineMarkdownLinkPattern,
        handler: ({ match, range, chain }) => {
          const prefix = match[1] ?? "";
          const text = match[2]?.trim() ?? "";
          const href = match[3]?.trim() ?? "";
          const title = match[4]?.trim();
          if (!text || !href) return;
          const from = range.from + prefix.length;
          chain()
            .deleteRange({ from, to: range.to })
            .insertContentAt(from, {
              type: "text",
              text,
              marks: [{ type: "link", attrs: { href, title: title || null } }]
            })
            .setTextSelection(from + text.length)
            .run();
        }
      }),
      new InputRule({
        find: /(^|[^`])`([^`\n]+)`$/,
        handler: ({ match, range, chain }) => {
          const prefix = match[1] ?? "";
          const text = match[2] ?? "";
          if (!text) return;
          const from = range.from + prefix.length;
          chain()
            .deleteRange({ from, to: range.to })
            .insertContentAt(from, { type: "text", text, marks: [{ type: "code" }] })
            .setTextSelection(from + text.length)
            .run();
        }
      })
    ];
  },
  addPasteRules() {
    return [
      markPasteRule({
        find: findPastedHttpUrlMatches,
        type: this.editor.schema.marks.link,
        getAttributes: (match) => ({
          href: match.data?.href
        })
      })
    ];
  },
  addProseMirrorPlugins() {
    const editor = this.editor as MarkdownParserEditor;

    return [
      new Plugin({
        props: {
          handleKeyDown(_view, event) {
            if (event.key !== "Enter" || event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return false;
            if (editor.view.composing) return false;

            const block = currentPlainParagraph(editor);
            if (!block || !block.text) return false;

            if (/^(?:---|\*\*\*)$/.test(block.text)) {
              event.preventDefault();
              editor
                .chain()
                .focus()
                .deleteRange({ from: block.from, to: block.to })
                .setHorizontalRule()
                .run();
              return true;
            }

            const codeFence = block.text.match(/^(```|~~~)([A-Za-z0-9_+.#-]*)\s*$/);
            if (codeFence) {
              event.preventDefault();
              const language = normalizeCodeLanguage(codeFence[2] || "plaintext");
              editor
                .chain()
                .focus()
                .deleteRange({ from: block.from, to: block.to })
                .insertContentAt(block.from, { type: "codeBlock", attrs: { language } })
                .setTextSelection(block.from + 1)
                .run();
              return true;
            }

            if (block.text === "$$") {
              event.preventDefault();
              const source = "$$\n\n$$";
              editor
                .chain()
                .focus()
                .deleteRange({ from: block.from, to: block.to })
                .insertContentAt(block.from, {
                  type: "mathBlock",
                  attrs: { source, focusKey: String(Date.now()) },
                  content: sourceBlockContent(source)
                })
                .setTextSelection(block.from + 1)
                .run();
              return true;
            }

            const table = tableJsonFromHeaderRow(block.text);
            if (table) {
              event.preventDefault();
              editor
                .chain()
                .focus()
                .deleteRange({ from: block.from, to: block.to })
                .insertContentAt(block.from, table)
                .setTextSelection(block.from + 4)
                .run();
              return true;
            }

            return false;
          },
          handlePaste(_view, event) {
            const clipboard = event.clipboardData;
            if (!clipboard) return false;

            const hasImageFile = Array.from(clipboard.files).some((file) => file.type.startsWith("image/"));
            if (hasImageFile) return false;

            const markdown = clipboard.getData("text/markdown");
            const text = clipboard.getData("text/plain");
            const html = clipboard.getData("text/html");
            if (markdown.trim() && editor.markdown) {
              event.preventDefault();
              editor.commands.insertContent(editor.markdown.parse(stripClipboardFragmentMarkers(markdown).trim()) as never);
              return true;
            }

            if (html) {
              const safeFragment = sanitizeHtmlFragmentForPaste(html);
              const plainText = clipboardPlainTextForPaste(text, html);
              if (!htmlFragmentHasContent(safeFragment) && !plainText) return false;
              event.preventDefault();
              if (htmlFragmentHasContent(safeFragment)) {
                const slice = ProseMirrorDOMParser.fromSchema(editor.state.schema).parseSlice(safeFragment);
                editor.view.dispatch(editor.state.tr.replaceSelection(slice).scrollIntoView());
              } else if (looksLikeMarkdownPaste(plainText) && editor.markdown) {
                editor.commands.insertContent(editor.markdown.parse(plainText) as never);
              } else {
                editor.commands.insertContent(plainText);
              }
              return true;
            }

            const plainText = clipboardPlainTextForPaste(text);
            if (!plainText || !looksLikeMarkdownPaste(plainText) || !editor.markdown) return false;

            event.preventDefault();
            editor.commands.insertContent(editor.markdown.parse(plainText) as never);
            return true;
          },
          handleDOMEvents: {
            copy(_view, event: ClipboardEvent) {
              const clipboard = event.clipboardData;
              const { from, to, empty } = editor.state.selection;
              if (!clipboard || empty) return false;

              event.preventDefault();
              const markdown = markdownFromSelection(editor, from, to);
              clipboard.setData("text/plain", markdown);
              clipboard.setData("text/markdown", markdown);
              clipboard.setData("text/html", htmlFromSelection(editor, from, to));
              return true;
            }
          }
        }
      })
    ];
  }
});
