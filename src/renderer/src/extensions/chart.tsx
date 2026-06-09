import { Node } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import type { ReactNodeViewProps } from "@tiptap/react";
import React, { useState, useEffect, useRef } from "react";
import type { MarkdownTokenLike, MarkdownHelperLike } from "../types";
import {
  sourceText, sourceContent, nodeSourceAttr, jsonSourceText, defaultBlockSource,
  chartLabels, sourceBackedBlockContent, replaceNodeWithPlainText, useNodeLivePreviewState, focusNodeSource
} from "../lib/markdown-block-parser";
import { cn } from "../lib/utils";

export function ChartPreview({ source }: { source: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    import("mermaid").then((mermaid) => {
      if (cancelled) return;
      mermaid.default.initialize({ startOnLoad: false, theme: "default", securityLevel: "loose" });
      const id = `mermaid-${Math.random().toString(36).slice(2)}`;
      mermaid.default.render(id, source).then(({ svg }) => {
        if (!cancelled && container) container.innerHTML = svg;
      }).catch(() => {
        if (!cancelled && container) container.textContent = source;
      });
    });
    return () => { cancelled = true; };
  }, [source]);
  return <div ref={containerRef} className="informio-chart-preview" />;
}

export const ChartBlock = Node.create({
  name: "chartBlock",
  group: "block",
  atom: true,
  selectable: true,
  addAttributes() {
    return { source: { default: "" }, text: { default: "" }, focusKey: { default: "" } };
  },
  markdownTokenizer: {
    name: "chartBlock",
    level: "block",
    start(src: string) { return src.match(/```mermaid/)?.index ?? -1; },
    tokenize(src: string) {
      const match = src.match(/^```mermaid\s*\n([\s\S]*?)\n```($|\n)/);
      if (!match) return undefined;
      return { type: "chartBlock", raw: match[0], text: match[1] };
    }
  },
  parseMarkdown(token: MarkdownTokenLike, h: MarkdownHelperLike) {
    const source = token.raw?.trim() ?? defaultBlockSource("chartBlock");
    return h.createNode("chartBlock", { text: token.text ?? "flowchart TD\n  A[Start] --> B[End]", source }, sourceContent(source, h));
  },
  renderHTML({ node }) {
    const source = String((node.attrs as { source?: string }).source ?? "");
    return ["div", { "data-chart-block": source }, source];
  },
  renderMarkdown(node) {
    const source = node.textContent !== "" ? (node.textContent ?? "") : nodeSourceAttr(node as any, "chartBlock");
    const labels = chartLabels(source);
    return `\n${jsonSourceText(node as any, "chartBlock")}\n`;
  },
  addNodeView() {
    return ReactNodeViewRenderer(({ editor, getPos, node, selected }: ReactNodeViewProps) => {
      const source = String(node.attrs.source ?? "");
      const [draftSource, setDraftSource] = useState(source);
      const [sourceFocused, setSourceFocused] = useState(false);
      const wrapperRef = useRef<HTMLDivElement | null>(null);
      const sourceRef = useRef<HTMLTextAreaElement | null>(null);
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
              className="w-full rounded border border-emerald-300 bg-white p-3 font-mono text-[13px] text-slate-800 outline-none resize-none"
              rows={4}
            />
          </NodeViewWrapper>
        );
      }

      return (
        <NodeViewWrapper
          ref={wrapperRef}
          className={cn("informio-chart-block cursor-text rounded transition-[box-shadow]", active && "ring-2 ring-emerald-400/50")}
          contentEditable={false}
          onClick={() => { setSourceFocused(true); focusNodeSource(editor, getPos); }}
        >
          <ChartPreview source={source} />
        </NodeViewWrapper>
      );
    });
  }
});
