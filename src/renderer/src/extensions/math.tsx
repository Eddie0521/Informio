import { Node } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import type { ReactNodeViewProps } from "@tiptap/react";
import React, { useState, useEffect, useLayoutEffect, useRef } from "react";
import katex from "katex";
import type { MarkdownTokenLike, MarkdownHelperLike, NodeViewPositionGetter, NodeViewNode } from "../types";
import {
  sourceText, sourceContent, nodeSourceAttr, jsonSourceText, defaultBlockSource,
  sourceBackedBlockContent, normalizeCodeLanguage, replaceNodeWithPlainText, useNodeLivePreviewState, focusNodeSource
} from "../lib/markdown-block-parser";
import { cn } from "../lib/utils";

export const mathTextFromSource = (source: string) => {
  const trimmed = source.trim();
  const match =
    trimmed.match(/^\$\$\s*\n?([\s\S]*?)\n?\$\$$/) ??
    trimmed.match(/^\$(?!\$)([^\n$]+?)\$(?!\$)/);
  return (match?.[1] ?? source).trim();
};

export function MathPreview({ source }: { source: string }) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const text = mathTextFromSource(source);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    try {
      katex.render(text, container, { displayMode: false, throwOnError: false });
    } catch {
      container.textContent = text;
    }
  }, [text]);
  return <span ref={containerRef} className="informio-math-preview" />;
}

export function MathInlineView({ editor, getPos, node, selected, updateAttributes }: ReactNodeViewProps) {
  const source = String(node.attrs.source ?? "");
  const focusKey = String(node.attrs.focusKey ?? "");
  const [draftSource, setDraftSource] = useState(source);
  const [sourceFocused, setSourceFocused] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const sourceRef = useRef<HTMLInputElement | null>(null);
  const didAutoFocusRef = useRef(false);
  const active = useNodeLivePreviewState(editor, getPos, node, selected);

  useEffect(() => {
    if (sourceFocused) return;
    setDraftSource(source);
  }, [source, sourceFocused]);

  useEffect(() => {
    if (!sourceFocused) return;
    const handlePointerDown = (event: PointerEvent) => {
      const wrapper = wrapperRef.current;
      if (!wrapper || !(event.target instanceof globalThis.Node) || wrapper.contains(event.target)) return;
      const trimmed = draftSource.trim();
      if (trimmed && trimmed !== source) updateAttributes({ source: trimmed, focusKey: "" });
      setSourceFocused(false);
      sourceRef.current?.blur();
    };
    window.addEventListener("pointerdown", handlePointerDown, true);
    return () => window.removeEventListener("pointerdown", handlePointerDown, true);
  }, [draftSource, source, sourceFocused, updateAttributes]);

  useEffect(() => {
    if (focusKey && !sourceFocused) setSourceFocused(true);
  }, [focusKey, sourceFocused]);

  useEffect(() => {
    if (!sourceFocused) {
      didAutoFocusRef.current = false;
      return;
    }
    if (didAutoFocusRef.current) return;
    didAutoFocusRef.current = true;
    window.setTimeout(() => {
      sourceRef.current?.focus();
      sourceRef.current?.select();
    }, 0);
  }, [sourceFocused]);

  const blurIfFocusLeft = () => {
    window.setTimeout(() => {
      const wrapper = wrapperRef.current;
      const activeElement = document.activeElement;
      if (wrapper && activeElement && wrapper.contains(activeElement)) return;
      const trimmed = draftSource.trim();
      if (trimmed && trimmed !== source) updateAttributes({ source: trimmed, focusKey: "" });
      setSourceFocused(false);
    }, 0);
  };

  if (sourceFocused) {
    return (
      <NodeViewWrapper as="span" className="inline" ref={wrapperRef}>
        <input
          ref={sourceRef}
          type="text"
          value={draftSource}
          onChange={(event) => setDraftSource(event.target.value)}
          onBlur={blurIfFocusLeft}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              const trimmed = draftSource.trim();
              if (trimmed && trimmed !== source) updateAttributes({ source: trimmed, focusKey: "" });
              setSourceFocused(false);
              editor.commands.focus();
            }
          }}
          className="inline-block w-32 rounded border border-emerald-300 bg-white px-1.5 py-0.5 font-mono text-[12px] text-slate-800 outline-none"
        />
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper
      as="span"
      ref={wrapperRef}
      className={cn("inline cursor-text rounded px-0.5 transition-[box-shadow]", active && "ring-2 ring-emerald-400/50")}
      contentEditable={false}
      onClick={() => {
        setSourceFocused(true);
        focusNodeSource(editor, getPos);
      }}
    >
      <MathPreview source={source} />
    </NodeViewWrapper>
  );
}

export const MathInline = Node.create({
  name: "mathInline",
  group: "inline",
  inline: true,
  atom: true,
  addAttributes() {
    return { source: { default: "" }, focusKey: { default: "" } };
  },
  markdownTokenizer: {
    name: "mathInline",
    level: "inline",
    start(src: string) { return src.match(/\$/)?.index ?? -1; },
    tokenize(src: string) {
      const match = src.match(/^\$(?!\$)([^\n$]+?)\$(?!\$)/);
      if (!match) return undefined;
      return { type: "mathInline", raw: match[0], text: match[1] };
    }
  },
  parseMarkdown(token: MarkdownTokenLike, h: MarkdownHelperLike) {
    const source = token.text ?? "";
    return h.createNode("mathInline", { source }, sourceContent(source, h));
  },
  renderHTML({ node }) {
    const source = String((node.attrs as { source?: string }).source ?? "");
    return ["span", { "data-math-inline": source }, source];
  },
  renderMarkdown(node) {
    const text = mathTextFromSource(node.textContent !== "" ? (node.textContent ?? "") : nodeSourceAttr(node as any, "mathInline"));
    return `$${text}$`;
  },
  addNodeView() {
    return ReactNodeViewRenderer(MathInlineView);
  }
});

export const MathBlock = Node.create({
  name: "mathBlock",
  group: "block",
  atom: true,
  selectable: true,
  addAttributes() {
    return { source: { default: "" }, text: { default: "" }, focusKey: { default: "" } };
  },
  markdownTokenizer: {
    name: "mathBlock",
    level: "block",
    start(src: string) { return src.match(/\$\$/)?.index ?? -1; },
    tokenize(src: string) {
      const match = src.match(/^\$\$\s*\n?([\s\S]*?)\n?\$\$($|\n)/);
      if (!match) return undefined;
      return { type: "mathBlock", raw: match[0], text: match[1] };
    }
  },
  parseMarkdown(token: MarkdownTokenLike, h: MarkdownHelperLike) {
    const source = token.raw?.trim() ?? defaultBlockSource("mathBlock");
    return h.createNode("mathBlock", { text: token.text ?? "E = mc^2", source }, sourceContent(source, h));
  },
  renderHTML({ node }) {
    const source = String((node.attrs as { source?: string }).source ?? "");
    return ["div", { "data-math-block": source }, source];
  },
  renderMarkdown(node) {
    const source = node.textContent !== "" ? (node.textContent ?? "") : nodeSourceAttr(node as any, "mathBlock");
    return `\n${jsonSourceText(node as any, "mathBlock")}\n`;
  },
  addNodeView() {
    return ReactNodeViewRenderer(({ editor, getPos, node, selected }: ReactNodeViewProps) => {
      const source = String(node.attrs.source ?? "");
      const focusKey = String(node.attrs.focusKey ?? "");
      const [draftSource, setDraftSource] = useState(source);
      const [sourceFocused, setSourceFocused] = useState(false);
      const wrapperRef = useRef<HTMLDivElement | null>(null);
      const sourceRef = useRef<HTMLTextAreaElement | null>(null);
      const active = useNodeLivePreviewState(editor, getPos, node, selected);

      useEffect(() => {
        if (sourceFocused) return;
        setDraftSource(source);
      }, [source, sourceFocused]);

      useLayoutEffect(() => {
        const textarea = sourceRef.current;
        if (!textarea || !sourceFocused) return;
        textarea.style.height = "auto";
        textarea.style.height = `${textarea.scrollHeight}px`;
      }, [sourceFocused, draftSource]);

      useEffect(() => {
        if (!sourceFocused) return;
        const handlePointerDown = (event: PointerEvent) => {
          const wrapper = wrapperRef.current;
          if (!wrapper || !(event.target instanceof globalThis.Node) || wrapper.contains(event.target)) return;
          const trimmed = draftSource.trim();
          if (trimmed && trimmed !== source) updateAttributes({ source: trimmed, focusKey: "" });
          setSourceFocused(false);
          sourceRef.current?.blur();
        };
        window.addEventListener("pointerdown", handlePointerDown, true);
        return () => window.removeEventListener("pointerdown", handlePointerDown, true);
      }, [draftSource, source, sourceFocused]);

      useEffect(() => {
        if (!sourceFocused) return;
        window.setTimeout(() => {
          sourceRef.current?.focus();
          sourceRef.current?.select();
        }, 0);
      }, [sourceFocused]);

      const blurIfFocusLeft = () => {
        window.setTimeout(() => {
          const wrapper = wrapperRef.current;
          const activeElement = document.activeElement;
          if (wrapper && activeElement && wrapper.contains(activeElement)) return;
          const trimmed = draftSource.trim();
          if (trimmed && trimmed !== source) updateAttributes({ source: trimmed, focusKey: "" });
          setSourceFocused(false);
        }, 0);
      };

      if (sourceFocused) {
        return (
          <NodeViewWrapper ref={wrapperRef} className="relative">
            <textarea
              ref={sourceRef}
              value={draftSource}
              onChange={(event) => setDraftSource(event.target.value)}
              onBlur={blurIfFocusLeft}
              className="w-full rounded border border-emerald-300 bg-white p-3 font-mono text-[13px] text-slate-800 outline-none resize-none overflow-hidden"
              rows={3}
            />
          </NodeViewWrapper>
        );
      }

      const text = mathTextFromSource(source);
      let html = "";
      try { html = katex.renderToString(text, { displayMode: true, throwOnError: false }); } catch { html = `<code>${source}</code>`; }

      return (
        <NodeViewWrapper
          ref={wrapperRef}
          className={cn("informio-math-block cursor-text rounded transition-[box-shadow]", active && "ring-2 ring-emerald-400/50")}
          contentEditable={false}
          onClick={() => { setSourceFocused(true); focusNodeSource(editor, getPos); }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      );
    });
  }
});
