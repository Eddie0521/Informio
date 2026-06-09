import { Node, InputRule, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import type { ReactNodeViewProps } from "@tiptap/react";
import React from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import type { WikiLinkOptions, MarkdownTokenLike, MarkdownHelperLike } from "../types";
import { resolveWikiLink, parseWikiLinkBody, wikiLinkText, buildDocumentLookupIndex } from "../lib/markdown-block-parser";
import { cn } from "../lib/utils";

function WikiLinkView({ node, extension }: ReactNodeViewProps) {
  const options = extension.options as WikiLinkOptions;
  const target = String((node.attrs as { target?: string }).target ?? "");
  const alias = String((node.attrs as { alias?: string }).alias ?? "");
  const resolved = resolveWikiLink(target, options.documentLookupIndex, options.currentDocument);
  const label = alias || target;

  return (
    <NodeViewWrapper
      as="span"
      className={cn("informio-wikilink", resolved ? "is-resolved" : "is-unresolved")}
      data-target={target}
      contentEditable={false}
      onMouseDown={(event: ReactMouseEvent) => {
        if (!event.metaKey && !event.ctrlKey) return;
        event.preventDefault();
        if (resolved) options.onOpen(resolved.id);
        else options.onCreate(target);
      }}
    >
      {label}
    </NodeViewWrapper>
  );
}

export const WikiLink = Node.create<WikiLinkOptions>({
  name: "wikiLink",
  group: "inline",
  inline: true,
  atom: true,
  addOptions() {
    return {
      documentLookupIndex: buildDocumentLookupIndex([]),
      currentDocument: undefined,
      onOpen: () => undefined,
      onCreate: () => undefined
    };
  },
  addAttributes() {
    return {
      target: { default: "" },
      alias: { default: "" }
    };
  },
  markdownTokenizer: {
    name: "wikiLink",
    level: "inline",
    start(src: string) {
      return src.match(/\[\[/)?.index ?? -1;
    },
    tokenize(src: string) {
      const match = src.match(/^\[\[([^\]\n]+)\]\]/);
      if (!match) return undefined;
      const parsed = parseWikiLinkBody(match[1]);
      return { type: "wikiLink", raw: match[0], title: parsed.target, text: parsed.alias ?? "" };
    }
  },
  parseMarkdown(token: MarkdownTokenLike, h: MarkdownHelperLike) {
    return h.createNode("wikiLink", { target: token.title ?? "", alias: token.text ?? "" }, []);
  },
  parseHTML() {
    return [{ tag: 'span[data-type="wiki-link"]' }];
  },
  renderHTML({ HTMLAttributes, node }: { HTMLAttributes: Record<string, unknown>; node: { attrs: { target: string; alias?: string } } }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-type": "wiki-link",
        "data-target": node.attrs.target,
        class: "informio-wikilink"
      }),
      node.attrs.alias || node.attrs.target
    ];
  },
  renderMarkdown(node: { attrs?: { target?: string; alias?: string } }) {
    return wikiLinkText(node.attrs?.target ?? "", node.attrs?.alias || undefined);
  },
  addInputRules() {
    return [
      new InputRule({
        find: /\[\[([^\]\n]+)\]\]$/,
        handler: ({ match, range, chain }) => {
          const parsed = parseWikiLinkBody(match[1]);
          chain().deleteRange(range).insertContent({ type: "wikiLink", attrs: { target: parsed.target, alias: parsed.alias ?? "" } }).run();
        }
      })
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(WikiLinkView);
  }
} as never);
