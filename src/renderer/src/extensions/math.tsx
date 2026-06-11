import { useState, useEffect, useLayoutEffect, useRef } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from "react";
import type { Editor, JSONContent } from "@tiptap/core";
import { Node, InputRule, mergeAttributes } from "@tiptap/core";
import type { ReactNodeViewProps } from "@tiptap/react";
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import katex from "katex";
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
  normalizeCodeLanguage,
} from "../lib/markdown-block-parser";
import { cn } from "../lib/utils";

const INLINE_MATH_BOUNDARY = String.raw`(?=$|[\s,.;:!?，。；：！？、)\]）】」』》])`;
const INLINE_MATH_TOKEN_REGEX = new RegExp(String.raw`^\$(?!\$)([^\n$]+?)\$(?!\$)` + INLINE_MATH_BOUNDARY);
const INLINE_MATH_INPUT_WITH_PUNCTUATION_REGEX = /(^|[^\$])\$([^\n$]+?)\$([,.;:!?，。；：！？、)\]）】」』》])$/;
const isSkippableInlineMathContent = (content: string) => !content || /^\d+(?:\.\d+)?$/.test(content);

export const mathTextFromSource = (source: string) => {
  const trimmed = source.trim();
  const match =
    trimmed.match(/^\$\$\s*\n?([\s\S]*?)\n?\$\$$/) ??
    trimmed.match(/^\$(?!\$)([^\n$]+?)\$(?!\$)/);
  return (match?.[1] ?? source).trim();
};

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

export function MathPreview({ source }: { source: string }) {
  try {
    const html = katex.renderToString(mathTextFromSource(source), { displayMode: true, throwOnError: false });
    return <div className="informio-formula" dangerouslySetInnerHTML={{ __html: html }} />;
  } catch (error) {
    return <div className="informio-block-error">{error instanceof Error ? error.message : String(error)}</div>;
  }
}

export function MathInlineView({ editor, getPos, node, selected, updateAttributes }: ReactNodeViewProps) {
  const active = useNodeLivePreviewState(editor, getPos, node, selected);
  const source = sourceText(node);
  const formula = mathTextFromSource(source);
  const moveOutAtSourceEdge = (event: ReactKeyboardEvent) => {
    if (event.key === "Enter") {
      const position = getPos();
      if (typeof position !== "number") return;
      event.preventDefault();
      editor.chain().focus().setTextSelection(position + node.nodeSize).run();
      return;
    }
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    const selection = window.getSelection();
    if (!selection || !selection.isCollapsed) return;
    const sourceLength = source.length;
    const atStart = selection.anchorOffset === 0;
    const atEnd = selection.anchorOffset >= sourceLength;
    if ((event.key === "ArrowLeft" && !atStart) || (event.key === "ArrowRight" && !atEnd)) return;
    const position = getPos();
    if (typeof position !== "number") return;
    event.preventDefault();
    editor
      .chain()
      .focus()
      .setTextSelection(event.key === "ArrowLeft" ? position : position + node.nodeSize)
      .run();
  };

  if (active) {
    return (
      <NodeViewWrapper as="span" className="informio-math-inline is-editing" onKeyDownCapture={moveOutAtSourceEdge}>
        <NodeViewContent as={"span" as "div"} className="informio-inline-source-content" />
      </NodeViewWrapper>
    );
  }

  try {
    const html = katex.renderToString(formula, { displayMode: false, throwOnError: false });
    return (
      <NodeViewWrapper
        as="span"
        className="informio-math-inline"
        onMouseDown={(event: ReactMouseEvent) => {
          event.preventDefault();
          focusNodeSource(editor, getPos);
        }}
      >
        <NodeViewContent as={"span" as "div"} className="informio-inline-source-content is-hidden-source-content" />
        <span contentEditable={false} dangerouslySetInnerHTML={{ __html: html }} />
      </NodeViewWrapper>
    );
  } catch (error) {
    console.warn("Failed to parse math expression:", error);
    return (
      <NodeViewWrapper
        as="span"
        className="informio-math-inline"
        onMouseDown={(event: ReactMouseEvent) => {
          event.preventDefault();
          focusNodeSource(editor, getPos);
        }}
      >
        <NodeViewContent as={"span" as "div"} className="informio-inline-source-content is-hidden-source-content" />
        <span contentEditable={false}>{formula}</span>
      </NodeViewWrapper>
    );
  }
}

export const MathInline = Node.create({
  name: "mathInline",
  group: "inline",
  inline: true,
  content: "text*",
  marks: "",
  addAttributes() {
    return { source: { default: "$x$" } };
  },
  markdownTokenizer: {
    name: "mathInline",
    level: "inline",
    start(src: string) {
      const match = /(^|[^\$])\$(?!\$)/.exec(src);
      return match ? match.index + match[1].length : -1;
    },
    tokenize(src: string) {
      const match = src.match(INLINE_MATH_TOKEN_REGEX);
      if (!match) return undefined;
      return { type: "mathInline", raw: match[0], text: match[1].trim() };
    }
  },
  parseMarkdown(token: MarkdownTokenLike, h: MarkdownHelperLike) {
    const source = token.raw ?? `$${token.text ?? "x"}$`;
    return h.createNode("mathInline", { source }, sourceContent(source, h));
  },
  parseHTML() {
    return [{ tag: 'span[data-type="math-inline"]' }];
  },
  renderHTML({ HTMLAttributes, node }: { HTMLAttributes: Record<string, unknown>; node: { attrs: { source: string }; textContent?: string } }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, { "data-type": "math-inline", class: "informio-math-inline" }),
      mathTextFromSource(node.textContent !== "" ? (node.textContent ?? "") : nodeSourceAttr(node, "mathInline"))
    ];
  },
  renderMarkdown(node: { attrs?: { source?: string } }) {
    return jsonSourceText(node as JSONContent, "mathInline");
  },
  addInputRules() {
    const applyInlineMath = ({
      match,
      range,
      chain,
      trailingText = ""
    }: {
      match: RegExpMatchArray;
      range: { from: number; to: number };
      chain: () => ReturnType<Editor["chain"]>;
      trailingText?: string;
    }) => {
      const prefix = match[1] ?? "";
      const content = match[2]?.trim() ?? "";
      if (isSkippableInlineMathContent(content)) return;
      const source = `$${match[2]}$`;
      const from = range.from + prefix.length;
      const insertion = trailingText
        ? [{ type: "mathInline", attrs: { source }, content: [{ type: "text", text: source }] }, { type: "text", text: trailingText }]
        : { type: "mathInline", attrs: { source }, content: [{ type: "text", text: source }] };
      chain()
        .deleteRange({ from, to: range.to })
        .insertContent(insertion as never)
        .setTextSelection(from + source.length + 2 + trailingText.length)
        .run();
    };

    return [
      new InputRule({
        find: /(^|[^\$])\$([^\n$]+?)\$$/,
        handler: ({ match, range, chain }) => {
          applyInlineMath({ match, range, chain });
        }
      }),
      new InputRule({
        find: INLINE_MATH_INPUT_WITH_PUNCTUATION_REGEX,
        handler: ({ match, range, chain }) => {
          applyInlineMath({ match, range, chain, trailingText: match[3] ?? "" });
        }
      })
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(MathInlineView);
  }
} as never);

export const MathBlock = Node.create({
  name: "mathBlock",
  group: "block",
  content: "text*",
  marks: "",
  code: true,
  defining: true,
  addAttributes() {
    return { text: { default: "E = mc^2" }, ...editableSourceAttributes() };
  },
  markdownTokenizer: {
    name: "mathBlock",
    level: "block",
    start(src: string) {
      return src.match(/^\$\$/m)?.index ?? -1;
    },
    tokenize(src: string) {
      const match = src.match(/^\$\$\s*\n?([\s\S]+?)\n?\$\$(?:\n|$)/);
      if (!match) return undefined;
      return { type: "mathBlock", raw: match[0], text: match[1].trim() };
    }
  },
  parseMarkdown(token: MarkdownTokenLike, h: MarkdownHelperLike) {
    const source = token.raw?.trim() ?? defaultBlockSource("mathBlock");
    return h.createNode("mathBlock", { text: token.text ?? "E = mc^2", source }, sourceContent(source, h));
  },
  parseHTML() {
    return [{ tag: 'div[data-type="math-block"]' }];
  },
  renderHTML({ HTMLAttributes, node }: { HTMLAttributes: Record<string, unknown>; node: { attrs: { text: string }; textContent?: string } }) {
    const source = node.textContent !== "" ? (node.textContent ?? "") : nodeSourceAttr(node, "mathBlock");
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "math-block", class: "informio-math-block" }),
      ["span", { class: "informio-block-label" }, "Formula"],
      ["div", { class: "informio-formula" }, mathTextFromSource(source)]
    ];
  },
  renderMarkdown(node: { attrs?: { text?: string } }) {
    return `\n${jsonSourceText(node as JSONContent, "mathBlock")}\n`;
  },
  addNodeView() {
    return ReactNodeViewRenderer(EditableSourceBlockView);
  },
  addInputRules() {
    return [
      new InputRule({
        find: /^\$\$([^\n$]+?)\$\$$/,
        handler: ({ match, range, chain }) => {
          const source = match[0];
          chain()
            .deleteRange(range)
            .insertContent({ type: "mathBlock", attrs: { source }, content: [{ type: "text", text: source }] })
            .setTextSelection(range.from + 1 + source.length)
            .run();
        }
      })
    ];
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
          <MathPreview source={source} />
        </div>
      ) : null}
    </NodeViewWrapper>
  );
}
