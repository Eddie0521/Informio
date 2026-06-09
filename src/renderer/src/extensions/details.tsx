import { useState, useEffect, useRef } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from "react";
import type { Editor, JSONContent } from "@tiptap/core";
import { Node, mergeAttributes } from "@tiptap/core";
import type { ReactNodeViewProps } from "@tiptap/react";
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import type { MarkdownTokenLike, MarkdownHelperLike, NodeViewPositionGetter, NodeViewNode } from "../types";
import {
  sourceText,
  sourceContent,
  nodeSourceAttr,
  jsonSourceText,
  defaultBlockSource,
  sourceBackedBlockContent,
  replaceSourceBlockWithParagraph,
  isDiscardableSourceRemainder,
} from "../lib/markdown-block-parser";
import { plainText } from "../lib/markdown";
import { cn } from "../lib/utils";

const isSelectionInsideNode = (editor: Editor, getPos: NodeViewPositionGetter, node: NodeViewNode) => {
  const position = getPos();
  if (typeof position !== "number") return false;
  const from = position;
  const to = position + node.nodeSize;
  const selection = editor.state.selection;
  return selection.from > from && selection.to < to;
};

const useNodeLivePreviewState = (editor: Editor, getPos: NodeViewPositionGetter, node: NodeViewNode, selected: boolean) => {
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

const focusNodeSource = (editor: Editor, getPos: NodeViewPositionGetter) => {
  const position = getPos();
  if (typeof position !== "number") return;
  editor.chain().focus().setTextSelection(position + 1).run();
};

const editableSourceAttributes = () => ({
  source: { default: "" },
  focusKey: { default: "" }
});

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

export const DetailsBlock = Node.create({
  name: "detailsBlock",
  group: "block",
  content: "text*",
  marks: "",
  code: true,
  defining: true,
  addAttributes() {
    return {
      summary: { default: "Summary" },
      text: { default: "Content" },
      ...editableSourceAttributes()
    };
  },
  markdownTokenizer: {
    name: "detailsBlock",
    level: "block",
    start(src: string) {
      return (src.match(/^>\s*\[![A-Za-z0-9_-]+]-/m) ?? src.match(/^<details\b/im))?.index ?? -1;
    },
    tokenize(src: string) {
      const calloutMatch = src.match(/^>\s*\[!([A-Za-z0-9_-]+)]-\s*(.*?)\s*\n((?:>\s?.*(?:\n|$))+)/);
      if (calloutMatch) {
        return {
          type: "detailsBlock",
          raw: calloutMatch[0],
          summary: calloutMatch[2] || calloutMatch[1],
          text: calloutMatch[3]
            .split("\n")
            .map((line) => line.replace(/^>\s?/, ""))
            .join("\n")
            .trim()
        };
      }
      const match = src.match(/^<details(?:\s[^>]*)?>\s*<summary>([\s\S]*?)<\/summary>\s*([\s\S]*?)\s*<\/details>(?:\n|$)/i);
      if (!match) return undefined;
      return { type: "detailsBlock", raw: match[0], summary: plainText(match[1]), text: plainText(match[2]) };
    }
  },
  parseMarkdown(token: MarkdownTokenLike, h: MarkdownHelperLike) {
    const source = token.raw?.trim() ?? defaultBlockSource("detailsBlock");
    return h.createNode("detailsBlock", { summary: token.summary ?? "Summary", text: token.text ?? "Content", source }, sourceContent(source, h));
  },
  parseHTML() {
    return [{ tag: 'details[data-type="details-block"]' }, { tag: "details" }];
  },
  renderHTML({
    HTMLAttributes,
    node
  }: {
    HTMLAttributes: Record<string, unknown>;
    node: { attrs: { summary: string; text: string }; textContent?: string };
  }) {
    const source = node.textContent !== "" ? (node.textContent ?? "") : nodeSourceAttr(node, "detailsBlock");
    const details = detailsFromSource(source);
    return [
      "details",
      mergeAttributes(HTMLAttributes, { "data-type": "details-block", class: "informio-details-block", open: "true" }),
      ["summary", {}, details.summary],
      ["p", {}, details.text]
    ];
  },
  renderMarkdown(node: { attrs?: { summary?: string; text?: string } }) {
    const details = detailsFromSource(jsonSourceText(node as JSONContent, "detailsBlock"));
    const body = details.text.split("\n").map((line) => `> ${line}`).join("\n");
    return `\n> [!note]- ${details.summary || "Summary"}\n${body}\n`;
  },
  addNodeView() {
    return ReactNodeViewRenderer(EditableSourceBlockView);
  }
} as never);

function EditableSourceBlockView({ editor, getPos, node, selected, updateAttributes }: ReactNodeViewProps) {
  const focusKey = (node.attrs as { focusKey?: string }).focusKey;
  const savedSource = (node.attrs as { source?: string }).source;
  const active = useNodeLivePreviewState(editor, getPos, node, selected);
  const source = sourceText(node);
  const userEditedSourceRef = useRef(false);

  useEffect(() => {
    if (focusKey) {
      window.setTimeout(() => focusNodeSource(editor, getPos), 0);
    }
  }, [editor, focusKey, getPos]);

  useEffect(() => {
    if (active) userEditedSourceRef.current = true;
  }, [active]);

  useEffect(() => {
    const nextSource = node.textContent;
    if (nextSource.trim() === "") {
      const position = getPos();
      if (typeof position !== "number") return;
      if (savedSource && !userEditedSourceRef.current) {
        const tr = editor.state.tr.replaceWith(position + 1, position + node.nodeSize - 1, editor.schema.text(savedSource));
        editor.view.dispatch(tr);
        return;
      }
      replaceSourceBlockWithParagraph(editor, getPos, node);
      return;
    }
    if (savedSource === nextSource && !focusKey) return;
    updateAttributes({ source: nextSource, focusKey: "" });
  }, [editor, focusKey, getPos, node.nodeSize, node.textContent, savedSource, updateAttributes]);

  return (
    <NodeViewWrapper
      className={cn("informio-source-block", active && "is-editing")}
      onKeyDownCapture={(event: ReactKeyboardEvent) => {
        if (!active || (event.key !== "Backspace" && event.key !== "Delete")) return;
        if (!isDiscardableSourceRemainder(node.type.name, node.textContent)) return;
        event.preventDefault();
        replaceSourceBlockWithParagraph(editor, getPos, node);
      }}
      onMouseDown={(event: ReactMouseEvent) => {
        if (active) return;
        event.preventDefault();
        focusNodeSource(editor, getPos);
      }}
    >
      <NodeViewContent as={"pre" as "div"} className={cn("informio-plain-source-content", !active && "is-hidden-source-content")} />
      {!active ? (
        <div className="informio-source-preview" contentEditable={false}>
          <DetailsBlockPreview source={source} />
        </div>
      ) : null}
    </NodeViewWrapper>
  );
}

function DetailsBlockPreview({ source }: { source: string }) {
  const details = detailsFromSource(source);
  return (
    <details className="informio-details-preview" open>
      <summary>{details.summary}</summary>
      <p>{details.text}</p>
    </details>
  );
}
