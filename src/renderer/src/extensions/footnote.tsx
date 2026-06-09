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

const footnoteFromSource = (source: string) => {
  const match = source.trim().match(/^\[\^([^\]]+)]:\s*([\s\S]*)$/);
  return { index: match?.[1] ?? "1", text: match?.[2]?.trim() ?? source.trim() };
};

export const FootnoteBlock = Node.create({
  name: "footnoteBlock",
  group: "block",
  content: "text*",
  marks: "",
  code: true,
  defining: true,
  addAttributes() {
    return {
      index: { default: "1" },
      text: { default: "Footnote" },
      ...editableSourceAttributes()
    };
  },
  markdownTokenizer: {
    name: "footnoteBlock",
    level: "block",
    start(src: string) {
      return src.match(/^\[\^[^\]]+]:/m)?.index ?? -1;
    },
    tokenize(src: string) {
      const match = src.match(/^\[\^([^\]]+)]:\s*(.*)(?:\n|$)/);
      if (!match) return undefined;
      return { type: "footnoteBlock", raw: match[0], index: match[1], text: match[2].trim() };
    }
  },
  parseMarkdown(token: MarkdownTokenLike, h: MarkdownHelperLike) {
    const source = token.raw?.trim() ?? defaultBlockSource("footnoteBlock");
    return h.createNode("footnoteBlock", { index: token.index ?? "1", text: token.text ?? "Footnote", source }, sourceContent(source, h));
  },
  parseHTML() {
    return [{ tag: 'section[data-type="footnote-block"]' }];
  },
  renderHTML({
    HTMLAttributes,
    node
  }: {
    HTMLAttributes: Record<string, unknown>;
    node: { attrs: { index: string; text: string }; textContent?: string };
  }) {
    const source = node.textContent !== "" ? (node.textContent ?? "") : nodeSourceAttr(node, "footnoteBlock");
    const footnote = footnoteFromSource(source);
    return [
      "section",
      mergeAttributes(HTMLAttributes, { "data-type": "footnote-block", class: "informio-footnote-block" }),
      ["sup", {}, footnote.index],
      ["span", {}, footnote.text]
    ];
  },
  renderMarkdown(node: { attrs?: { index?: string; text?: string } }) {
    return `\n${jsonSourceText(node as JSONContent, "footnoteBlock")}\n`;
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
          <FootnoteBlockPreview source={source} />
        </div>
      ) : null}
    </NodeViewWrapper>
  );
}

function FootnoteBlockPreview({ source }: { source: string }) {
  const footnote = footnoteFromSource(source);
  return (
    <div className="informio-footnote-preview">
      <sup>{footnote.index}</sup>
      <span>{footnote.text}</span>
    </div>
  );
}
