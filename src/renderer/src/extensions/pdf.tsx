import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import type { MarkdownTokenLike, MarkdownHelperLike } from "../types";
import { parseHtmlAttr } from "../lib/markdown";
import { PdfBlockView as UnifiedPdfBlockView } from "../pdfSurface";

export const PdfBlock = Node.create({
  name: "pdfBlock",
  group: "block",
  atom: true,
  selectable: false,
  draggable: false,
  addAttributes() {
    return {
      src: { default: "" },
      title: { default: "PDF" }
    };
  },
  markdownTokenizer: {
    name: "pdfBlock",
    level: "block",
    start(src: string) {
      return src.match(/^<iframe\b/im)?.index ?? -1;
    },
    tokenize(src: string) {
      const match = src.match(/^<iframe\b([^>]*)><\/iframe>(?:\n|$)/i);
      if (!match || parseHtmlAttr(match[1], "data-type") !== "pdf") return undefined;
      return {
        type: "pdfBlock",
        raw: match[0],
        src: parseHtmlAttr(match[1], "src"),
        title: parseHtmlAttr(match[1], "title") || "PDF"
      };
    }
  },
  parseMarkdown(token: MarkdownTokenLike, h: MarkdownHelperLike) {
    return h.createNode("pdfBlock", { src: token.src ?? "", title: token.title ?? "PDF" }, []);
  },
  parseHTML() {
    return [{ tag: 'iframe[data-type="pdf"]' }];
  },
  renderHTML({ HTMLAttributes, node }: { HTMLAttributes: Record<string, unknown>; node: { attrs: { src: string; title: string } } }) {
    return [
      "iframe",
      mergeAttributes(HTMLAttributes, {
        "data-type": "pdf",
        src: node.attrs.src,
        title: node.attrs.title
      })
    ];
  },
  renderMarkdown(node: { attrs?: { src?: string; title?: string } }) {
    const title = (node.attrs?.title ?? "PDF").replace(/[\[\]\n]/g, " ").trim() || "PDF";
    const src = node.attrs?.src ?? "";
    return `\n[${title}](${src})\n`;
  },
  addNodeView() {
    return ReactNodeViewRenderer(UnifiedPdfBlockView);
  }
} as never);
